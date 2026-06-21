import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

export function getSupabaseAdmin() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function verifyAuthToken(supabaseAdmin: ReturnType<typeof getSupabaseAdmin>, token: string) {
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

export async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin + 'cheapdatahub_salt');
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyUserPin(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  pin: string,
): Promise<boolean> {
  const { data } = await supabaseAdmin.from('profiles').select('transaction_pin').eq('id', userId).single();
  if (!data?.transaction_pin) return false;
  return data.transaction_pin === await hashPin(pin);
}

export async function getSettings(supabaseAdmin: ReturnType<typeof getSupabaseAdmin>) {
  const { data } = await supabaseAdmin.from('system_settings').select('*').maybeSingle();
  return data;
}

export async function getUserProfile(supabaseAdmin: ReturnType<typeof getSupabaseAdmin>, userId: string) {
  const { data } = await supabaseAdmin.from('profiles').select('email, full_name').eq('id', userId).single();
  return data;
}

export function makeRef(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

export async function cheapdatahubCall(
  apiKey: string,
  endpoint: string,
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; body: Record<string, unknown> }> {
  const url = `https://www.cheapdatahub.ng/api/v1/resellers/${endpoint}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json() as Record<string, unknown>;
  const ok = res.ok && (body.status === true || body.code === 'success' || body.success === true);
  return { ok, body };
}

export async function deductWallet(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  amount: number,
  description: string,
  reference: string,
): Promise<{ success: boolean; message?: string; newBalance?: number }> {
  const { data: profile } = await supabaseAdmin
    .from('profiles').select('wallet_balance').eq('id', userId).single();
  if (!profile || profile.wallet_balance < amount) {
    return { success: false, message: 'Insufficient wallet balance. Please fund your wallet.' };
  }
  const newBalance = Number(profile.wallet_balance) - amount;
  await supabaseAdmin.from('profiles').update({ wallet_balance: newBalance }).eq('id', userId);
  await supabaseAdmin.from('wallet_fundings').insert({
    user_id: userId, type: 'debit', amount, description, status: 'pending', reference,
  });
  return { success: true, newBalance };
}

export async function refundWallet(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  amount: number,
  reference: string,
) {
  const { data: profile } = await supabaseAdmin
    .from('profiles').select('wallet_balance').eq('id', userId).single();
  const newBalance = (Number(profile?.wallet_balance) ?? 0) + amount;
  await supabaseAdmin.from('profiles').update({ wallet_balance: newBalance }).eq('id', userId);
  await supabaseAdmin.from('wallet_fundings').update({ status: 'refunded' }).eq('reference', reference);
}

export async function updateTxStatus(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  reference: string,
  status: string,
) {
  await supabaseAdmin.from('wallet_fundings').update({ status }).eq('reference', reference);
}

export async function sendReceipt(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  description: string,
  amount: number,
  reference: string,
  status: 'successful' | 'failed',
) {
  try {
    const [settings, profile] = await Promise.all([
      getSettings(supabaseAdmin),
      getUserProfile(supabaseAdmin, userId),
    ]);
    if (!settings?.brevo_api_key || !settings?.brevo_sender_email || !profile?.email) return;

    const senderName = settings.brevo_sender_name || 'CheapDataHub';
    const statusOk = status === 'successful';
    const statusColor = statusOk ? '#16a34a' : '#dc2626';
    const statusBg = statusOk ? '#dcfce7' : '#fee2e2';
    const amountStr = `₦${Number(amount).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
    const year = new Date().getFullYear();

    const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:40px 0;">
<tr><td align="center"><table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;">
<tr><td style="background:linear-gradient(135deg,#7c3aed,#6d28d9);padding:28px;text-align:center;">
<h1 style="margin:0;color:#fff;font-size:20px;">${senderName}</h1></td></tr>
<tr><td style="padding:28px;">
<p style="margin:0 0 16px;font-size:15px;color:#374151;">Hi <strong>${profile.full_name || 'Customer'}</strong>,</p>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb;">
<tr><td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;">
<span style="font-size:12px;color:#9ca3af;">Description</span>
<p style="margin:2px 0 0;font-size:14px;color:#111827;font-weight:600;">${description}</p></td></tr>
<tr><td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;">
<span style="font-size:12px;color:#9ca3af;">Amount</span>
<p style="margin:2px 0 0;font-size:20px;font-weight:700;color:#111827;">-${amountStr}</p></td></tr>
<tr><td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;">
<span style="font-size:12px;color:#9ca3af;">Reference</span>
<p style="margin:2px 0 0;font-size:12px;font-family:monospace;color:#374151;">${reference}</p></td></tr>
<tr><td style="padding:12px 16px;">
<span style="font-size:12px;color:#9ca3af;">Status</span>
<p style="margin:6px 0 0;"><span style="background:${statusBg};color:${statusColor};padding:3px 12px;border-radius:20px;font-size:12px;font-weight:600;">${statusOk ? 'Successful' : 'Failed'}</span></p>
</td></tr></table>
<p style="margin:20px 0 0;font-size:12px;color:#9ca3af;text-align:center;">&copy; ${year} ${senderName}</p>
</td></tr></table></td></tr></table></body></html>`;

    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': settings.brevo_api_key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: { name: senderName, email: settings.brevo_sender_email },
        to: [{ email: profile.email, name: profile.full_name || 'Customer' }],
        subject: `Transaction ${statusOk ? 'Successful' : 'Failed'}: ${description}`,
        htmlContent: html,
      }),
    });
  } catch { /* non-fatal */ }
}

export function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
