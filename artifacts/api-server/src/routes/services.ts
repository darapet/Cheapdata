import { Router } from "express";
import { supabaseAdmin } from "../lib/supabase.js";
import { requireAuth, type AuthRequest } from "../middlewares/auth.js";
import type { Response } from "express";
import crypto from "crypto";

const router = Router();

const PROCESSING_FEE = 50;

function hashPin(pin: string): string {
  return crypto.createHash("sha256").update(pin + "cheapdatahub_salt").digest("hex");
}

async function verifyUserPin(userId: string, pin: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("transaction_pin")
    .eq("id", userId)
    .single();

  if (!data?.transaction_pin) return false;
  return data.transaction_pin === hashPin(pin);
}

async function getSettings() {
  const { data } = await supabaseAdmin
    .from("system_settings")
    .select("*")
    .eq("id", 1)
    .single();
  return data;
}

async function callCheapDataHub(
  apiKey: string,
  endpoint: string,
  payload: Record<string, unknown>
) {
  const response = await fetch(
    `https://www.cheapdatahub.com/api/v1/${endpoint}`,
    {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );
  return response.json();
}

async function sendBrevoNotification(
  apiKey: string,
  userEmail: string,
  subject: string,
  message: string
) {
  try {
    await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sender: { email: "noreply@cheapdatahub.com", name: "CheapDataHub" },
        to: [{ email: userEmail }],
        subject,
        textContent: message,
      }),
    });
  } catch {
    // Non-fatal: log and continue
  }
}

async function deductWallet(userId: string, amount: number, description: string, reference: string) {
  // Get current balance
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("wallet_balance")
    .eq("id", userId)
    .single();

  if (!profile || profile.wallet_balance < amount) {
    return { success: false, message: "Insufficient wallet balance" };
  }

  const newBalance = profile.wallet_balance - amount;

  await supabaseAdmin
    .from("profiles")
    .update({ wallet_balance: newBalance })
    .eq("id", userId);

  // Log transaction
  await supabaseAdmin.from("wallet_fundings").insert({
    user_id: userId,
    type: "debit",
    amount,
    description,
    status: "completed",
    reference,
  });

  return { success: true, newBalance };
}

// POST /api/services/data
router.post("/services/data", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { phone, plan_id, network, pin } = req.body as {
      phone: string;
      plan_id: string;
      network: string;
      pin: string;
    };

    // Verify PIN
    const pinValid = await verifyUserPin(req.userId!, pin);
    if (!pinValid) {
      res.status(403).json({ success: false, message: "Invalid transaction PIN" });
      return;
    }

    // Get data plan
    const { data: plan } = await supabaseAdmin
      .from("data_plans")
      .select("*")
      .eq("plan_id", plan_id)
      .single();

    if (!plan) {
      res.status(404).json({ success: false, message: "Data plan not found" });
      return;
    }

    // Deduct wallet
    const ref = `DATA-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const deduct = await deductWallet(
      req.userId!,
      plan.retail_price,
      `${network} ${plan.data_size} Data - ${phone}`,
      ref
    );

    if (!deduct.success) {
      res.status(400).json({ success: false, message: deduct.message });
      return;
    }

    // Call CheapDataHub API
    const settings = await getSettings();
    let apiResult: Record<string, unknown> = { status: "pending" };
    
    if (settings?.cheapdatahub_api_key) {
      try {
        apiResult = (await callCheapDataHub(settings.cheapdatahub_api_key, "data", {
          network_id: network,
          plan_id,
          phone,
          amount: plan.retail_price,
          reference: ref,
        })) as Record<string, unknown>;
      } catch {
        req.log.error("CheapDataHub API call failed");
      }
    }

    // Send notification
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .eq("id", req.userId)
      .single();

    if (settings?.brevo_api_key && profile?.email) {
      await sendBrevoNotification(
        settings.brevo_api_key,
        profile.email,
        "Data Purchase Successful",
        `Your ${network} ${plan.data_size} data plan has been activated on ${phone}. Reference: ${ref}`
      );
    }

    res.json({
      success: true,
      message: `${plan.data_size} data plan activated on ${phone}`,
      reference: ref,
      new_balance: deduct.newBalance,
    });
  } catch (err) {
    req.log.error({ err }, "Error buying data");
    res.status(500).json({ success: false, message: "Failed to process data purchase" });
  }
});

// POST /api/services/airtime
router.post("/services/airtime", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { phone, network, amount, pin } = req.body as {
      phone: string;
      network: string;
      amount: number;
      pin: string;
    };

    const pinValid = await verifyUserPin(req.userId!, pin);
    if (!pinValid) {
      res.status(403).json({ success: false, message: "Invalid transaction PIN" });
      return;
    }

    if (!amount || amount < 50) {
      res.status(400).json({ success: false, message: "Minimum airtime amount is ₦50" });
      return;
    }

    const ref = `AIR-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const deduct = await deductWallet(
      req.userId!,
      amount,
      `${network} Airtime - ${phone}`,
      ref
    );

    if (!deduct.success) {
      res.status(400).json({ success: false, message: deduct.message });
      return;
    }

    const settings = await getSettings();
    if (settings?.cheapdatahub_api_key) {
      try {
        await callCheapDataHub(settings.cheapdatahub_api_key, "airtime", {
          network,
          phone,
          amount,
          reference: ref,
        });
      } catch {
        req.log.error("CheapDataHub airtime API call failed");
      }
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .eq("id", req.userId)
      .single();

    if (settings?.brevo_api_key && profile?.email) {
      await sendBrevoNotification(
        settings.brevo_api_key,
        profile.email,
        "Airtime Purchase Successful",
        `₦${amount} airtime sent to ${phone} on ${network}. Reference: ${ref}`
      );
    }

    res.json({
      success: true,
      message: `₦${amount} airtime sent to ${phone}`,
      reference: ref,
      new_balance: deduct.newBalance,
    });
  } catch (err) {
    req.log.error({ err }, "Error buying airtime");
    res.status(500).json({ success: false, message: "Failed to process airtime purchase" });
  }
});

