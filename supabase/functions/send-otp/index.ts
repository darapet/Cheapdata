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

function buildOtpHtml(senderName: string, fullName: string, otp: string): string {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;background:#f3f4f6;">
<tr><td align="center"><table width="520" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;">
<tr><td style="background:linear-gradient(135deg,#7c3aed,#6d28d9);padding:28px;text-align:center;">
<h1 style="margin:0;color:#fff;font-size:20px;">${senderName}</h1></td></tr>
<tr><td style="padding:32px;">
<p style="margin:0 0 12px;font-size:15px;color:#374151;">Hi <strong>${fullName || 'there'}</strong>,</p>
<p style="margin:0 0 24px;font-size:14px;color:#6b7280;">You requested a Transaction PIN reset. Use the code below — expires in <strong>10 minutes</strong>.</p>
<div style="background:#f9fafb;border:2px dashed #e5e7eb;border-radius:12px;padding:24px;text-align:center;margin:0 0 24px;">
<p style="margin:0 0 6px;font-size:12px;color:#9ca3af;letter-spacing:1px;text-transform:uppercase;">Your Reset Code</p>
<p style="margin:0;font-size:42px;font-weight:900;letter-spacing:12px;color:#7c3aed;">${otp}</p>
</div>
<p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">If you did not request this, ignore this email.</p>
</td></tr></table></td></tr></table></body></html>`;
}

async function sendOtpEmail(settings: any, toEmail: string, toName: string, otp: string): Promise<void> {
  const provider    = (settings?.email_provider as string | null) ?? 'brevo';
  const senderEmail = (settings?.brevo_sender_email as string | null)?.trim() ?? '';
  const senderName  = (settings?.brevo_sender_name  as string | null)?.trim() || 'CheapDataHub';
  const html        = buildOtpHtml(senderName, toName, otp);
  const subject     = `${otp} — Your ${senderName} PIN Reset Code`;

  if (!senderEmail) throw new Error('Sender email not configured in admin settings.');

  if (provider === 'smtp') {
    const smtpUser = (settings?.smtp_user as string | null)?.trim();
    const smtpPass = (settings?.smtp_pass as string | null)?.trim();
    const smtpHost = (settings?.smtp_host as string | null)?.trim() || 'smtp-relay.brevo.com';
    const smtpPort = Number(settings?.smtp_port) || 587;

    if (!smtpUser || !smtpPass) throw new Error('SMTP credentials not configured in admin settings.');

    const { default: nodemailer } = await import('npm:nodemailer@6');
    const transporter = nodemailer.createTransport({
      host: smtpHost, port: smtpPort, secure: false,
      auth: { user: smtpUser, pass: smtpPass },
    });
    await transporter.sendMail({
      from: `"${senderName}" <${senderEmail}>`,
      to: `"${toName}" <${toEmail}>`,
      subject,
      html,
    });

  } else {
    // Brevo REST API (default)
    const brevoKey = (settings?.brevo_api_key as string | null)?.trim();
    if (!brevoKey) throw new Error('Brevo API key not configured in admin settings.');

    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': brevoKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: [{ email: toEmail, name: toName || 'Customer' }],
        subject,
        htmlContent: html,
      }),
    });
    if (!r.ok) {
      const err = await r.text();
      throw new Error(`Brevo API error ${r.status}: ${err.slice(0, 200)}`);
    }
  }
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

      const requestEmail = (body as any).email?.toString().trim().toLowerCase();

      const [profileRes, settings] = await Promise.all([
        supabaseAdmin.from('profiles').select('email, full_name').eq('id', user.id).single(),
        getSettings(supabaseAdmin),
      ]);

      const profile = profileRes.data;

      // Use the email the user typed in, falling back to what's in the profile
      const toEmail = requestEmail || profile?.email || '';
      const toName  = profile?.full_name || '';

      console.log('[send-otp] user:', user.id, '| sending to:', toEmail || 'MISSING', '| provider:', settings?.email_provider ?? 'brevo');

      if (!toEmail) {
        return jsonResponse({ success: false, message: 'No email address found. Please enter your email address.' }, 400);
      }

      // If user typed an email and their profile doesn't have one, save it now
      if (requestEmail && !profile?.email) {
        await supabaseAdmin.from('profiles').upsert({ id: user.id, email: requestEmail }, { onConflict: 'id' });
      }

      try {
        await sendOtpEmail(settings, toEmail, toName, otp);
        console.log('[send-otp] Email sent to:', toEmail);
      } catch (emailErr: any) {
        console.error('[send-otp] Email send failed:', emailErr.message);
        return jsonResponse({ success: false, message: `Could not send email: ${emailErr.message}` }, 500);
      }

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
