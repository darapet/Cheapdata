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

export default router;
