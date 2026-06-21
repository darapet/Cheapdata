import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { email, otp } = await req.json() as { email: string; otp: string };

    if (!email || !otp) {
      return new Response(JSON.stringify({ error: "email and otp are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    // Fetch settings from DB (brevo api key, sender info)
    const settingsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/system_settings?select=brevo_api_key,brevo_sender_email,brevo_sender_name&limit=1`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      }
    );
    const settingsArr = await settingsRes.json() as any[];
    const settings = settingsArr?.[0] ?? {};

    const brevoApiKey = settings.brevo_api_key || Deno.env.get("BREVO_API_KEY") || "";
    const senderEmail = settings.brevo_sender_email || Deno.env.get("BREVO_SENDER_EMAIL") || "noreply@cheapdatahub.com";
    const senderName = settings.brevo_sender_name || "CheapDataHub";

    const htmlBody = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; background: #f9f9f9; padding: 40px 0;">
  <div style="max-width: 480px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
    <div style="background: #e53e3e; padding: 28px 32px;">
      <h1 style="color: #fff; margin: 0; font-size: 22px;">CheapDataHub</h1>
      <p style="color: rgba(255,255,255,0.85); margin: 6px 0 0; font-size: 14px;">Transaction PIN Reset</p>
    </div>
    <div style="padding: 32px;">
      <p style="color: #444; font-size: 15px; margin: 0 0 20px;">Your verification code to reset your transaction PIN is:</p>
      <div style="background: #f3f4f6; border: 2px solid #e53e3e; border-radius: 10px; text-align: center; padding: 20px;">
        <span style="font-size: 48px; font-weight: 900; letter-spacing: 12px; color: #e53e3e;">${otp}</span>
      </div>
      <p style="color: #666; font-size: 13px; margin: 20px 0 0;">This code is valid for <strong>10 minutes</strong>. Do not share it with anyone.</p>
      <p style="color: #999; font-size: 12px; margin: 16px 0 0;">If you did not request this, please ignore this email. Your PIN remains unchanged.</p>
    </div>
    <div style="background: #f9f9f9; padding: 16px 32px; border-top: 1px solid #eee;">
      <p style="color: #aaa; font-size: 11px; margin: 0; text-align: center;">© ${new Date().getFullYear()} CheapDataHub. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`;

    const textBody = `Your CheapDataHub PIN reset code is: ${otp}\n\nThis code expires in 10 minutes. Do not share it with anyone.`;

    if (!brevoApiKey) {
      console.error("No Brevo API key configured. Cannot send OTP email.");
      return new Response(
        JSON.stringify({ error: "Email service not configured. Please contact support." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Send via Brevo transactional email API
    const brevoRes = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": brevoApiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: [{ email }],
        subject: `${otp} — Your CheapDataHub PIN Reset Code`,
        htmlContent: htmlBody,
        textContent: textBody,
      }),
    });

    if (!brevoRes.ok) {
      const errBody = await brevoRes.text();
      console.error("Brevo send failed:", errBody);
      return new Response(
        JSON.stringify({ error: "Failed to send email. Please try again." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("send-otp error:", err);
    return new Response(JSON.stringify({ error: err.message ?? "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
