import nodemailer from "nodemailer";
import { supabaseAdmin } from "./supabase.js";

interface SmtpSettings {
  smtp_host: string;
  smtp_port: number;
  smtp_user: string | null;
  smtp_pass: string | null;
  brevo_sender_email: string;
  brevo_sender_name: string;
}

async function getEmailSettings(): Promise<SmtpSettings> {
  const { data } = await supabaseAdmin
    .from("system_settings")
    .select("smtp_host, smtp_port, smtp_user, smtp_pass, brevo_sender_email, brevo_sender_name")
    .maybeSingle();
  return {
    smtp_host: (data as any)?.smtp_host?.trim() || "smtp-relay.brevo.com",
    smtp_port: Number((data as any)?.smtp_port) || 587,
    smtp_user: (data as any)?.smtp_user?.trim() || null,
    smtp_pass: (data as any)?.smtp_pass?.trim() || null,
    brevo_sender_email: data?.brevo_sender_email?.trim() || "",
    brevo_sender_name: data?.brevo_sender_name?.trim() || "CheapDataHub",
  };
}

async function sendEmail(
  settings: SmtpSettings,
  to: { email: string; name: string },
  subject: string,
  html: string
): Promise<void> {
  if (!settings.smtp_user || !settings.smtp_pass) return;

  const transporter = nodemailer.createTransport({
    host: settings.smtp_host,
    port: settings.smtp_port,
    secure: false,
    auth: { user: settings.smtp_user, pass: settings.smtp_pass },
  });

  const fromEmail = settings.brevo_sender_email || settings.smtp_user;
  await transporter.sendMail({
    from: `"${settings.brevo_sender_name}" <${fromEmail}>`,
    to: `"${to.name}" <${to.email}>`,
    subject,
    html,
  });
}

export interface TransactionEmailParams {
  toEmail: string;
  toName: string;
  type: "credit" | "debit";
  description: string;
  amount: number;
  reference: string;
  status: "successful" | "failed";
}

export async function sendTransactionEmail(params: TransactionEmailParams): Promise<void> {
  const settings = await getEmailSettings();
  if (!settings.smtp_user || !settings.smtp_pass) return;

  const isCredit = params.type === "credit";
  const statusOk = params.status === "successful";
  const statusColor = statusOk ? "#16a34a" : "#dc2626";
  const statusBg = statusOk ? "#dcfce7" : "#fee2e2";
  const statusLabel = statusOk ? "Successful" : "Failed";
  const amountStr = `₦${params.amount.toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
  const year = new Date().getFullYear();

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Inter,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:40px 0;">
    <tr><td align="center">
      <table width="580" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08);">
        <tr>
          <td style="background:linear-gradient(135deg,#7c3aed,#6d28d9);padding:32px;text-align:center;">
            <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;letter-spacing:-.5px;">${settings.brevo_sender_name}</h1>
            <p style="margin:6px 0 0;color:rgba(255,255,255,.75);font-size:13px;">Transaction Notification</p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 8px;font-size:16px;color:#374151;">Hi <strong>${params.toName}</strong>,</p>
            <p style="margin:0 0 24px;font-size:14px;color:#6b7280;">Your transaction has been processed. Here are the details:</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:12px;border:1px solid #e5e7eb;margin-bottom:24px;">
              <tr>
                <td style="padding:14px 16px;border-bottom:1px solid #e5e7eb;">
                  <span style="font-size:12px;color:#9ca3af;display:block;margin-bottom:2px;">Description</span>
                  <span style="font-size:14px;color:#111827;font-weight:600;">${params.description}</span>
                </td>
              </tr>
              <tr>
                <td style="padding:14px 16px;border-bottom:1px solid #e5e7eb;">
                  <span style="font-size:12px;color:#9ca3af;display:block;margin-bottom:2px;">Amount</span>
                  <span style="font-size:20px;font-weight:700;color:${isCredit ? "#16a34a" : "#111827"};">${isCredit ? "+" : "-"}${amountStr}</span>
                </td>
              </tr>
              <tr>
                <td style="padding:14px 16px;border-bottom:1px solid #e5e7eb;">
                  <span style="font-size:12px;color:#9ca3af;display:block;margin-bottom:2px;">Reference</span>
                  <span style="font-size:12px;color:#374151;font-family:monospace;">${params.reference}</span>
                </td>
              </tr>
              <tr>
                <td style="padding:14px 16px;">
                  <span style="font-size:12px;color:#9ca3af;display:block;margin-bottom:6px;">Status</span>
                  <span style="background:${statusBg};color:${statusColor};padding:4px 14px;border-radius:20px;font-size:12px;font-weight:600;">${statusLabel}</span>
                </td>
              </tr>
            </table>
            <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;line-height:1.6;">
              If you did not initiate this transaction, please contact support immediately.<br>
              &copy; ${year} ${settings.brevo_sender_name}. All rights reserved.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  try {
    await sendEmail(settings, { email: params.toEmail, name: params.toName }, `Transaction ${statusLabel}: ${params.description}`, html);
  } catch {
    // Non-fatal — never crash the main flow
  }
}

export async function sendWelcomeEmail(toEmail: string, toName: string): Promise<void> {
  const settings = await getEmailSettings();
  if (!settings.smtp_user || !settings.smtp_pass) return;

  const year = new Date().getFullYear();
  const firstName = toName.split(" ")[0] || toName;

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Inter,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:40px 0;">
    <tr><td align="center">
      <table width="580" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08);">
        <tr>
          <td style="background:linear-gradient(135deg,#7c3aed,#6d28d9);padding:40px 32px;text-align:center;">
            <h1 style="margin:0;color:#fff;font-size:26px;font-weight:700;letter-spacing:-.5px;">${settings.brevo_sender_name}</h1>
            <p style="margin:8px 0 0;color:rgba(255,255,255,.8);font-size:14px;">Welcome to the family! 🎉</p>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 32px;">
            <p style="margin:0 0 8px;font-size:18px;font-weight:700;color:#111827;">Hi ${firstName}, welcome aboard! 👋</p>
            <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.7;">
              Your account has been created successfully. You can now enjoy fast, affordable data, airtime, cable TV, and electricity top-ups — all in one place.
            </p>
            <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;line-height:1.6;">
              Questions? Contact our support team anytime.<br>
              &copy; ${year} ${settings.brevo_sender_name}. All rights reserved.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  try {
    await sendEmail(settings, { email: toEmail, name: toName }, `Welcome to ${settings.brevo_sender_name}! 🎉`, html);
  } catch {
    // Non-fatal
  }
}
