import { Router } from "express";
import { supabaseAdmin } from "../lib/supabase.js";
import type { Request, Response } from "express";
import crypto from "crypto";

const router = Router();
const PROCESSING_FEE = 50;

function verifyPaystackSignature(body: string, signature: string, secret: string): boolean {
  const hash = crypto.createHmac("sha512", secret).update(body).digest("hex");
  return hash === signature;
}

// POST /api/webhooks/paystack — raw body needed for signature verification
router.post("/webhooks/paystack", async (req: Request, res: Response) => {
  try {
    const signature = req.headers["x-paystack-signature"] as string;
    const event = req.body as {
      event: string;
      data: {
        reference: string;
        amount: number;
        customer?: { email?: string };
        metadata?: { user_id?: string };
      };
    };

    const { data: settings } = await supabaseAdmin
      .from("system_settings")
      .select("paystack_secret_key")
      .eq("id", 1)
      .single();

    const paystackSecret =
      settings?.paystack_secret_key ||
      process.env["PAYSTACK_SECRET_KEY"] ||
      "";

    if (paystackSecret && signature) {
      const rawBody = JSON.stringify(req.body);
      const valid = verifyPaystackSignature(rawBody, signature, paystackSecret);
      if (!valid) {
        res.status(401).json({ error: "Invalid signature" });
        return;
      }
    }

    if (event.event !== "charge.success") {
      res.json({ success: true });
      return;
    }

    const { reference, amount: paystackAmount } = event.data;
    const amountInNaira = paystackAmount / 100;
    const walletCredit = amountInNaira - PROCESSING_FEE;

    if (walletCredit <= 0) {
      req.log.warn({ reference, amountInNaira }, "Payment amount too small to credit wallet");
      res.json({ success: true });
      return;
    }

    const { data: funding } = await supabaseAdmin
      .from("wallet_fundings")
      .select("*")
      .eq("reference", reference)
      .eq("status", "pending")
      .single();

    if (!funding) {
      req.log.warn({ reference }, "No pending funding found for reference");
      res.json({ success: true });
      return;
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("wallet_balance")
      .eq("id", funding.user_id)
      .single();

    const newBalance = (profile?.wallet_balance || 0) + walletCredit;

    await supabaseAdmin
      .from("profiles")
      .update({ wallet_balance: newBalance })
      .eq("id", funding.user_id);

    await supabaseAdmin
      .from("wallet_fundings")
      .update({ status: "completed", amount: walletCredit })
      .eq("reference", reference);

    req.log.info(
      { reference, userId: funding.user_id, walletCredit, newBalance },
      "Wallet funded via Paystack webhook"
    );

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Paystack webhook error");
    res.status(500).json({ error: "Webhook processing failed" });
  }
});

// POST /api/webhooks/supabase-auth
// Fired by Supabase Auth webhook when a new user signs up.
// Set this URL in: Supabase Dashboard → Authentication → Hooks → "Send email" or
// use a Database Webhook on INSERT to auth.users (via pg_net / Edge Function).
// Recommended: Supabase Dashboard → Project Settings → API → Webhooks → auth events
router.post("/webhooks/supabase-auth", async (req: Request, res: Response) => {
  try {
    // Verify the webhook secret so only Supabase can call this endpoint
    const webhookSecret = process.env["SUPABASE_WEBHOOK_SECRET"];
    if (webhookSecret) {
      const authHeader = req.headers["authorization"] as string | undefined;
      const token = authHeader?.replace("Bearer ", "");
      if (token !== webhookSecret) {
        req.log.warn("Supabase auth webhook: invalid secret");
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
    }

    // Supabase sends the event type and user record
    const body = req.body as {
      type?: string;
      event?: string;
      record?: {
        id: string;
        email: string;
        raw_user_meta_data?: {
          full_name?: string;
          username?: string;
          phone?: string;
          address?: string;
        };
      };
      // Supabase Hook payload shape
      user?: {
        id: string;
        email: string;
        user_metadata?: {
          full_name?: string;
          username?: string;
          phone?: string;
          address?: string;
        };
      };
    };

    // Support both Database Webhook shape (record) and Auth Hook shape (user)
    const user = body.user ?? body.record;
    const eventType = body.type ?? body.event ?? "";

    if (!user?.id) {
      req.log.warn({ body }, "Supabase auth webhook: no user in payload");
      res.json({ success: true });
      return;
    }

    // Only act on INSERT / signup events
    const isSignup =
      eventType === "INSERT" ||
      eventType === "signup" ||
      eventType === "" || // some hook shapes omit the type on signup
      eventType === "user.created";

    if (!isSignup) {
      req.log.info({ eventType }, "Supabase auth webhook: ignoring non-signup event");
      res.json({ success: true });
      return;
    }

    const meta = user.user_metadata ?? (body.record as any)?.raw_user_meta_data ?? {};

    // Upsert the profile row — safe to call even if Register.tsx already created it
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .upsert(
        {
          id: user.id,
          email: user.email ?? "",
          full_name: meta.full_name ?? "",
          username: meta.username ?? "",
          phone: meta.phone ?? "",
          address: meta.address ?? "",
          wallet_balance: 0,
        },
        { onConflict: "id" }
      );

    if (profileError) {
      req.log.error({ profileError, userId: user.id }, "Failed to upsert profile on signup");
      // Still return 200 so Supabase doesn't keep retrying
      res.json({ success: false, error: profileError.message });
      return;
    }

    req.log.info({ userId: user.id, email: user.email }, "New user profile created via auth webhook");

    // Optional: send a welcome email via Brevo if configured
    try {
      const { data: settings } = await supabaseAdmin
        .from("system_settings")
        .select("brevo_api_key, brevo_sender_email, brevo_sender_name")
        .eq("id", 1)
        .single();

      if (settings?.brevo_api_key && user.email) {
        const welcomeRes = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: {
            "api-key": settings.brevo_api_key,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sender: {
              name: settings.brevo_sender_name ?? "CheapDataHub",
              email: settings.brevo_sender_email ?? "no-reply@cheapdatahub.com",
            },
            to: [{ email: user.email, name: meta.full_name ?? user.email }],
            subject: "Welcome to CheapDataHub!",
            htmlContent: `
              <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px">
                <h2 style="color:#6366f1">Welcome to CheapDataHub 🎉</h2>
                <p>Hi ${meta.full_name ?? "there"},</p>
                <p>Your account has been created successfully. You can now buy data, airtime, pay bills, and fund your wallet — all at the best rates.</p>
                <a href="https://darapet.github.io/Cheapdata/" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#6366f1;color:#fff;border-radius:8px;text-decoration:none">Go to Dashboard</a>
                <p style="margin-top:32px;color:#888;font-size:13px">CheapDataHub Team</p>
              </div>
            `,
          }),
        });

        if (!welcomeRes.ok) {
          req.log.warn({ status: welcomeRes.status }, "Welcome email failed to send");
        } else {
          req.log.info({ userId: user.id }, "Welcome email sent");
        }
      }
    } catch (emailErr) {
      // Don't fail the whole webhook if email fails
      req.log.warn({ emailErr }, "Welcome email error (non-fatal)");
    }

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Supabase auth webhook error");
    res.status(500).json({ error: "Webhook processing failed" });
  }
});

export default router;
