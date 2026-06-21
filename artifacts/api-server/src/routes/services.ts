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
const NETWORK_PROVIDER_IDS: Record<string, number> = {
  MTN: 1,
  AIRTEL: 2,
  GLO: 3,
  "9MOBILE": 4,
};

async function callCheapDataHubAirtime(apiKey: string, network: string, phone: string, amount: number) {
  const providerId = NETWORK_PROVIDER_IDS[network.toUpperCase()] ?? 1;
  const response = await fetch("https://www.cheapdatahub.ng/api/v1/resellers/airtime/purchase/", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ provider_id: providerId, phone_number: phone, amount }),
  });
  return response.json();
}

async function callCheapDataHubData(apiKey: string, network: string, phone: string, planId: string, amount: number) {
  const providerId = NETWORK_PROVIDER_IDS[network.toUpperCase()] ?? 1;
  const response = await fetch("https://www.cheapdatahub.ng/api/v1/resellers/data/purchase/", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ provider_id: providerId, phone_number: phone, amount, plan_id: planId }),
  });
  return response.json();
}

async function callCheapDataHubCable(apiKey: string, provider: string, smartCard: string, planId: string, amount: number) {
  const response = await fetch("https://www.cheapdatahub.ng/api/v1/resellers/cable/purchase/", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ provider, smart_card_number: smartCard, plan_id: planId, amount }),
  });
  return response.json();
}

async function callCheapDataHubElectricity(apiKey: string, disco: string, meterNumber: string, meterType: string, amount: number) {
  const response = await fetch("https://www.cheapdatahub.ng/api/v1/resellers/electricity/purchase/", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ disco, meter_number: meterNumber, meter_type: meterType, amount }),
  });
  return response.json();
}

async function deductWallet(userId: string, amount: number, description: string, reference: string) {
  const { data: profile } = await supabaseAdmin.from("profiles").select("wallet_balance").eq("id", userId).single();
  if (!profile || profile.wallet_balance < amount) return { success: false, message: "Insufficient wallet balance" };
  const newBalance = profile.wallet_balance - amount;
  await supabaseAdmin.from("profiles").update({ wallet_balance: newBalance }).eq("id", userId);
  await supabaseAdmin.from("wallet_fundings").insert({
    user_id: userId, type: "debit", amount, description, status: "completed", reference,
  });
  return { success: true, newBalance };
}

// POST /api/services/data
router.post("/services/data", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { phone, plan_id, network, pin } = req.body as { phone: string; plan_id: string; network: string; pin: string };
    const pinValid = await verifyUserPin(req.userId!, pin);
    if (!pinValid) { res.status(403).json({ success: false, message: "Invalid transaction PIN" }); return; }

    const { data: plan } = await supabaseAdmin.from("data_plans").select("*").eq("plan_id", plan_id).single();
    if (!plan) { res.status(404).json({ success: false, message: "Data plan not found" }); return; }

    const ref = `DATA-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const description = `${network} ${plan.data_size} Data - ${phone}`;
    const deduct = await deductWallet(req.userId!, plan.retail_price, description, ref);
    if (!deduct.success) { res.status(400).json({ success: false, message: deduct.message }); return; }

    const settings = await getSettings();
    if (settings?.cheapdatahub_api_key) {
      try {
        await callCheapDataHubData(settings.cheapdatahub_api_key, network, phone, plan_id, plan.retail_price);
      } catch { req.log.error("CheapDataHub data API failed"); }
    }

    void getUserProfile(req.userId!).then((user) => {
      if (user?.email) {
        void sendTransactionEmail({ toEmail: user.email, toName: user.full_name || "Customer", type: "debit", description, amount: plan.retail_price, reference: ref, status: "successful" });
      }
    });

    res.json({ success: true, message: `${plan.data_size} data activated on ${phone}`, reference: ref, new_balance: deduct.newBalance });
  } catch (err) {
    req.log.error({ err }, "Error buying data");
    res.status(500).json({ success: false, message: "Failed to process data purchase" });
  }
});

// POST /api/services/airtime
router.post("/services/airtime", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { phone, network, amount, pin } = req.body as { phone: string; network: string; amount: number; pin: string };
    const pinValid = await verifyUserPin(req.userId!, pin);
    if (!pinValid) { res.status(403).json({ success: false, message: "Invalid transaction PIN" }); return; }
    if (!amount || amount < 50) { res.status(400).json({ success: false, message: "Minimum airtime is ₦50" }); return; }

    const ref = `AIR-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const description = `${network} Airtime - ${phone}`;
    const deduct = await deductWallet(req.userId!, amount, description, ref);
    if (!deduct.success) { res.status(400).json({ success: false, message: deduct.message }); return; }

    const settings = await getSettings();
    if (settings?.cheapdatahub_api_key) {
      try {
        await callCheapDataHubAirtime(settings.cheapdatahub_api_key, network, phone, amount);
      } catch { req.log.error("CheapDataHub airtime API failed"); }
    }

    void getUserProfile(req.userId!).then((user) => {
      if (user?.email) {
        void sendTransactionEmail({ toEmail: user.email, toName: user.full_name || "Customer", type: "debit", description, amount, reference: ref, status: "successful" });
      }
    });

    res.json({ success: true, message: `₦${amount} airtime sent to ${phone}`, reference: ref, new_balance: deduct.newBalance });
  } catch (err) {
    req.log.error({ err }, "Error buying airtime");
    res.status(500).json({ success: false, message: "Failed to process airtime purchase" });
  }
});

