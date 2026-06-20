import { Router } from "express";
import { supabaseAdmin } from "../lib/supabase.js";
import { requireAuth, type AuthRequest } from "../middlewares/auth.js";
import type { Response } from "express";

const router = Router();

async function getSettings() {
  const { data } = await supabaseAdmin.from("system_settings").select("*").maybeSingle();
  return data;
}

async function creditWallet(reference: string, amount: number, gateway: string) {
  const { data: funding } = await supabaseAdmin
    .from("wallet_fundings")
    .select("*")
    .eq("reference", reference)
    .eq("status", "pending")
    .maybeSingle();

  if (!funding) return { success: false, message: "Funding not found or already processed" };

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("wallet_balance")
    .eq("id", funding.user_id)
    .single();

  const newBalance = (profile?.wallet_balance ?? 0) + (funding.amount ?? amount);
  await supabaseAdmin.from("profiles").update({ wallet_balance: newBalance }).eq("id", funding.user_id);
  await supabaseAdmin.from("wallet_fundings").update({ status: "completed", payment_gateway: gateway }).eq("id", funding.id);

  return { success: true, new_balance: newBalance };
}

// POST /api/wallet/verify-payment
// Called by frontend after payment popup closes successfully
router.post("/wallet/verify-payment", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { reference, transaction_id, gateway } = req.body as {
      reference: string;
      transaction_id?: string | number;
      gateway: "paystack" | "flutterwave";
    };

    if (!reference) { res.status(400).json({ success: false, message: "Reference required" }); return; }

    const settings = await getSettings();

    if (gateway === "flutterwave") {
      if (!settings?.flutterwave_secret_key) {
        res.status(500).json({ success: false, message: "Flutterwave not configured" }); return;
      }

      // Verify with Flutterwave API using transaction_id
      if (!transaction_id) {
        res.status(400).json({ success: false, message: "transaction_id required for Flutterwave" }); return;
      }

      const verifyRes = await fetch(`https://api.flutterwave.com/v3/transactions/${transaction_id}/verify`, {
        headers: { Authorization: `Bearer ${settings.flutterwave_secret_key}` },
      });
      const verifyData = await verifyRes.json() as { status: string; data?: { status: string; tx_ref: string; amount: number; currency: string } };

      if (verifyData.status !== "success" || verifyData.data?.status !== "successful") {
        res.status(400).json({ success: false, message: "Payment not verified by Flutterwave" }); return;
      }
      if (verifyData.data.tx_ref !== reference) {
        res.status(400).json({ success: false, message: "Reference mismatch" }); return;
      }
      if (verifyData.data.currency !== "NGN") {
        res.status(400).json({ success: false, message: "Invalid currency" }); return;
      }

      const result = await creditWallet(reference, verifyData.data.amount, "flutterwave");
      res.json(result);

    } else {
      // Paystack: verify via Paystack API
      if (!settings?.paystack_secret_key) {
        res.status(500).json({ success: false, message: "Paystack not configured" }); return;
      }

      const verifyRes = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
        headers: { Authorization: `Bearer ${settings.paystack_secret_key}` },
      });
      const verifyData = await verifyRes.json() as { status: boolean; data?: { status: string; amount: number; currency: string } };

      if (!verifyData.status || verifyData.data?.status !== "success") {
        res.status(400).json({ success: false, message: "Payment not verified by Paystack" }); return;
      }

      const result = await creditWallet(reference, verifyData.data.amount / 100, "paystack");
      res.json(result);
    }
  } catch (err) {
    req.log.error({ err }, "Error verifying payment");
    res.status(500).json({ success: false, message: "Failed to verify payment" });
  }
});

export default router;
