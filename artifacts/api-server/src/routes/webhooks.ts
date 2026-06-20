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
    // Body is already parsed as JSON by app middleware
    const event = req.body as {
      event: string;
      data: {
        reference: string;
        amount: number;
        customer?: { email?: string };
        metadata?: { user_id?: string };
      };
    };

    // Get settings for Paystack secret
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

    // Paystack sends amount in kobo
    const amountInNaira = paystackAmount / 100;
    const walletCredit = amountInNaira - PROCESSING_FEE;

    if (walletCredit <= 0) {
      req.log.warn({ reference, amountInNaira }, "Payment amount too small to credit wallet");
      res.json({ success: true });
      return;
    }

    // Find pending funding record
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

    // Credit user wallet
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

    // Update funding record to completed
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

export default router;
