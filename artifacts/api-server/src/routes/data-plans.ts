import { Router } from "express";
import { supabaseAdmin } from "../lib/supabase.js";
import type { Request, Response } from "express";

const router = Router();

// GET /api/data-plans
router.get("/data-plans", async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("data_plans")
      .select("*")
      .order("network")
      .order("retail_price");

    if (error) {
      req.log.error({ error }, "Error fetching data plans");
      res.status(500).json({ error: "Failed to fetch data plans" });
      return;
    }

    res.json(data || []);
  } catch (err) {
    req.log.error({ err }, "Error fetching data plans");
    res.status(500).json({ error: "Failed to fetch data plans" });
  }
});

// GET /api/data-plans/:network
router.get("/data-plans/:network", async (req: Request, res: Response) => {
  try {
    const { network } = req.params;

    const networkStr = Array.isArray(network) ? network[0] : network;

    const { data, error } = await supabaseAdmin
      .from("data_plans")
      .select("*")
      .ilike("network", networkStr)
      .order("retail_price");

    if (error) {
      req.log.error({ error }, "Error fetching network data plans");
      res.status(500).json({ error: "Failed to fetch data plans" });
      return;
    }

    res.json(data || []);
  } catch (err) {
    req.log.error({ err }, "Error fetching network data plans");
    res.status(500).json({ error: "Failed to fetch data plans" });
  }
});

export default router;
