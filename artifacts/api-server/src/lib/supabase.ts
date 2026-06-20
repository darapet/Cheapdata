import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env["SUPABASE_URL"];
const supabaseServiceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
const supabaseAnonKey = process.env["SUPABASE_ANON_KEY"];

if (!supabaseUrl) throw new Error("SUPABASE_URL environment variable is required");
if (!supabaseAnonKey) throw new Error("SUPABASE_ANON_KEY environment variable is required");

export const supabaseAdmin = createClient(
  supabaseUrl,
  supabaseServiceRoleKey || supabaseAnonKey,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
