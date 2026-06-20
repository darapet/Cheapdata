import { supabase } from './supabase';

async function getBrevoKey(): Promise<string | null> {
  const { data } = await supabase
    .from('system_settings')
    .select('brevo_api_key')
    .maybeSingle();
  return data?.brevo_api_key || null;
}

interface TransactionEmailParams {
  toEmail: string;
  toName: string;
  type: string;
  description: string;
  amount: number;
  reference: string;
  status: 'successful' | 'failed';
}

export async function sendTransactionEmail(params: TransactionEmailParams): Promise<void> {
  const apiKey = await getBrevoKey();
  if (!apiKey) return;

  const isCredit = params.type === 'funding';
  const statusColor = params.status === 'successful' ? '#16a34a' : '#dc2626';
  const statusLabel = params.status === 'successful' ? 'Successful' : 'Failed';
  const amountFormatted = `₦${params.amount.toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Inter,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:linear-gradient(135deg,#7c3aed,#6d28d9);padding:32px;text-align:center;">
            <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">CheapDataHub</h1>
            <p style="margin:6px 0 0;color:rgba(255,255,255,0.8);font-size:13px;">Transaction Notification</p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 24px;font-size:16px;color:#374151;">Hi <strong>${params.toName}</strong>,</p>
            <p style="margin:0 0 24px;font-size:15px;color:#6b7280;">Your transaction has been processed. Here are the details:</p>

            <table width="100%" cellpadding="12" cellspacing="0" style="background:#f9fafb;border-radius:12px;margin-bottom:24px;">
              <tr>
                <td style="color:#6b7280;font-size:13px;border-bottom:1px solid #e5e7eb;">Description</td>
                <td align="right" style="color:#111827;font-weight:600;font-size:13px;border-bottom:1px solid #e5e7eb;">${params.description}</td>
              </tr>
              <tr>
                <td style="color:#6b7280;font-size:13px;border-bottom:1px solid #e5e7eb;">Amount</td>
                <td align="right" style="color:${isCredit ? '#16a34a' : '#111827'};font-weight:700;font-size:16px;border-bottom:1px solid #e5e7eb;">${isCredit ? '+' : '-'}${amountFormatted}</td>
              </tr>
              <tr>
                <td style="color:#6b7280;font-size:13px;border-bottom:1px solid #e5e7eb;">Reference</td>
                <td align="right" style="color:#111827;font-family:monospace;font-size:12px;border-bottom:1px solid #e5e7eb;">${params.reference}</td>
              </tr>
              <tr>
                <td style="color:#6b7280;font-size:13px;">Status</td>
                <td align="right">
                  <span style="background:${params.status === 'successful' ? '#dcfce7' : '#fee2e2'};color:${statusColor};padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600;">${statusLabel}</span>
                </td>
              </tr>
            </table>

            <p style="margin:0;font-size:13px;color:#9ca3af;text-align:center;">
              If you did not initiate this transaction, please contact support immediately.<br>
              &copy; ${new Date().getFullYear()} CheapDataHub. All rights reserved.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const subject = params.status === 'successful'
    ? `Transaction ${statusLabel}: ${params.description}`
    : `Transaction ${statusLabel}: ${params.description}`;

  await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sender: { name: 'CheapDataHub', email: 'noreply@cheapdatahub.com' },
      to: [{ email: params.toEmail, name: params.toName }],
      subject,
      htmlContent: html,
    }),
  });
}
