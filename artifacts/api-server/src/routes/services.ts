import { Router } from "express";
import { supabaseAdmin } from "../lib/supabase.js";
import { requireAuth, type AuthRequest } from "../middlewares/auth.js";
import { sendTransactionEmail } from "../lib/email.js";
import type { Response } from "express";
import crypto from "crypto";

const router = Router();

function hashPin(pin: string): string {
  return crypto.createHash("sha256").update(pin + "cheapdatahub_salt").digest("hex");
}

async function verifyUserPin(userId: string, pin: string): Promise<boolean> {
  const { data } = await supabaseAdmin.from("profiles").select("transaction_pin").eq("id", userId).single();
  if (!data?.transaction_pin) return false;
  return data.transaction_pin === hashPin(pin);
}

async function getSettings() {
  const { data } = await supabaseAdmin.from("system_settings").select("*").maybeSingle();
  return data;
}

async function getUserProfile(userId: string) {
  const { data } = await supabaseAdmin.from("profiles").select("email, full_name").eq("id", userId).single();
  return data;
}

// Network provider IDs for CheapDataHub.ng
// MTN=1, Airtel=2, Glo=3, 9Mobile=4 (verify from your CheapDataHub dashboard)
const PROVIDER_IDS: Record<string, number> = {
  MTN: 1, AIRTEL: 2, GLO: 3, "9MOBILE": 4,
};

