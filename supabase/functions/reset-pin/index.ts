import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, getSupabaseAdmin, jsonResponse } from "../_shared/helpers.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { userId, hashedPin } = await req.json() as { userId: string; hashedPin: string };

    if (!userId || !hashedPin) {
      return jsonResponse({ error: "userId and hashedPin are required" }, 400);
    }

    const supabase = getSupabaseAdmin();

    // Fetch the existing profile so we can do a safe upsert with all required fields
    const { data: profile, error: fetchErr } = await supabase
      .from("profiles")
      .select("id, email, full_name")
      .eq("id", userId)
      .maybeSingle();

    if (fetchErr) {
      console.error("reset-pin: fetch error", fetchErr);
      return jsonResponse({ error: "Failed to look up account. Please try again." }, 500);
    }

    if (profile) {
      // Row exists — just update the PIN columns
      const { error } = await supabase
        .from("profiles")
        .update({ transaction_pin: hashedPin, is_pin_set: true })
        .eq("id", userId);

      if (error) {
        console.error("reset-pin: update error", error);
        return jsonResponse({ error: "Failed to save PIN. Please try again." }, 500);
      }
    } else {
      // No profile row yet — this should be rare but handle it safely
      // We cannot safely create the row without knowing the email; return a friendly error
      console.warn("reset-pin: no profile row for userId", userId);
      return jsonResponse({ error: "Account profile not found. Please contact support." }, 404);
    }

    return jsonResponse({ success: true });
  } catch (err: any) {
    console.error("reset-pin error:", err);
    return jsonResponse({ error: "An unexpected error occurred. Please try again." }, 500);
  }
});
