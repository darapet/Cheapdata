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

  const body = req.body as Record<string, string>;

  const payload: Record<string, string> = {
    paystack_public_key: body.paystack_public_key ?? "",
    flutterwave_public_key: body.flutterwave_public_key ?? "",
    cheapdatahub_funding_account: body.cheapdatahub_funding_account ?? "",
    cheapdatahub_base_url: body.cheapdatahub_base_url ?? "",
    brevo_sender_email: body.brevo_sender_email ?? "",
    brevo_sender_name: body.brevo_sender_name ?? "",
    active_payment_gateway: body.active_payment_gateway ?? "paystack",
    admin_email: body.admin_email ?? "",
  };

  // Only overwrite secret keys if a new value was provided
  if (body.paystack_secret_key?.trim()) payload.paystack_secret_key = body.paystack_secret_key.trim();
  if (body.flutterwave_secret_key?.trim()) payload.flutterwave_secret_key = body.flutterwave_secret_key.trim();
  if (body.cheapdatahub_api_key?.trim()) payload.cheapdatahub_api_key = body.cheapdatahub_api_key.trim();
  if (body.brevo_api_key?.trim()) payload.brevo_api_key = body.brevo_api_key.trim();

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

// POST /api/admin/test-paystack — verify the saved Paystack secret key is valid
router.post("/admin/test-paystack", requireAuth, async (req: AuthRequest, res: Response) => {
  if (!(await isAdmin(req.userId!))) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const { data: settings } = await supabaseAdmin
    .from("system_settings")
    .select("paystack_secret_key")
    .maybeSingle();
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
  const { data: settings } = await supabaseAdmin
    .from("system_settings")
    .select("brevo_api_key, brevo_sender_email, brevo_sender_name, admin_email")
    .maybeSingle();
  const key = settings?.brevo_api_key?.trim();
  const senderEmail = settings?.brevo_sender_email?.trim();
  const senderName = settings?.brevo_sender_name?.trim() || "CheapDataHub";
  const toEmail = settings?.admin_email?.trim() || ADMIN_EMAIL;
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

export default router;
