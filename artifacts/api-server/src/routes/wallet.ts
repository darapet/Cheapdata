import { Router } from "express";
import { supabaseAdmin } from "../lib/supabase.js";
import { requireAuth, type AuthRequest } from "../middlewares/auth.js";
import type { Response } from "express";

const router = Router();
const PROCESSING_FEE = 50;

// POST /api/wallet/fund/initialize
router.post("/wallet/fund/initialize", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { amount } = req.body as { amount: number };

    if (!amount || amount < 100) {
      res.status(400).json({ error: "Minimum funding amount is ₦100" });
      return;
    }

    const totalAmount = amount + PROCESSING_FEE;
    const reference = `FUND-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    // Log pending funding request
    await supabaseAdmin.from("wallet_fundings").insert({
      user_id: req.userId,
      type: "credit",
      amount,
      processing_fee: PROCESSING_FEE,
      total_amount: totalAmount,
      description: `Wallet funding - ₦${amount}`,
      status: "pending",
      reference,
    });

    res.json({
      base_amount: amount,
      processing_fee: PROCESSING_FEE,
      total_amount: totalAmount,
      reference,
      payment_instruction: `Please transfer exactly ₦${totalAmount.toLocaleString()} to our designated bank account. Use reference: ${reference}`,
    });
  } catch (err) {
    req.log.error({ err }, "Error initializing wallet funding");
    res.status(500).json({ error: "Failed to initialize wallet funding" });
  }
});

// GET /api/wallet/transactions
router.get("/wallet/transactions", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("wallet_fundings")
      .select("*")
      .eq("user_id", req.userId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      req.log.error({ error }, "Error fetching transactions");
      res.status(500).json({ error: "Failed to fetch transactions" });
      return;
    }

    const transactions = (data || []).map((t) => ({
      id: t.id,
      type: t.type,
      amount: t.amount,
      description: t.description,
      status: t.status,
      reference: t.reference,
      created_at: t.created_at,
    }));

    res.json(transactions);
  } catch (err) {
    req.log.error({ err }, "Error fetching transactions");
    res.status(500).json({ error: "Failed to fetch transactions" });
  }
});

// GET /api/wallet/summary
router.get("/wallet/summary", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("wallet_balance")
      .eq("id", req.userId)
      .single();

    const { data: txns } = await supabaseAdmin
      .from("wallet_fundings")
      .select("type, amount, description, status")
      .eq("user_id", req.userId);

    const transactions = txns || [];
    const completedCredits = transactions.filter(
      (t) => t.type === "credit" && t.status === "completed"
    );
    const completedDebits = transactions.filter(
      (t) => t.type === "debit" && t.status === "completed"
    );
    const dataCount = completedDebits.filter((t) =>
      t.description?.toLowerCase().includes("data")
    ).length;
    const airtimeCount = completedDebits.filter((t) =>
      t.description?.toLowerCase().includes("airtime")
    ).length;

    res.json({
      balance: profile?.wallet_balance || 0,
      total_funded: completedCredits.reduce((sum, t) => sum + (t.amount || 0), 0),
      total_spent: completedDebits.reduce((sum, t) => sum + (t.amount || 0), 0),
      transaction_count: transactions.length,
      data_purchases: dataCount,
      airtime_purchases: airtimeCount,
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching wallet summary");
    res.status(500).json({ error: "Failed to fetch wallet summary" });
  }
});

export default router;
