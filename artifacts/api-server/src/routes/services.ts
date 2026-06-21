import { Router } from "express";
import { supabaseAdmin } from "../lib/supabase.js";
import { requireAuth, type AuthRequest } from "../middlewares/auth.js";
import { sendTransactionEmail } from "../lib/email.js";
import type { Response } from "express";
import crypto from "crypto";

const router = Router();

const ELECTRICITY_FEE = 150; // ₦150 service fee on every electricity purchase

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

const PROVIDER_IDS: Record<string, number> = {
  MTN: 1, AIRTEL: 2, GLO: 3, "9MOBILE": 4,
};

async function cheapdatahubCall(apiKey: string, endpoint: string, payload: Record<string, unknown>) {
  const url = `https://www.cheapdatahub.ng/api/v1/resellers/${endpoint}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.json() as Record<string, unknown>;
  const ok = res.ok && (body.status === true || body.code === "success" || body.success === true);
  return { ok, body };
}

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

async function refundWallet(userId: string, amount: number, reference: string) {
  const { data: profile } = await supabaseAdmin.from("profiles").select("wallet_balance").eq("id", userId).single();
  const newBalance = (profile?.wallet_balance ?? 0) + amount;
  await supabaseAdmin.from("profiles").update({ wallet_balance: newBalance }).eq("id", userId);
  await supabaseAdmin.from("wallet_fundings").update({ status: "refunded" }).eq("reference", reference);
}

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
      const payload: Record<string, unknown> = {
        provider_id: providerId,
        phone_number: phone,
        request_id: ref,
      };
      if (plan.cheapdatahub_plan_id) {
        payload.plan_id = Number(plan.cheapdatahub_plan_id);
      } else {
        payload.amount = plan.wholesale_price ?? plan.retail_price;
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
          provider_id: providerId, phone_number: phone, amount, request_id: ref,
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
// Prices come from data_plans table (service_type='cable').
// retail_price = what user pays (includes +₦100 markup).
// wholesale_price = what CheapDataHub charges.
router.post("/services/cable", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { smart_card_number, cable_provider, plan_id, pin } = req.body as { smart_card_number: string; cable_provider: string; plan_id: string; pin: string };

    const pinValid = await verifyUserPin(req.userId!, pin);
    if (!pinValid) { res.status(403).json({ success: false, message: "Invalid transaction PIN" }); return; }

    // Fetch plan from DB (service_type=cable)
    const { data: plan } = await supabaseAdmin.from("data_plans").select("*")
      .eq("plan_id", plan_id).eq("service_type", "cable").single();
    if (!plan) { res.status(404).json({ success: false, message: "Cable plan not found" }); return; }

    const retailPrice = plan.retail_price;      // user is charged this
    const wholesalePrice = plan.wholesale_price ?? (retailPrice - 100); // CheapDataHub gets this

    const ref = makeRef("CABLE");
    const description = `${cable_provider} ${plan.plan_name} — ${smart_card_number}`;
    const deduct = await deductWallet(req.userId!, retailPrice, description, ref);
    if (!deduct.success) { res.status(400).json({ success: false, message: deduct.message }); return; }

    const settings = await getSettings();
    if (settings?.cheapdatahub_api_key) {
      try {
        const cdhPayload: Record<string, unknown> = {
          provider: cable_provider.toLowerCase(),
          smart_card_number,
          amount: wholesalePrice,
          request_id: ref,
        };
        if (plan.cheapdatahub_plan_id) cdhPayload.plan_id = plan.cheapdatahub_plan_id;
        const { ok, body } = await cheapdatahubCall(settings.cheapdatahub_api_key, "cable/purchase/", cdhPayload);
        if (!ok) {
          await refundWallet(req.userId!, retailPrice, ref);
          const msg = (body.message ?? body.detail ?? "Subscription failed") as string;
          sendReceipt(req.userId!, "debit", description, retailPrice, ref, "failed");
          res.status(400).json({ success: false, message: `Cable subscription failed: ${msg}. Your wallet has been refunded.` });
          return;
        }
        await updateTxStatus(ref, "completed");
      } catch (err) {
        req.log.error({ err }, "CheapDataHub cable API error — refunding");
        await refundWallet(req.userId!, retailPrice, ref);
        sendReceipt(req.userId!, "debit", description, retailPrice, ref, "failed");
        res.status(502).json({ success: false, message: "Could not reach the cable provider. Your wallet has been refunded." });
        return;
      }
    } else {
      await updateTxStatus(ref, "completed");
    }

    sendReceipt(req.userId!, "debit", description, retailPrice, ref, "successful");
    res.json({ success: true, message: `${cable_provider} ${plan.plan_name} activated for ${smart_card_number}!`, reference: ref, new_balance: deduct.newBalance });
  } catch (err) {
    req.log.error({ err }, "Error buying cable");
    res.status(500).json({ success: false, message: "Failed to process cable subscription" });
  }
});

// ─── POST /api/services/electricity ──────────────────────────────────────────
// User enters the electricity amount they want (e.g. ₦2,000).
// We charge them amount + ₦150 service fee from their wallet.
// CheapDataHub gets exactly the amount the user entered (₦2,000 in units).
// Admin profit = ₦150 per transaction.
router.post("/services/electricity", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { meter_number, disco, amount, meter_type, pin } = req.body as { meter_number: string; disco: string; amount: number; meter_type: string; pin: string };

    const pinValid = await verifyUserPin(req.userId!, pin);
    if (!pinValid) { res.status(403).json({ success: false, message: "Invalid transaction PIN" }); return; }
    if (!amount || amount < 500) { res.status(400).json({ success: false, message: "Minimum electricity amount is ₦500" }); return; }

    const totalCharge = amount + ELECTRICITY_FEE; // deduct from wallet
    const ref = makeRef("ELEC");
    const description = `${disco} Electricity ₦${amount.toLocaleString()} — Meter ${meter_number}`;
    const deduct = await deductWallet(req.userId!, totalCharge, description, ref);
    if (!deduct.success) { res.status(400).json({ success: false, message: deduct.message }); return; }

    const settings = await getSettings();
    let token: string | null = null;
    if (settings?.cheapdatahub_api_key) {
      try {
        // CheapDataHub gets only the electricity amount (not the fee)
        const { ok, body } = await cheapdatahubCall(settings.cheapdatahub_api_key, "electricity/purchase/", {
          disco: disco.toLowerCase(), meter_number, meter_type, amount, request_id: ref,
        });
        if (!ok) {
          await refundWallet(req.userId!, totalCharge, ref);
          const msg = (body.message ?? body.detail ?? "Electricity purchase failed") as string;
          sendReceipt(req.userId!, "debit", description, totalCharge, ref, "failed");
          res.status(400).json({ success: false, message: `Electricity purchase failed: ${msg}. Your wallet has been refunded.` });
          return;
        }
        token = (body.token as string) || (body.data as Record<string, unknown>)?.token as string || null;
        await updateTxStatus(ref, "completed");
      } catch (err) {
        req.log.error({ err }, "CheapDataHub electricity API error — refunding");
        await refundWallet(req.userId!, totalCharge, ref);
        sendReceipt(req.userId!, "debit", description, totalCharge, ref, "failed");
        res.status(502).json({ success: false, message: "Could not reach the electricity provider. Your wallet has been refunded." });
        return;
      }
    } else {
      await updateTxStatus(ref, "completed");
    }

    const finalDesc = token ? `${description} | Token: ${token}` : description;
    sendReceipt(req.userId!, "debit", finalDesc, totalCharge, ref, "successful");
    res.json({ success: true, message: token ? `Token: ${token}` : `Electricity payment processed for meter ${meter_number}`, token, reference: ref, new_balance: deduct.newBalance });
  } catch (err) {
    req.log.error({ err }, "Error buying electricity");
    res.status(500).json({ success: false, message: "Failed to process electricity purchase" });
  }
});

// ─── POST /api/services/education ────────────────────────────────────────────
// WAEC / NECO / JAMB / GCE result checker PINs.
// retail_price = user's price (includes +₦200 markup).
// wholesale_price = what CheapDataHub charges.
router.post("/services/education", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { exam_body, plan_id, quantity = 1, pin } = req.body as { exam_body: string; plan_id: string; quantity: number; pin: string };

    const pinValid = await verifyUserPin(req.userId!, pin);
    if (!pinValid) { res.status(403).json({ success: false, message: "Invalid transaction PIN" }); return; }

    const { data: plan } = await supabaseAdmin.from("data_plans").select("*")
      .eq("plan_id", plan_id).eq("service_type", "education").single();
    if (!plan) { res.status(404).json({ success: false, message: "Education plan not found" }); return; }

    const qty = Math.max(1, Math.min(10, Number(quantity)));
    const totalRetail = plan.retail_price * qty;
    const wholesalePerPin = plan.wholesale_price ?? (plan.retail_price - 200);

    const ref = makeRef("EDU");
    const description = `${exam_body} Result Checker × ${qty}`;
    const deduct = await deductWallet(req.userId!, totalRetail, description, ref);
    if (!deduct.success) { res.status(400).json({ success: false, message: deduct.message }); return; }

    const settings = await getSettings();
    let pins: string[] = [];
    if (settings?.cheapdatahub_api_key) {
      try {
        const cdhPayload: Record<string, unknown> = {
          exam_body: exam_body.toLowerCase(),
          quantity: qty,
          amount: wholesalePerPin * qty,
          request_id: ref,
        };
        if (plan.cheapdatahub_plan_id) cdhPayload.plan_id = plan.cheapdatahub_plan_id;
        const { ok, body } = await cheapdatahubCall(settings.cheapdatahub_api_key, "education/purchase/", cdhPayload);
        if (!ok) {
          await refundWallet(req.userId!, totalRetail, ref);
          const msg = (body.message ?? body.detail ?? "Education purchase failed") as string;
          sendReceipt(req.userId!, "debit", description, totalRetail, ref, "failed");
          res.status(400).json({ success: false, message: `${exam_body} PIN purchase failed: ${msg}. Your wallet has been refunded.` });
          return;
        }
        const bodyData = body.data as Record<string, unknown> | undefined;
        pins = (body.pins ?? bodyData?.pins ?? []) as string[];
        await updateTxStatus(ref, "completed");
      } catch (err) {
        req.log.error({ err }, "CheapDataHub education API error — refunding");
        await refundWallet(req.userId!, totalRetail, ref);
        sendReceipt(req.userId!, "debit", description, totalRetail, ref, "failed");
        res.status(502).json({ success: false, message: "Could not reach the education provider. Your wallet has been refunded." });
        return;
      }
    } else {
      await updateTxStatus(ref, "completed");
    }

    sendReceipt(req.userId!, "debit", description, totalRetail, ref, "successful");
    res.json({ success: true, message: pins.length ? `Your ${exam_body} PIN(s): ${pins.join(", ")}` : `${exam_body} result checker processed successfully.`, pins, reference: ref, new_balance: deduct.newBalance });
  } catch (err) {
    req.log.error({ err }, "Error buying education");
    res.status(500).json({ success: false, message: "Failed to process education purchase" });
  }
});

export default router;
