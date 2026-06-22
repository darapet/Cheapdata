import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getSupabaseAdmin, getSettings, makeRef } from "../_shared/helpers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-paystack-signature",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const rawBody = await req.text();
    const supabase = getSupabaseAdmin();
    const settings = await getSettings(supabase) as any;
    const secretKey = settings?.paystack_secret_key ?? Deno.env.get("PAYSTACK_SECRET_KEY") ?? "";

    // Verify Paystack HMAC-SHA512 signature
    const signature = req.headers.get("x-paystack-signature") ?? "";
    const encoder = new TextEncoder();
    const keyBytes = encoder.encode(secretKey);
    const msgBytes = encoder.encode(rawBody);
    const cryptoKey = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
    const sigBytes = await crypto.subtle.sign("HMAC", cryptoKey, msgBytes);
    const hexSig = Array.from(new Uint8Array(sigBytes)).map((b) => b.toString(16).padStart(2, "0")).join("");

    if (hexSig !== signature) {
      console.warn("Invalid Paystack signature");
      return new Response(JSON.stringify({ error: "Invalid signature" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const payload = JSON.parse(rawBody) as any;
    const event = payload.event as string;

    // Only process successful payments on dedicated virtual accounts
    if (event !== "charge.success") {
      return new Response(JSON.stringify({ received: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const data = payload.data;
    const channel = data.channel as string;
    const amountKobo = data.amount as number;
    const amountNaira = amountKobo / 100;
    const paystackRef = data.reference as string;
    const customerEmail = (data.customer?.email as string ?? "").toLowerCase();
    const accountNumber = data.dedicated_account?.account_number as string | undefined;

    // Ignore non-DVA charges (card, ussd etc handled by inline popup)
    if (channel !== "dedicated_nuban") {
      return new Response(JSON.stringify({ received: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Prevent double-credit: check if this reference was already processed
    const { data: existing } = await supabase
      .from("wallet_fundings")
      .select("id")
      .eq("reference", paystackRef)
      .maybeSingle();

    if (existing) {
      console.log("Reference already processed:", paystackRef);
      return new Response(JSON.stringify({ received: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Find user: match by account_number first (more reliable), fall back to email
    let userId: string | null = null;
    if (accountNumber) {
      const { data: p } = await supabase
        .from("profiles")
        .select("id")
        .eq("dva_account_number", accountNumber)
        .maybeSingle();
      userId = p?.id ?? null;
    }
    if (!userId && customerEmail) {
      const { data: p } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", customerEmail)
        .maybeSingle();
      userId = p?.id ?? null;
    }

    if (!userId) {
      console.error("Could not find user for webhook. email:", customerEmail, "account:", accountNumber);
      return new Response(JSON.stringify({ error: "User not found" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Credit wallet
    const { data: profile } = await supabase
      .from("profiles")
      .select("wallet_balance")
      .eq("id", userId)
      .single();

    const currentBalance = Number(profile?.wallet_balance ?? 0);
    const newBalance = currentBalance + amountNaira;

    await supabase.from("profiles").update({ wallet_balance: newBalance }).eq("id", userId);
    await supabase.from("wallet_fundings").insert({
      user_id: userId,
      type: "funding",
      description: `Wallet Funding via Transfer (₦${amountNaira.toLocaleString()})`,
      amount: amountNaira,
      status: "successful",
      reference: paystackRef,
    });

    console.log(`Credited ₦${amountNaira} to user ${userId}. New balance: ₦${newBalance}`);
    return new Response(JSON.stringify({ received: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    console.error("paystack-webhook error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
