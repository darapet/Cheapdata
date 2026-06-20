import { Router } from "express";
import { supabaseAdmin } from "../lib/supabase.js";
import { sendTransactionEmail } from "../lib/email.js";
import crypto from "crypto";
import type { Request, Response } from "express";

const router = Router();

async function getSettings() {
  const { data } = await supabaseAdmin.from("system_settings").select("*").maybeSingle();
  return data;
}

async function creditUserWallet(reference: string, amount: number, gateway: string) {
  // Look up pending funding by reference
  const { data: funding } = await supabaseAdmin
    .from("wallet_fundings")
    .select("*")
    .eq("reference", reference)
    .eq("status", "pending")
    .maybeSingle();

  if (!funding) {
    return { success: false, reason: "Funding record not found or already processed" };
  }

  // Credit the wallet
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("wallet_balance")
    .eq("id", funding.user_id)
    .single();

  const newBalance = (profile?.wallet_balance ?? 0) + (funding.amount ?? amount);

  await supabaseAdmin.from("profiles").update({ wallet_balance: newBalance }).eq("id", funding.user_id);

  // Mark funding as completed
  await supabaseAdmin
    .from("wallet_fundings")
    .update({ status: "completed", payment_gateway: gateway })
    .eq("id", funding.id);

  return { success: true, userId: funding.user_id, amount: funding.amount };
}

// ── Paystack Webhook ─────────────────────────────────────────────────────────
router.post("/webhooks/paystack", async (req: Request, res: Response) => {
  try {
    const settings = await getSettings();
    const secret = settings?.paystack_secret_key;

    if (secret) {
      const hash = crypto
        .createHmac("sha512", secret)
        .update(JSON.stringify(req.body))
        .digest("hex");

      if (hash !== req.headers["x-paystack-signature"]) {
        res.status(400).json({ error: "Invalid signature" });
        return;
      }
    }

    const event = req.body;
    if (event.event === "charge.success") {
      const { reference, amount } = event.data;
      const amountNaira = Math.floor(amount / 100);
      const result = await creditUserWallet(reference, amountNaira, "paystack");
      req.log.info({ reference, result }, "Paystack webhook processed");
    }

    res.json({ received: true });
  } catch (err) {
    req.log.error({ err }, "Paystack webhook error");
    res.status(500).json({ error: "Webhook processing failed" });
  }
});

// ── Flutterwave Webhook ───────────────────────────────────────────────────────
router.post("/webhooks/flutterwave", async (req: Request, res: Response) => {
  try {
    const settings = await getSettings();
    const secretHash = settings?.flutterwave_secret_key;

    // Verify Flutterwave signature using the verif-hash header
    const verifHash = req.headers["verif-hash"];
    if (secretHash && verifHash !== secretHash) {
      res.status(400).json({ error: "Invalid signature" });
      return;
    }

    const event = req.body;

    // Flutterwave sends event as: { event: "charge.completed", data: {...} }
    if (
      event.event === "charge.completed" &&
      event.data?.status === "successful"
    ) {
      const reference = event.data.tx_ref ?? event.data.txRef;
      const amount = event.data.amount;

      const result = await creditUserWallet(reference, amount, "flutterwave");
      req.log.info({ reference, result }, "Flutterwave webhook processed");
    }

    res.json({ received: true });
  } catch (err) {
    req.log.error({ err }, "Flutterwave webhook error");
    res.status(500).json({ error: "Webhook processing failed" });
  }
});

export default router;
