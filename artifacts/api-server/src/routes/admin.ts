import { Router } from "express";
import { supabaseAdmin } from "../lib/supabase.js";
import { requireAdmin, type AuthRequest } from "../middlewares/auth.js";
import type { Response } from "express";

const router = Router();

// GET /api/admin/users
router.get("/admin/users", requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      req.log.error({ error }, "Error fetching admin users");
      res.status(500).json({ error: "Failed to fetch users" });
      return;
    }

    res.json(
      (data || []).map((u) => ({
        id: u.id,
        email: u.email,
        full_name: u.full_name,
        username: u.username,
        phone: u.phone,
        address: u.address,
        wallet_balance: u.wallet_balance || 0,
        is_pin_set: u.is_pin_set || false,
        created_at: u.created_at,
      }))
    );
  } catch (err) {
    req.log.error({ err }, "Error fetching admin users");
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// GET /api/admin/transactions
router.get("/admin/transactions", requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { date } = req.query as { date?: string };

    let query = supabaseAdmin
      .from("wallet_fundings")
      .select("*, profiles(email, full_name, username)")
      .order("created_at", { ascending: false });

    if (date) {
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);
      query = query
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString());
    }

    const { data, error } = await query;

    if (error) {
      req.log.error({ error }, "Error fetching admin transactions");
      res.status(500).json({ error: "Failed to fetch transactions" });
      return;
    }

    res.json(
      (data || []).map((t: Record<string, unknown> & { profiles?: { email?: string; full_name?: string; username?: string } }) => ({
        id: t.id,
        user_id: t.user_id,
        user_email: t.profiles?.email || "",
        user_name: t.profiles?.full_name || t.profiles?.username || "",
        type: t.type,
        amount: t.amount,
        description: t.description,
        status: t.status,
        reference: t.reference,
        created_at: t.created_at,
      }))
    );
  } catch (err) {
    req.log.error({ err }, "Error fetching admin transactions");
    res.status(500).json({ error: "Failed to fetch transactions" });
  }
});

// GET /api/admin/transactions/export
router.get("/admin/transactions/export", requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { date } = req.query as { date?: string };

    let query = supabaseAdmin
      .from("wallet_fundings")
      .select("*, profiles(email, full_name, username, phone)")
      .order("created_at", { ascending: false });

    if (date) {
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);
      query = query
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString());
    }

    const { data } = await query;
    const rows = data || [];

    const headers = ["ID", "User Email", "User Name", "Phone", "Type", "Amount (₦)", "Description", "Status", "Reference", "Date"];
    const csvRows = rows.map((t: Record<string, unknown> & { profiles?: { email?: string; full_name?: string; username?: string; phone?: string } }) => [
      t.id,
      t.profiles?.email || "",
      t.profiles?.full_name || t.profiles?.username || "",
      t.profiles?.phone || "",
      t.type,
      t.amount,
      `"${String(t.description || "").replace(/"/g, '""')}"`,
      t.status,
      t.reference,
      new Date(t.created_at as string).toLocaleString("en-NG"),
    ]);

    const csvContent = [headers.join(","), ...csvRows.map((r) => r.join(","))].join("\n");

    const filename = date
      ? `transactions-${date}.csv`
      : `transactions-all-${new Date().toISOString().slice(0, 10)}.csv`;

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csvContent);
  } catch (err) {
    req.log.error({ err }, "Error exporting transactions");
    res.status(500).json({ error: "Failed to export transactions" });
  }
});

// GET /api/admin/stats
router.get("/admin/stats", requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { count: userCount } = await supabaseAdmin
      .from("profiles")
      .select("*", { count: "exact", head: true });

    const { data: allTxns } = await supabaseAdmin
      .from("wallet_fundings")
      .select("type, amount, status, created_at");

    const txns = allTxns || [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const completedCredits = txns.filter((t) => t.type === "credit" && t.status === "completed");
    const completedDebits = txns.filter((t) => t.type === "debit" && t.status === "completed");
    const todayTxns = txns.filter((t) => new Date(t.created_at) >= today);
    const todayCredits = todayTxns.filter((t) => t.type === "credit" && t.status === "completed");

    // Active users today
    const { data: activeToday } = await supabaseAdmin
      .from("wallet_fundings")
      .select("user_id")
      .gte("created_at", today.toISOString());
    const activeUserIds = new Set((activeToday || []).map((t) => t.user_id));

    res.json({
      total_users: userCount || 0,
      total_transactions: txns.length,
      total_revenue: completedCredits.reduce((s, t) => s + (t.amount || 0), 0),
      total_disbursed: completedDebits.reduce((s, t) => s + (t.amount || 0), 0),
      today_transactions: todayTxns.length,
      today_revenue: todayCredits.reduce((s, t) => s + (t.amount || 0), 0),
      active_users_today: activeUserIds.size,
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching admin stats");
    res.status(500).json({ error: "Failed to fetch admin stats" });
  }
});

// GET /api/admin/settings
router.get("/admin/settings", requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("system_settings")
      .select("id, active_payment_gateway, cheapdatahub_funding_account, updated_at")
      .eq("id", 1)
      .single();

    if (error || !data) {
      // Return defaults
      res.json({ id: 1, active_payment_gateway: "paystack", cheapdatahub_funding_account: null, updated_at: null });
      return;
    }

    res.json(data);
  } catch (err) {
    req.log.error({ err }, "Error fetching settings");
    res.status(500).json({ error: "Failed to fetch settings" });
  }
});

// PATCH /api/admin/settings
router.patch("/admin/settings", requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const updates = req.body as {
      active_payment_gateway?: string;
      paystack_secret_key?: string;
      flutterwave_secret_key?: string;
      cheapdatahub_api_key?: string;
      cheapdatahub_funding_account?: string;
      brevo_api_key?: string;
    };

    const { data, error } = await supabaseAdmin
      .from("system_settings")
      .upsert({ id: 1, ...updates, updated_at: new Date().toISOString() })
      .select("id, active_payment_gateway, cheapdatahub_funding_account, updated_at")
      .single();

    if (error) {
      req.log.error({ error }, "Error updating settings");
      res.status(500).json({ error: "Failed to update settings" });
      return;
    }

    res.json(data);
  } catch (err) {
    req.log.error({ err }, "Error updating settings");
    res.status(500).json({ error: "Failed to update settings" });
  }
});

export default router;
