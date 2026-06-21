import { Router } from "express";
import { supabaseAdmin } from "../lib/supabase.js";
import { requireAuth, type AuthRequest } from "../middlewares/auth.js";
import type { Response } from "express";

const router = Router();

const ADMIN_EMAIL = "daramolapeter98@gmail.com";

async function isAdmin(userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin.from("profiles").select("email").eq("id", userId).single();
  return data?.email === ADMIN_EMAIL;
}

async function getSettings() {
  const { data } = await supabaseAdmin.from("system_settings").select("*").maybeSingle();
  return data;
}

// GET /api/admin/settings — returns ALL settings including secret keys
router.get("/admin/settings", requireAuth, async (req: AuthRequest, res: Response) => {
  if (!(await isAdmin(req.userId!))) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const { data, error } = await supabaseAdmin.from("system_settings").select("*").maybeSingle();
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data ?? {});
});

// POST /api/admin/settings — upsert all settings including secret keys
router.post("/admin/settings", requireAuth, async (req: AuthRequest, res: Response) => {
  if (!(await isAdmin(req.userId!))) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const body = req.body as Record<string, string | number | boolean>;

  const payload: Record<string, string | number | boolean> = {
    paystack_public_key: (body.paystack_public_key as string) ?? "",
    flutterwave_public_key: (body.flutterwave_public_key as string) ?? "",
    cheapdatahub_funding_account: (body.cheapdatahub_funding_account as string) ?? "",
    cheapdatahub_base_url: (body.cheapdatahub_base_url as string) ?? "",
    brevo_sender_email: (body.brevo_sender_email as string) ?? "",
    brevo_sender_name: (body.brevo_sender_name as string) ?? "",
    active_payment_gateway: (body.active_payment_gateway as string) ?? "paystack",
    admin_email: (body.admin_email as string) ?? "",
    // Auto-funding fields
    cheapdatahub_bank_name: (body.cheapdatahub_bank_name as string) ?? "",
    cheapdatahub_bank_code: (body.cheapdatahub_bank_code as string) ?? "",
    cheapdatahub_bank_account: (body.cheapdatahub_bank_account as string) ?? "",
    cheapdatahub_account_name: (body.cheapdatahub_account_name as string) ?? "",
    cheapdatahub_low_balance_threshold: Number(body.cheapdatahub_low_balance_threshold ?? 5000),
    cheapdatahub_topup_amount: Number(body.cheapdatahub_topup_amount ?? 20000),
    cheapdatahub_auto_fund: Boolean(body.cheapdatahub_auto_fund),
  };

  // Only overwrite secret keys if a new value was provided
  if ((body.paystack_secret_key as string)?.trim()) payload.paystack_secret_key = (body.paystack_secret_key as string).trim();
  if ((body.flutterwave_secret_key as string)?.trim()) payload.flutterwave_secret_key = (body.flutterwave_secret_key as string).trim();
  if ((body.cheapdatahub_api_key as string)?.trim()) payload.cheapdatahub_api_key = (body.cheapdatahub_api_key as string).trim();
  if ((body.brevo_api_key as string)?.trim()) payload.brevo_api_key = (body.brevo_api_key as string).trim();

  const { data: existing } = await supabaseAdmin.from("system_settings").select("id").maybeSingle();
  let error;
  if (existing) {
    ({ error } = await supabaseAdmin.from("system_settings").update(payload).eq("id", existing.id));
  } else {
    ({ error } = await supabaseAdmin.from("system_settings").insert(payload));
  }

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ success: true });
});