// Make a CheapDataHub API call and return {success, data, message}
async function cheapdatahubCall(apiKey: string, endpoint: string, payload: Record<string, unknown>) {
  const url = `https://www.cheapdatahub.ng/api/v1/resellers/${endpoint}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.json() as Record<string, unknown>;
  // CheapDataHub returns { status: true/false } or { code: "success"/"failure" }
  const ok = res.ok && (body.status === true || body.code === "success" || body.success === true);
  return { ok, body };
}

// Deduct from wallet and record transaction
async function deductWallet(userId: string, amount: number, description: string, reference: string) {
  const { data: profile } = await supabaseAdmin.from("profiles").select("wallet_balance").eq("id", userId).single();
  if (!profile || profile.wallet_balance < amount) return { success: false, message: "Insufficient wallet balance. Please fund your wallet." };
  const newBalance = profile.wallet_balance - amount;
  await supabaseAdmin.from("profiles").update({ wallet_balance: newBalance }).eq("id", userId);
  await supabaseAdmin.from("wallet_fundings").insert({
    user_id: userId, type: "debit", amount, description, status: "pending", reference,
  });
  return { success: true, newBalance };
}

// Refund wallet if service delivery fails
async function refundWallet(userId: string, amount: number, reference: string) {
  const { data: profile } = await supabaseAdmin.from("profiles").select("wallet_balance").eq("id", userId).single();
  const newBalance = (profile?.wallet_balance ?? 0) + amount;
  await supabaseAdmin.from("profiles").update({ wallet_balance: newBalance }).eq("id", userId);
  await supabaseAdmin.from("wallet_fundings").update({ status: "refunded" }).eq("reference", reference);
}

// Mark transaction as completed/failed
async function updateTxStatus(reference: string, status: string) {
  await supabaseAdmin.from("wallet_fundings").update({ status }).eq("reference", reference);
}

function makeRef(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function sendReceipt(userId: string, type: string, description: string, amount: number, reference: string, status: string) {
  void getUserProfile(userId).then((user) => {
    if (user?.email) {
      void sendTransactionEmail({ toEmail: user.email, toName: user.full_name || "Customer", type: "debit", description, amount, reference, status });
    }
  });
}

// ─── POST /api/services/data ──────────────────────────────────────────────────
router.post("/services/data", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { phone, plan_id, network, pin } = req.body as { phone: string; plan_id: string; network: string; pin: string };

    const pinValid = await verifyUserPin(req.userId!, pin);
    if (!pinValid) { res.status(403).json({ success: false, message: "Invalid transaction PIN" }); return; }

    const { data: plan } = await supabaseAdmin.from("data_plans").select("*").eq("plan_id", plan_id).single();
    if (!plan) { res.status(404).json({ success: false, message: "Data plan not found" }); return; }

    const ref = makeRef("DATA");
    const description = `${network} ${plan.data_size} Data — ${phone}`;
    const deduct = await deductWallet(req.userId!, plan.retail_price, description, ref);
    if (!deduct.success) { res.status(400).json({ success: false, message: deduct.message }); return; }

    const settings = await getSettings();
    if (settings?.cheapdatahub_api_key) {
      const providerId = PROVIDER_IDS[network.toUpperCase()] ?? 1;
      // Use cheapdatahub_plan_id if set in DB, otherwise fall back to amount-based call
      const payload: Record<string, unknown> = {
        provider_id: providerId,
        phone_number: phone,
        request_id: ref,
      };
      if (plan.cheapdatahub_plan_id) {
        payload.plan_id = Number(plan.cheapdatahub_plan_id);
      } else {
        payload.amount = plan.retail_price;
      }
      try {
        const { ok, body } = await cheapdatahubCall(settings.cheapdatahub_api_key, "data/purchase/", payload);
        if (!ok) {
          await refundWallet(req.userId!, plan.retail_price, ref);
          const msg = (body.message ?? body.detail ?? "Service provider rejected the request") as string;
          sendReceipt(req.userId!, "debit", description, plan.retail_price, ref, "failed");
          res.status(400).json({ success: false, message: `Data purchase failed: ${msg}. Your wallet has been refunded.` });
          return;
        }
        await updateTxStatus(ref, "completed");
      } catch (err) {
        req.log.error({ err }, "CheapDataHub data API error — refunding");
        await refundWallet(req.userId!, plan.retail_price, ref);
        sendReceipt(req.userId!, "debit", description, plan.retail_price, ref, "failed");
        res.status(502).json({ success: false, message: "Could not reach the data provider. Your wallet has been refunded." });
        return;
      }
    } else {
      // No API key — mark as completed (manual fulfillment mode)
      await updateTxStatus(ref, "completed");
    }

    sendReceipt(req.userId!, "debit", description, plan.retail_price, ref, "successful");
    res.json({ success: true, message: `${plan.data_size} data activated on ${phone}!`, reference: ref, new_balance: deduct.newBalance });
  } catch (err) {
    req.log.error({ err }, "Error buying data");
    res.status(500).json({ success: false, message: "Failed to process data purchase" });
  }
});

// ─── POST /api/services/airtime ───────────────────────────────────────────────
router.post("/services/airtime", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { phone, network, amount, pin } = req.body as { phone: string; network: string; amount: number; pin: string };

    const pinValid = await verifyUserPin(req.userId!, pin);
    if (!pinValid) { res.status(403).json({ success: false, message: "Invalid transaction PIN" }); return; }
    if (!amount || amount < 50) { res.status(400).json({ success: false, message: "Minimum airtime is ₦50" }); return; }

    const ref = makeRef("AIR");
    const description = `${network} Airtime ₦${amount.toLocaleString()} — ${phone}`;
    const deduct = await deductWallet(req.userId!, amount, description, ref);
    if (!deduct.success) { res.status(400).json({ success: false, message: deduct.message }); return; }

    const settings = await getSettings();
    if (settings?.cheapdatahub_api_key) {
      const providerId = PROVIDER_IDS[network.toUpperCase()] ?? 1;
      try {
        const { ok, body } = await cheapdatahubCall(settings.cheapdatahub_api_key, "airtime/purchase/", {
          provider_id: providerId,
          phone_number: phone,
          amount,
          request_id: ref,
        });
        if (!ok) {
          await refundWallet(req.userId!, amount, ref);
          const msg = (body.message ?? body.detail ?? "Service provider rejected the request") as string;
          sendReceipt(req.userId!, "debit", description, amount, ref, "failed");
          res.status(400).json({ success: false, message: `Airtime purchase failed: ${msg}. Your wallet has been refunded.` });
          return;
        }
        await updateTxStatus(ref, "completed");
      } catch (err) {
        req.log.error({ err }, "CheapDataHub airtime API error — refunding");
        await refundWallet(req.userId!, amount, ref);
        sendReceipt(req.userId!, "debit", description, amount, ref, "failed");
        res.status(502).json({ success: false, message: "Could not reach the airtime provider. Your wallet has been refunded." });
        return;
      }
    } else {
      await updateTxStatus(ref, "completed");
    }

    sendReceipt(req.userId!, "debit", description, amount, ref, "successful");
    res.json({ success: true, message: `₦${amount.toLocaleString()} airtime sent to ${phone}!`, reference: ref, new_balance: deduct.newBalance });
  } catch (err) {
    req.log.error({ err }, "Error buying airtime");
    res.status(500).json({ success: false, message: "Failed to process airtime purchase" });
  }
});

// ─── POST /api/services/cable ─────────────────────────────────────────────────
router.post("/services/cable", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { smart_card_number, cable_provider, plan_id, pin } = req.body as { smart_card_number: string; cable_provider: string; plan_id: string; pin: string };

    const pinValid = await verifyUserPin(req.userId!, pin);
    if (!pinValid) { res.status(403).json({ success: false, message: "Invalid transaction PIN" }); return; }

    const cablePrices: Record<string, number> = {
      "dstv-padi": 2950, "dstv-yanga": 4150, "dstv-confam": 6200, "dstv-compact": 10500,
      "dstv-compact-plus": 16600, "dstv-premium": 24500, "gotv-smallie": 1575,
      "gotv-jinja": 2715, "gotv-jolli": 4115, "gotv-max": 7200,
      "startimes-nova": 900, "startimes-basic": 1700, "startimes-smart": 2200,
      "startimes-classic": 2500, "startimes-super": 4200,
    };
    const price = cablePrices[plan_id] || 2000;
    const ref = makeRef("CABLE");
    const description = `${cable_provider} Subscription — ${smart_card_number}`;
    const deduct = await deductWallet(req.userId!, price, description, ref);
    if (!deduct.success) { res.status(400).json({ success: false, message: deduct.message }); return; }

    const settings = await getSettings();
    if (settings?.cheapdatahub_api_key) {
      try {
        const { ok, body } = await cheapdatahubCall(settings.cheapdatahub_api_key, "cable/purchase/", {
          provider: cable_provider.toLowerCase(),
          smart_card_number,
          plan_id,
          amount: price,
          request_id: ref,
        });
        if (!ok) {
          await refundWallet(req.userId!, price, ref);
          const msg = (body.message ?? body.detail ?? "Subscription failed") as string;
          sendReceipt(req.userId!, "debit", description, price, ref, "failed");
          res.status(400).json({ success: false, message: `Cable subscription failed: ${msg}. Your wallet has been refunded.` });
          return;
        }
        await updateTxStatus(ref, "completed");
      } catch (err) {
        req.log.error({ err }, "CheapDataHub cable API error — refunding");
        await refundWallet(req.userId!, price, ref);
        sendReceipt(req.userId!, "debit", description, price, ref, "failed");
        res.status(502).json({ success: false, message: "Could not reach the cable provider. Your wallet has been refunded." });
        return;
      }
    } else {
      await updateTxStatus(ref, "completed");
    }

    sendReceipt(req.userId!, "debit", description, price, ref, "successful");
    res.json({ success: true, message: `${cable_provider} subscription activated for ${smart_card_number}!`, reference: ref, new_balance: deduct.newBalance });
  } catch (err) {
    req.log.error({ err }, "Error buying cable");
    res.status(500).json({ success: false, message: "Failed to process cable subscription" });
  }
});

// ─── POST /api/services/electricity ──────────────────────────────────────────
router.post("/services/electricity", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { meter_number, disco, amount, meter_type, pin } = req.body as { meter_number: string; disco: string; amount: number; meter_type: string; pin: string };

    const pinValid = await verifyUserPin(req.userId!, pin);
    if (!pinValid) { res.status(403).json({ success: false, message: "Invalid transaction PIN" }); return; }
    if (!amount || amount < 1000) { res.status(400).json({ success: false, message: "Minimum electricity amount is ₦1,000" }); return; }

    const ref = makeRef("ELEC");
    const description = `${disco} Electricity — Meter ${meter_number}`;
    const deduct = await deductWallet(req.userId!, amount, description, ref);
    if (!deduct.success) { res.status(400).json({ success: false, message: deduct.message }); return; }

    const settings = await getSettings();
    let token: string | null = null;
    if (settings?.cheapdatahub_api_key) {
      try {
        const { ok, body } = await cheapdatahubCall(settings.cheapdatahub_api_key, "electricity/purchase/", {
          disco: disco.toLowerCase(),
          meter_number,
          meter_type,
          amount,
          request_id: ref,
        });
        if (!ok) {
          await refundWallet(req.userId!, amount, ref);
          const msg = (body.message ?? body.detail ?? "Electricity purchase failed") as string;
          sendReceipt(req.userId!, "debit", description, amount, ref, "failed");
          res.status(400).json({ success: false, message: `Electricity purchase failed: ${msg}. Your wallet has been refunded.` });
          return;
        }
        token = (body.token as string) || (body.data as Record<string, unknown>)?.token as string || null;
        await updateTxStatus(ref, "completed");
      } catch (err) {
        req.log.error({ err }, "CheapDataHub electricity API error — refunding");
        await refundWallet(req.userId!, amount, ref);
        sendReceipt(req.userId!, "debit", description, amount, ref, "failed");
        res.status(502).json({ success: false, message: "Could not reach the electricity provider. Your wallet has been refunded." });
        return;
      }
    } else {
      await updateTxStatus(ref, "completed");
    }

    const finalDesc = token ? `${description} | Token: ${token}` : description;
    sendReceipt(req.userId!, "debit", finalDesc, amount, ref, "successful");
    res.json({ success: true, message: token ? `Token: ${token}` : `Electricity payment processed for meter ${meter_number}`, token, reference: ref, new_balance: deduct.newBalance });
  } catch (err) {
    req.log.error({ err }, "Error buying electricity");
    res.status(500).json({ success: false, message: "Failed to process electricity purchase" });
  }
});

export default router;
