import type { Request, Response, NextFunction } from "express";
import { supabase } from "../lib/supabase.js";

export interface AuthRequest extends Request {
  userId?: string;
  userEmail?: string;
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const token = authHeader.slice(7);
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }
  req.userId = user.id;
  req.userEmail = user.email;
  next();
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.userEmail !== "daramolapeter98@gmail.com") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}