// POST /api/services/cable
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
    const ref = `CABLE-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const description = `${cable_provider} Subscription - ${smart_card_number}`;
    const deduct = await deductWallet(req.userId!, price, description, ref);
    if (!deduct.success) { res.status(400).json({ success: false, message: deduct.message }); return; }

    const settings = await getSettings();
    if (settings?.cheapdatahub_api_key) {
      try {
        await callCheapDataHubCable(settings.cheapdatahub_api_key, cable_provider, smart_card_number, plan_id, price);
      } catch { req.log.error("CheapDataHub cable API failed"); }
    }

    void getUserProfile(req.userId!).then((user) => {
      if (user?.email) {
        void sendTransactionEmail({ toEmail: user.email, toName: user.full_name || "Customer", type: "debit", description, amount: price, reference: ref, status: "successful" });
      }
    });

    res.json({ success: true, message: `${cable_provider} subscription activated for ${smart_card_number}`, reference: ref, new_balance: deduct.newBalance });
  } catch (err) {
    req.log.error({ err }, "Error buying cable");
    res.status(500).json({ success: false, message: "Failed to process cable subscription" });
  }
});

// POST /api/services/electricity
router.post("/services/electricity", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { meter_number, disco, amount, meter_type, pin } = req.body as { meter_number: string; disco: string; amount: number; meter_type: string; pin: string };
    const pinValid = await verifyUserPin(req.userId!, pin);
    if (!pinValid) { res.status(403).json({ success: false, message: "Invalid transaction PIN" }); return; }
    if (!amount || amount < 1000) { res.status(400).json({ success: false, message: "Minimum electricity amount is ₦1,000" }); return; }

    const ref = `ELEC-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const description = `${disco} Electricity - ${meter_number}`;
    const deduct = await deductWallet(req.userId!, amount, description, ref);
    if (!deduct.success) { res.status(400).json({ success: false, message: deduct.message }); return; }

    const settings = await getSettings();
    let token: string | null = null;
    if (settings?.cheapdatahub_api_key) {
      try {
        const result = await callCheapDataHubElectricity(settings.cheapdatahub_api_key, disco, meter_number, meter_type, amount) as Record<string, unknown>;
        token = (result.token as string) || null;
      } catch { req.log.error("CheapDataHub electricity API failed"); }
    }

    void getUserProfile(req.userId!).then((user) => {
      if (user?.email) {
        void sendTransactionEmail({ toEmail: user.email, toName: user.full_name || "Customer", type: "debit", description: token ? `${description} | Token: ${token}` : description, amount, reference: ref, status: "successful" });
      }
    });

    res.json({ success: true, message: `Electricity token purchased for meter ${meter_number}`, token, reference: ref, new_balance: deduct.newBalance });
  } catch (err) {
    req.log.error({ err }, "Error buying electricity");
    res.status(500).json({ success: false, message: "Failed to process electricity purchase" });
  }
});

export default router;