// POST /api/services/cable
router.post("/services/cable", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { smart_card_number, cable_provider, plan_id, pin } = req.body as {
      smart_card_number: string;
      cable_provider: string;
      plan_id: string;
      pin: string;
    };

    const pinValid = await verifyUserPin(req.userId!, pin);
    if (!pinValid) {
      res.status(403).json({ success: false, message: "Invalid transaction PIN" });
      return;
    }

    // Cable plan pricing — in production, fetch from DB or settings
    const cablePrices: Record<string, number> = {
      "dstv-padi": 2950,
      "dstv-yanga": 4150,
      "dstv-confam": 6200,
      "dstv-compact": 10500,
      "dstv-compact-plus": 16600,
      "dstv-premium": 24500,
      "gotv-smallie": 1575,
      "gotv-jinja": 2715,
      "gotv-jolli": 4115,
      "gotv-max": 7200,
      "startimes-nova": 900,
      "startimes-basic": 1700,
      "startimes-smart": 2200,
      "startimes-classic": 2500,
      "startimes-super": 4200,
    };

    const price = cablePrices[plan_id] || 2000;

    const ref = `CABLE-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const deduct = await deductWallet(
      req.userId!,
      price,
      `${cable_provider} Subscription - ${smart_card_number}`,
      ref
    );

    if (!deduct.success) {
      res.status(400).json({ success: false, message: deduct.message });
      return;
    }

    const settings = await getSettings();
    if (settings?.cheapdatahub_api_key) {
      try {
        await callCheapDataHub(settings.cheapdatahub_api_key, "cable", {
          provider: cable_provider,
          plan_id,
          smart_card: smart_card_number,
          amount: price,
          reference: ref,
        });
      } catch {
        req.log.error("CheapDataHub cable API call failed");
      }
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .eq("id", req.userId)
      .single();

    if (settings?.brevo_api_key && profile?.email) {
      await sendBrevoNotification(
        settings.brevo_api_key,
        profile.email,
        "Cable TV Subscription Successful",
        `${cable_provider} subscription for smart card ${smart_card_number} has been processed. Reference: ${ref}`
      );
    }

    res.json({
      success: true,
      message: `${cable_provider} subscription activated for ${smart_card_number}`,
      reference: ref,
      new_balance: deduct.newBalance,
    });
  } catch (err) {
    req.log.error({ err }, "Error buying cable");
    res.status(500).json({ success: false, message: "Failed to process cable subscription" });
  }
});

// POST /api/services/electricity
router.post("/services/electricity", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { meter_number, disco, amount, meter_type, pin } = req.body as {
      meter_number: string;
      disco: string;
      amount: number;
      meter_type: string;
      pin: string;
    };

    const pinValid = await verifyUserPin(req.userId!, pin);
    if (!pinValid) {
      res.status(403).json({ success: false, message: "Invalid transaction PIN" });
      return;
    }

    if (!amount || amount < 1000) {
      res.status(400).json({ success: false, message: "Minimum electricity amount is ₦1,000" });
      return;
    }

    const ref = `ELEC-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const deduct = await deductWallet(
      req.userId!,
      amount,
      `${disco} Electricity - ${meter_number}`,
      ref
    );

    if (!deduct.success) {
      res.status(400).json({ success: false, message: deduct.message });
      return;
    }

    const settings = await getSettings();
    let token: string | null = null;

    if (settings?.cheapdatahub_api_key) {
      try {
        const apiResult = await callCheapDataHub(
          settings.cheapdatahub_api_key,
          "electricity",
          {
            disco,
            meter_number,
            meter_type,
            amount,
            reference: ref,
          }
        ) as Record<string, unknown>;
        token = (apiResult.token as string) || null;
      } catch {
        req.log.error("CheapDataHub electricity API call failed");
      }
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .eq("id", req.userId)
      .single();

    if (settings?.brevo_api_key && profile?.email) {
      await sendBrevoNotification(
        settings.brevo_api_key,
        profile.email,
        "Electricity Token Purchase Successful",
        `${disco} token for meter ${meter_number} processed. ${token ? `Token: ${token}` : ""} Reference: ${ref}`
      );
    }

    res.json({
      success: true,
      message: `Electricity token purchased for meter ${meter_number}`,
      token,
      reference: ref,
      new_balance: deduct.newBalance,
    });
  } catch (err) {
    req.log.error({ err }, "Error buying electricity");
    res.status(500).json({ success: false, message: "Failed to process electricity purchase" });
  }
});

export { PROCESSING_FEE };
export default router;
