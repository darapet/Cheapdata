import { corsHeaders, getSupabaseAdmin, verifyAuthToken, getSettings, hashPin, jsonResponse } from '../_shared/helpers.ts';

async function signOtp(otp: string, userId: string, expiresAt: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode('otp_pin_reset_cheapdatahub_2024'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const data = new TextEncoder().encode(`${otp}:${userId}:${expiresAt}`);
  const sig = await crypto.subtle.sign('HMAC', key, data);
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResponse({ success: false, message: 'Unauthorized' }, 401);

    const supabaseAdmin = getSupabaseAdmin();
    const token = authHeader.replace('Bearer ', '');
    const user = await verifyAuthToken(supabaseAdmin, token);
    if (!user) return jsonResponse({ success: false, message: 'Invalid or expired token' }, 401);

    const body = await req.json() as { action: string; otp?: string; token?: string; new_pin?: string };

    // ── ACTION: send ─────────────────────────────────────────────────────────
    if (body.action === 'send') {
      const otp = String(Math.floor(100000 + Math.random() * 900000));
      const expiresAt = Date.now() + 10 * 60 * 1000;
      const signature = await signOtp(otp, user.id, expiresAt);
      const otpToken = `${signature}:${expiresAt}`;

      const [profileRes, settings] = await Promise.all([
        supabaseAdmin.from('profiles').select('email, full_name').eq('id', user.id).single(),
        getSettings(supabaseAdmin),
      ]);

      const profile = profileRes.data;
      const senderEmail = (settings?.brevo_sender_email as string | null)?.trim();
      const senderName  = (settings?.brevo_sender_name  as string | null) || 'CheapDataHub';
      const brevoKey    = (settings?.brevo_api_key       as string | null)?.trim();

      // Log what we found so you can debug in Supabase → Edge Function logs
      console.log('[send-otp] user.id:', user.id);
      console.log('[send-otp] profile email:', profile?.email ?? 'MISSING');
      console.log('[send-otp] senderEmail configured:', !!senderEmail);
      console.log('[send-otp] brevoKey configured:', !!brevoKey);

      // Guard: require all three — give a clear error instead of silent skip
      if (!profile?.email) {
        return jsonResponse({ success: false, message: 'Your account email could not be found. Please contact support.' }, 400);
      }
      if (!senderEmail || !brevoKey) {
        console.error('[send-otp] Email not configured — missing brevo_api_key or brevo_sender_email in system_settings');
        return jsonResponse({ success: false, message: 'Email service is not configured. Please contact the admin.' }, 500);
      }

      const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;background:#f3f4f6;">
<tr><td align="center"><table width="520" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;">
<tr><td style="background:linear-gradient(135deg,#7c3aed,#6d28d9);padding:28px;text-align:center;">
<h1 style="margin:0;color:#fff;font-size:20px;">${senderName}</h1></td></tr>
<tr><td style="padding:32px;">
<p style="margin:0 0 12px;font-size:15px;color:#374151;">Hi <strong>${profile.full_name || 'there'}</strong>,</p>
<p style="margin:0 0 24px;font-size:14px;color:#6b7280;">You requested a Transaction PIN reset. Use the code below — expires in <strong>10 minutes</strong>.</p>
<div style="background:#f9fafb;border:2px dashed #e5e7eb;border-radius:12px;padding:24px;text-align:center;margin:0 0 24px;">
<p style="margin:0 0 6px;font-size:12px;color:#9ca3af;letter-spacing:1px;text-transform:uppercase;">Your Reset Code</p>
<p style="margin:0;font-size:42px;font-weight:900;letter-spacing:12px;color:#7c3aed;">${otp}</p>
</div>
<p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">If you did not request this, ignore this email.</p>
</td></tr></table></td></tr></table></body></html>`;

      const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': brevoKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: { name: senderName, email: senderEmail },
          to: [{ email: profile.email, name: profile.full_name || 'Customer' }],
          subject: `${otp} — Your ${senderName} PIN Reset Code`,
          htmlContent: html,
        }),
      });

      if (!brevoRes.ok) {
        const errBody = await brevoRes.text();
        console.error('[send-otp] Brevo API error:', brevoRes.status, errBody);
        return jsonResponse({ success: false, message: `Failed to send email (Brevo error ${brevoRes.status}). Please try again or contact support.` }, 500);
      }

      console.log('[send-otp] Email sent successfully to:', profile.email);
      return jsonResponse({ success: true, token: otpToken, message: 'OTP sent to your email' });
    }

    // ── ACTION: verify_and_reset ──────────────────────────────────────────────
    if (body.action === 'verify_and_reset') {
      const { otp, token: otpToken, new_pin } = body;

      if (!otp || !otpToken || !new_pin || new_pin.length !== 4) {
        return jsonResponse({ success: false, message: 'OTP, token and 4-digit new PIN are required' }, 400);
      }

      const lastColon = otpToken.lastIndexOf(':');
      if (lastColon === -1) return jsonResponse({ success: false, message: 'Invalid token. Request a new code.' }, 400);

      const signature = otpToken.slice(0, lastColon);
      const expiresAt = parseInt(otpToken.slice(lastColon + 1), 10);

      if (isNaN(expiresAt) || Date.now() > expiresAt) {
        return jsonResponse({ success: false, message: 'Code has expired. Please request a new one.' }, 400);
      }

      const expectedSig = await signOtp(otp, user.id, expiresAt);
      if (signature !== expectedSig) {
        return jsonResponse({ success: false, message: 'Incorrect code. Please check and try again.' }, 400);
      }

      const hashed = await hashPin(new_pin);
      const { error } = await supabaseAdmin
        .from('profiles')
        .update({ transaction_pin: hashed })
        .eq('id', user.id);

      if (error) {
        console.error('[send-otp] PIN update error:', error);
        return jsonResponse({ success: false, message: 'Failed to save PIN. Please try again.' }, 500);
      }

      return jsonResponse({ success: true, message: 'Transaction PIN updated successfully' });
    }

    return jsonResponse({ success: false, message: 'Unknown action' }, 400);

  } catch (err) {
    console.error('[send-otp] Unexpected error:', err);
    return jsonResponse({ success: false, message: 'Server error. Please try again.' }, 500);
  }
});
