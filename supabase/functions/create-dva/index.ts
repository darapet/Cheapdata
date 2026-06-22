import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, getSupabaseAdmin, verifyAuthToken, getSettings, jsonResponse } from "../_shared/helpers.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = getSupabaseAdmin();
    const token = req.headers.get("authorization")?.replace("Bearer ", "") ?? "";
    const user = await verifyAuthToken(supabase, token);
    if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

    // Return early if DVA already exists
    const { data: profile } = await supabase
      .from("profiles")
      .select("dva_account_number, dva_account_name, dva_bank_name, paystack_customer_code, email, full_name, phone")
      .eq("id", user.id)
      .single();

    if (profile?.dva_account_number) {
      return jsonResponse({
        success: true,
        account_number: profile.dva_account_number,
        account_name: profile.dva_account_name,
        bank_name: profile.dva_bank_name,
      });
    }

    const settings = await getSettings(supabase) as any;
    const secretKey = settings?.paystack_secret_key;
    if (!secretKey) return jsonResponse({ error: "Paystack not configured. Contact admin." }, 500);

    const email = profile?.email || user.email || "";
    const fullName = profile?.full_name || user.user_metadata?.full_name || email.split("@")[0] || "Customer";
    const nameParts = fullName.trim().split(" ");
    const firstName = nameParts[0] || "Customer";
    const lastName = nameParts.slice(1).join(" ") || "User";
    const phone = profile?.phone || "";

    // 1. Create or reuse Paystack customer
    let customerCode = profile?.paystack_customer_code;
    if (!customerCode) {
      const custRes = await fetch("https://api.paystack.co/customer", {
        method: "POST",
        headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ email, first_name: firstName, last_name: lastName, phone }),
      });
      const custData = await custRes.json() as any;
      if (!custRes.ok || !custData.data?.customer_code) {
        console.error("Paystack customer creation failed:", custData);
        return jsonResponse({ error: custData.message || "Failed to create customer account" }, 500);
      }
      customerCode = custData.data.customer_code;
    }

    // 2. Create dedicated virtual account (try wema-bank first, fall back to titan-paystack)
    let dvaData: any = null;
    for (const bank of ["wema-bank", "titan-paystack"]) {
      const dvaRes = await fetch("https://api.paystack.co/dedicated_account", {
        method: "POST",
        headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ customer: customerCode, preferred_bank: bank }),
      });
      const body = await dvaRes.json() as any;
      if (dvaRes.ok && body.data?.account_number) {
        dvaData = body.data;
        break;
      }
      console.warn(`DVA creation failed for ${bank}:`, body.message);
    }

    if (!dvaData) {
      return jsonResponse({ error: "Could not create virtual account. Your Paystack account may need verification. Contact admin." }, 500);
    }

    const accountNumber = dvaData.account_number as string;
    const accountName = dvaData.account_name as string;
    const bankName = dvaData.bank?.name as string ?? "Wema Bank";

    // 3. Save to profile
    await supabase.from("profiles").update({
      dva_account_number: accountNumber,
      dva_account_name: accountName,
      dva_bank_name: bankName,
      paystack_customer_code: customerCode,
    }).eq("id", user.id);

    return jsonResponse({ success: true, account_number: accountNumber, account_name: accountName, bank_name: bankName });
  } catch (err: any) {
    console.error("create-dva error:", err);
    return jsonResponse({ error: err.message ?? "Internal error" }, 500);
  }
});
