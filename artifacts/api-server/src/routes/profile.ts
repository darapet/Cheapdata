import { Router } from "express";
import { supabaseAdmin } from "../lib/supabase.js";
import { requireAuth, type AuthRequest } from "../middlewares/auth.js";
import type { Response } from "express";
import crypto from "crypto";

const router = Router();

function hashPin(pin: string): string {
  return crypto.createHash("sha256").update(pin + "cheapdatahub_salt").digest("hex");
}

// GET /api/profile
router.get("/profile", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("id", req.userId)
      .single();

    if (error || !data) {
      res.status(404).json({ error: "Profile not found" });
      return;
    }

    res.json({
      id: data.id,
      email: data.email,
      full_name: data.full_name,
      username: data.username,
      phone: data.phone,
      address: data.address,
      wallet_balance: data.wallet_balance || 0,
      is_pin_set: data.is_pin_set || false,
      created_at: data.created_at,
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching profile");
    res.status(500).json({ error: "Failed to fetch profile" });
  }
});

// POST /api/profile/pin — setup PIN
router.post("/profile/pin", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { pin } = req.body as { pin: string };

    if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      res.status(400).json({ error: "PIN must be exactly 4 digits" });
      return;
    }

    const hashed = hashPin(pin);

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ transaction_pin: hashed, is_pin_set: true })
      .eq("id", req.userId);

    if (error) {
      req.log.error({ error }, "Error setting PIN");
      res.status(500).json({ error: "Failed to set PIN" });
      return;
    }

    res.json({ success: true, message: "Transaction PIN set successfully" });
  } catch (err) {
    req.log.error({ err }, "Error setting PIN");
    res.status(500).json({ error: "Failed to set PIN" });
  }
});

// POST /api/profile/pin/verify — verify PIN
router.post("/profile/pin/verify", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { pin } = req.body as { pin: string };

    if (!pin || pin.length !== 4) {
      res.status(400).json({ error: "PIN must be 4 digits" });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("transaction_pin")
      .eq("id", req.userId)
      .single();

    if (error || !data) {
      res.status(404).json({ error: "Profile not found" });
      return;
    }

    const hashed = hashPin(pin);
    const valid = data.transaction_pin === hashed;

    res.json({ valid });
  } catch (err) {
    req.log.error({ err }, "Error verifying PIN");
    res.status(500).json({ error: "Failed to verify PIN" });
  }
});

export default router;
