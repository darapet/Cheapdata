import { corsHeaders, getSupabaseAdmin, verifyAuthToken, getSettings, jsonResponse } from '../_shared/helpers.ts';
import nodemailer from 'npm:nodemailer@6';

const ADMIN_EMAIL = 'daramolapeter98@gmail.com';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResponse({ error: 'Unauthorized' }, 401);

    const supabaseAdmin = getSupabaseAdmin();
    const token = authHeader.replace('Bearer ', '');
    const user = await verifyAuthToken(supabaseAdmin, token);
    if (!user || user.email !== ADMIN_EMAIL) return jsonResponse({ error: 'Forbidden' }, 403);

    const settings = await getSettings(supabaseAdmin);
    const provider = (settings as any)?.email_provider ?? 'brevo';
    const senderEmail = (settings?.brevo_sender_email as string | null)?.trim();
    const senderName = (settings?.brevo_sender_name as string | null)?.trim() || 'CheapDataHub';
    const toEmail = (settings as any)?.admin_email?.trim() || ADMIN_EMAIL;

    if (!senderEmail) {
      return jsonResponse({ error: 'Sender email not configured. Fill in the Sender Email field and save.' }, 400);
    }

    if (provider === 'smtp') {
      // ── SMTP via nodemailer ────────────────────────────────────────────────
      const smtpUser = (settings as any)?.smtp_user?.trim();
      const smtpPass = (settings as any)?.smtp_pass?.trim();
      const smtpHost = (settings as any)?.smtp_host?.trim() || 'smtp-relay.brevo.com';
      const smtpPort = Number((settings as any)?.smtp_port) || 587;

      if (!smtpUser || !smtpPass) {
        return jsonResponse({ error: 'SMTP credentials not configured. Fill in SMTP username and password in Settings and save.' }, 400);
      }

      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: false,
        auth: { user: smtpUser, pass: smtpPass },
      });

      await transporter.sendMail({
        from: `"${senderName}" <${senderEmail}>`,
        to: toEmail,
        subject: '✅ SMTP Test Email — CheapDataHub',
        html: `<div style="font-family:sans-serif;padding:24px;max-width:480px;border:1px solid #e5e7eb;border-radius:8px">
          <h2 style="color:#4f46e5;margin-top:0">SMTP is working! ✓</h2>
          <p style="color:#374151">This is a test email from your CheapDataHub admin panel.</p>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0"/>
          <p style="color:#6b7280;font-size:13px;margin:0">
            <strong>To:</strong> ${toEmail}<br/>
            <strong>From:</strong> ${senderName} &lt;${senderEmail}&gt;<br/>
            <strong>Via:</strong> ${smtpHost}:${smtpPort}
          </p>
        </div>`,
      });

      return jsonResponse({ ok: true, message: `Test email sent to ${toEmail} via SMTP` });

    } else {
      // ── Brevo REST API ─────────────────────────────────────────────────────
      const key = (settings?.brevo_api_key as string | null)?.trim();
      if (!key) return jsonResponse({ error: 'No Brevo API key saved. Save your key first.' }, 400);

      const r = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: { name: senderName, email: senderEmail },
          to: [{ email: toEmail, name: 'Admin' }],
          subject: '✅ Brevo Test Email — CheapDataHub',
          htmlContent: `<div style="font-family:sans-serif;padding:24px;max-width:480px;border:1px solid #e5e7eb;border-radius:8px">
            <h2 style="color:#4f46e5;margin-top:0">Brevo API is working! ✓</h2>
            <p style="color:#374151">This is a test email from your CheapDataHub admin panel.</p>
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0"/>
            <p style="color:#6b7280;font-size:13px;margin:0">
              <strong>To:</strong> ${toEmail}<br/>
              <strong>From:</strong> ${senderName} &lt;${senderEmail}&gt;
            </p>
          </div>`,
        }),
      });

      if (r.ok) return jsonResponse({ ok: true, message: `Test email sent to ${toEmail} via Brevo API` });
      const err = await r.json() as { message?: string; code?: string };
      return jsonResponse({ error: `Brevo error: ${err.message ?? err.code ?? 'unknown'}` }, 400);
    }

  } catch (err) {
    console.error('test-brevo error', err);
    return jsonResponse({ error: `Email error: ${(err as Error).message}` }, 500);
  }
});