// GET /api/admin/cheapdatahub-balance — check CheapDataHub wallet balance
router.get("/admin/cheapdatahub-balance", requireAuth, async (req: AuthRequest, res: Response) => {
  if (!(await isAdmin(req.userId!))) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const settings = await getSettings();
  const key = settings?.cheapdatahub_api_key?.trim();
  if (!key) {
    res.status(400).json({ error: "No CheapDataHub API key saved. Save your key first." }); return;
  }
  // Try known CheapDataHub balance endpoints
  const endpoints = [
    "https://www.cheapdatahub.ng/api/v1/resellers/wallet/",
    "https://www.cheapdatahub.ng/api/v1/resellers/balance/",
    "https://www.cheapdatahub.ng/api/v1/wallet/",
  ];
  for (const url of endpoints) {
    try {
      const r = await fetch(url, { headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" } });
      if (r.ok) {
        const body = await r.json() as Record<string, unknown>;
        const balance = body.balance ?? (body.data as any)?.balance ?? body.wallet_balance ?? body.amount ?? "unknown";
        res.json({ ok: true, balance, message: `CheapDataHub key is valid ✓ — Wallet Balance: ₦${Number(balance).toLocaleString()}` });
        return;
      }
    } catch { continue; }
  }
  // If none worked, at least verify the key is correctly formatted
  res.status(400).json({ error: "Could not reach CheapDataHub balance API. Verify your API key is correct and the server is accessible." });
});

// POST /api/admin/cheapdatahub-topup — initiate Paystack transfer to CheapDataHub bank
router.post("/admin/cheapdatahub-topup", requireAuth, async (req: AuthRequest, res: Response) => {
  if (!(await isAdmin(req.userId!))) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const settings = await getSettings();
  const { amount } = req.body as { amount: number };

  if (!settings?.paystack_secret_key) {
    res.status(400).json({ error: "Paystack secret key not configured." }); return;
  }
  if (!(settings as any).cheapdatahub_bank_account || !(settings as any).cheapdatahub_bank_code) {
    res.status(400).json({ error: "CheapDataHub bank details not configured. Add them in the Auto-Funding section." }); return;
  }
  if (!amount || amount < 100) {
    res.status(400).json({ error: "Minimum transfer amount is ₦100." }); return;
  }

  try {
    // Get or create transfer recipient
    let recipientCode = (settings as any).cheapdatahub_paystack_recipient_code as string | null;

    if (!recipientCode) {
      const rRes = await fetch("https://api.paystack.co/transferrecipient", {
        method: "POST",
        headers: { Authorization: `Bearer ${settings.paystack_secret_key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "nuban",
          name: (settings as any).cheapdatahub_account_name || "CheapDataHub",
          account_number: (settings as any).cheapdatahub_bank_account,
          bank_code: (settings as any).cheapdatahub_bank_code,
          currency: "NGN",
        }),
      });
      const rData = await rRes.json() as { status: boolean; data?: { recipient_code: string } };
      if (!rData.status || !rData.data?.recipient_code) {
        res.status(400).json({ error: "Failed to create transfer recipient. Check bank details." }); return;
      }
      recipientCode = rData.data.recipient_code;
      // Cache recipient code
      const { data: existing } = await supabaseAdmin.from("system_settings").select("id").maybeSingle();
      if (existing) {
        await supabaseAdmin.from("system_settings").update({ cheapdatahub_paystack_recipient_code: recipientCode }).eq("id", existing.id);
      }
    }

    // Initiate transfer
    const tRes = await fetch("https://api.paystack.co/transfer", {
      method: "POST",
      headers: { Authorization: `Bearer ${settings.paystack_secret_key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "balance",
        reason: "CheapDataHub wallet top-up",
        amount: Math.round(amount * 100), // kobo
        recipient: recipientCode,
      }),
    });
    const tData = await tRes.json() as { status: boolean; message: string; data?: { transfer_code: string; status: string } };
    if (!tData.status) {
      res.status(400).json({ error: `Transfer failed: ${tData.message}` }); return;
    }
    res.json({ ok: true, message: `₦${amount.toLocaleString()} transfer to CheapDataHub initiated! Status: ${tData.data?.status ?? "pending"}` });
  } catch (err: any) {
    req.log.error({ err }, "CheapDataHub top-up error");
    res.status(500).json({ error: `Transfer failed: ${err.message}` });
  }
});

// POST /api/admin/test-paystack — verify the saved Paystack secret key is valid
router.post("/admin/test-paystack", requireAuth, async (req: AuthRequest, res: Response) => {
  if (!(await isAdmin(req.userId!))) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const settings = await getSettings();
  const key = settings?.paystack_secret_key?.trim();
  if (!key) {
    res.status(400).json({ error: "No Paystack secret key saved yet. Save your key first." }); return;
  }
  try {
    const r = await fetch("https://api.paystack.co/transaction?perPage=1", {
      headers: { Authorization: `Bearer ${key}` },
    });
    const body = await r.json() as { status: boolean; message: string };
    if (body.status) {
      res.json({ ok: true, message: "Paystack key is valid ✓" });
    } else {
      res.status(400).json({ error: `Paystack rejected the key: ${body.message}` });
    }
  } catch (e: any) {
    res.status(500).json({ error: `Could not reach Paystack: ${e.message}` });
  }
});

// POST /api/admin/test-brevo — send a test email using the saved Brevo settings
router.post("/admin/test-brevo", requireAuth, async (req: AuthRequest, res: Response) => {
  if (!(await isAdmin(req.userId!))) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const settings = await getSettings();
  const key = settings?.brevo_api_key?.trim();
  const senderEmail = settings?.brevo_sender_email?.trim();
  const senderName = settings?.brevo_sender_name?.trim() || "CheapDataHub";
  const toEmail = (settings as any)?.admin_email?.trim() || ADMIN_EMAIL;
  if (!key) {
    res.status(400).json({ error: "No Brevo API key saved yet. Save your key first." }); return;
  }
  if (!senderEmail) {
    res.status(400).json({ error: "Sender email is not configured. Please fill in the Sender Email field and save." }); return;
  }
  try {
    const r = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: [{ email: toEmail, name: "Admin" }],
        subject: "✅ Brevo Test Email — CheapDataHub",
        htmlContent: `<div style="font-family:sans-serif;padding:24px;max-width:480px;border:1px solid #e5e7eb;border-radius:8px">
          <h2 style="color:#4f46e5;margin-top:0">Brevo is working! ✓</h2>
          <p style="color:#374151">This is a test email sent from your CheapDataHub admin settings to confirm your Brevo email integration is configured correctly.</p>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0"/>
          <p style="color:#6b7280;font-size:13px;margin:0">
            <strong>To:</strong> ${toEmail}<br/>
            <strong>From:</strong> ${senderName} &lt;${senderEmail}&gt;
          </p>
        </div>`,
      }),
    });
    if (r.ok) {
      res.json({ ok: true, message: `Test email sent to ${toEmail}` });
    } else {
      const err = await r.json() as { message: string };
      res.status(400).json({ error: `Brevo error: ${err.message}` });
    }
  } catch (e: any) {
    res.status(500).json({ error: `Could not reach Brevo: ${e.message}` });
  }
});

// POST /api/admin/test-flutterwave — verify the saved Flutterwave secret key is valid
router.post("/admin/test-flutterwave", requireAuth, async (req: AuthRequest, res: Response) => {
  if (!(await isAdmin(req.userId!))) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const settings = await getSettings();
  const key = settings?.flutterwave_secret_key?.trim();
  if (!key) {
    res.status(400).json({ error: "No Flutterwave secret key saved yet. Save your key first." }); return;
  }
  try {
    const r = await fetch("https://api.flutterwave.com/v3/banks/NG", {
      headers: { Authorization: `Bearer ${key}` },
    });
    const body = await r.json() as { status: string; message: string };
    if (body.status === "success") {
      res.json({ ok: true, message: "Flutterwave key is valid ✓" });
    } else {
      res.status(400).json({ error: `Flutterwave rejected the key: ${body.message}` });
    }
  } catch (e: any) {
    res.status(500).json({ error: `Could not reach Flutterwave: ${e.message}` });
  }
});

export default router;
