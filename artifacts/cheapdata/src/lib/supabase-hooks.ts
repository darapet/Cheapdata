import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import { sendTransactionEmail } from './email';

async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  // Must match server-side salt: pin + "cheapdatahub_salt"
  const data = encoder.encode(pin + 'cheapdatahub_salt');
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function makeRef(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

export const getGetProfileQueryKey = () => ['profile'];
export const getGetWalletTransactionsQueryKey = () => ['transactions'];
export const getGetDataPlansByNetworkQueryKey = (network: string) => ['data-plans', network];
export const getAdminGetStatsQueryKey = () => ['admin-stats'];
export const getAdminGetTransactionsQueryKey = (params?: { date?: string }) => ['admin-transactions', params?.date ?? ''];
export const getAdminGetUsersQueryKey = () => ['admin-users'];
export const getAdminGetSettingsQueryKey = () => ['admin-settings'];

export function useGetProfile(options?: any) {
  return useQuery({
    queryKey: options?.query?.queryKey ?? getGetProfileQueryKey(),
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      if (error) throw error;
      return data;
    },
  });
}

export function useGetWalletTransactions(options?: any) {
  return useQuery({
    queryKey: options?.query?.queryKey ?? getGetWalletTransactionsQueryKey(),
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { data, error } = await supabase.from('wallet_fundings').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useGetDataPlansByNetwork(network: string, options?: any) {
  return useQuery({
    queryKey: options?.query?.queryKey ?? getGetDataPlansByNetworkQueryKey(network),
    queryFn: async () => {
      const { data, error } = await supabase.from('data_plans').select('*').eq('network', network).eq('is_active', true).order('retail_price', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!network,
  });
}

export function useSetupPin() {
  return useMutation({
    mutationFn: async ({ data: { pin } }: { data: { pin: string } }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const hashedPin = await hashPin(pin);
      const { error } = await supabase.from('profiles').update({ transaction_pin: hashedPin, is_pin_set: true }).eq('id', user.id);
      if (error) throw error;
      return { success: true };
    },
  });
}

export function useVerifyPin() {
  return useMutation({
    mutationFn: async ({ data: { pin } }: { data: { pin: string } }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const hashedPin = await hashPin(pin);
      const { data, error } = await supabase.from('profiles').select('transaction_pin').eq('id', user.id).single();
      if (error) throw error;
      return { valid: data?.transaction_pin === hashedPin };
    },
  });
}

export function useInitializeWalletFunding() {
  return useMutation({
    mutationFn: async ({ data: { amount } }: { data: { amount: number } }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { data: settings } = await supabase.from('system_settings').select('cheapdatahub_funding_account').maybeSingle();
      const reference = makeRef('CDH');
      const total_amount = amount + 50;
      await supabase.from('wallet_fundings').insert({ user_id: user.id, type: 'funding', description: `Wallet Funding N${amount.toLocaleString()}`, amount, status: 'pending', reference });
      return { reference, total_amount, funding_account: settings?.cheapdatahub_funding_account ?? '0123456789' };
    },
  });
}

async function getProfileBalance(userId: string) {
  const { data, error } = await supabase.from('profiles').select('wallet_balance').eq('id', userId).single();
  if (error) throw error;
  return (data?.wallet_balance ?? 0) as number;
}

async function getUserProfile(userId: string) {
  const { data } = await supabase.from('profiles').select('email, full_name, wallet_balance').eq('id', userId).single();
  return data;
}

async function deductAndRecord(userId: string, balance: number, amount: number, type: string, description: string, reference: string) {
  const { error: upErr } = await supabase.from('profiles').update({ wallet_balance: balance - amount }).eq('id', userId);
  if (upErr) throw upErr;
  await supabase.from('wallet_fundings').insert({ user_id: userId, type, description, amount, status: 'successful', reference });
  const profile = await getUserProfile(userId);
  if (profile?.email) {
    sendTransactionEmail({ toEmail: profile.email, toName: profile.full_name || 'Customer', type, description, amount, reference, status: 'successful' }).catch(() => {});
  }
}

// ── API helpers for Express backend ───────────────────────────────────────────
const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');
async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` };
}

// ── Service hooks — route through Express (CheapDataHub integration) ──────────
// If API_BASE is set, calls the Express backend which handles CheapDataHub delivery.
// Falls back to Supabase-direct (manual fulfillment mode) if no API server is configured.

export function useBuyData() {
  return useMutation({
    mutationFn: async ({ data }: { data: { phone: string; plan_id: string; network: string; pin: string } }) => {
      if (API_BASE) {
        const res = await fetch(`${API_BASE}/api/services/data`, {
          method: 'POST',
          headers: await authHeaders(),
          body: JSON.stringify(data),
        });
        const body = await res.json() as { success: boolean; message: string };
        return body;
      }
      // Fallback: Supabase direct (no CheapDataHub)
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { data: plan } = await supabase.from('data_plans').select('*').eq('plan_id', data.plan_id).single();
      if (!plan) return { success: false, message: 'Plan not found.' };
      const balance = await getProfileBalance(user.id);
      if (balance < plan.retail_price) return { success: false, message: 'Insufficient wallet balance. Please fund your wallet.' };
      await deductAndRecord(user.id, balance, plan.retail_price, 'data', `${data.network} ${plan.plan_name} to ${data.phone}`, makeRef('DATA'));
      return { success: true, message: `${plan.plan_name} data sent to ${data.phone} successfully!` };
    },
  });
}

export function useBuyAirtime() {
  return useMutation({
    mutationFn: async ({ data }: { data: { phone: string; network: string; amount: number; pin: string } }) => {
      if (API_BASE) {
        const res = await fetch(`${API_BASE}/api/services/airtime`, {
          method: 'POST',
          headers: await authHeaders(),
          body: JSON.stringify(data),
        });
        const body = await res.json() as { success: boolean; message: string };
        return body;
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const balance = await getProfileBalance(user.id);
      if (balance < data.amount) return { success: false, message: 'Insufficient wallet balance. Please fund your wallet.' };
      await deductAndRecord(user.id, balance, data.amount, 'airtime', `${data.network} Airtime N${data.amount.toLocaleString()} to ${data.phone}`, makeRef('AIRTIME'));
      return { success: true, message: `N${data.amount.toLocaleString()} airtime sent to ${data.phone} successfully!` };
    },
  });
}

export function useBuyCable() {
  return useMutation({
    mutationFn: async ({ data }: { data: { smart_card_number: string; cable_provider: string; plan_id: string; amount: number; pin: string } }) => {
      if (API_BASE) {
        const res = await fetch(`${API_BASE}/api/services/cable`, {
          method: 'POST',
          headers: await authHeaders(),
          body: JSON.stringify(data),
        });
        const body = await res.json() as { success: boolean; message: string };
        return body;
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const balance = await getProfileBalance(user.id);
      if (balance < data.amount) return { success: false, message: 'Insufficient wallet balance. Please fund your wallet.' };
      await deductAndRecord(user.id, balance, data.amount, 'cable', `${data.cable_provider} Subscription IUC: ${data.smart_card_number}`, makeRef('CABLE'));
      return { success: true, message: 'Cable TV subscription activated successfully!' };
    },
  });
}

export function useBuyElectricity() {
  return useMutation({
    mutationFn: async ({ data }: { data: { meter_number: string; disco: string; amount: number; meter_type: string; pin: string } }) => {
      if (API_BASE) {
        const res = await fetch(`${API_BASE}/api/services/electricity`, {
          method: 'POST',
          headers: await authHeaders(),
          body: JSON.stringify(data),
        });
        const body = await res.json() as { success: boolean; message: string };
        return body;
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const balance = await getProfileBalance(user.id);
      if (balance < data.amount) return { success: false, message: 'Insufficient wallet balance. Please fund your wallet.' };
      await deductAndRecord(user.id, balance, data.amount, 'electricity', `${data.disco} ${data.meter_type} Token Meter: ${data.meter_number}`, makeRef('ELEC'));
      return { success: true, message: 'Electricity token purchased successfully!' };
    },
  });
}

export function useAdminGetStats(options?: any) {
  return useQuery({
    queryKey: options?.query?.queryKey ?? getAdminGetStatsQueryKey(),
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      const [usersRes, allTxRes, todayTxRes] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('wallet_fundings').select('amount, type'),
        supabase.from('wallet_fundings').select('amount, type').gte('created_at', `${today}T00:00:00`),
      ]);
      const allTx = allTxRes.data ?? [];
      const todayTx = todayTxRes.data ?? [];
      const sum = (arr: { amount: number }[]) => arr.reduce((s, t) => s + (t.amount ?? 0), 0);
      return {
        total_users: usersRes.count ?? 0,
        total_revenue: sum(allTx.filter((t) => t.type === 'funding')),
        total_transactions: allTx.length,
        active_users_today: 0,
        today_revenue: sum(todayTx.filter((t) => t.type !== 'funding')),
        today_transactions: todayTx.length,
        total_disbursed: sum(allTx.filter((t) => t.type !== 'funding')),
      };
    },
  });
}

export function useAdminGetTransactions(params?: { date?: string }, options?: any) {
  return useQuery({
    queryKey: options?.query?.queryKey ?? getAdminGetTransactionsQueryKey(params),
    queryFn: async () => {
      let query = supabase.from('wallet_fundings').select('*, profiles(full_name, email)').order('created_at', { ascending: false });
      if (params?.date) {
        query = query.gte('created_at', `${params.date}T00:00:00`).lte('created_at', `${params.date}T23:59:59`);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).map((tx: any) => ({ ...tx, user_name: tx.profiles?.full_name ?? 'Unknown', user_email: tx.profiles?.email ?? '' }));
    },
  });
}

export function useAdminGetUsers(options?: any) {
  return useQuery({
    queryKey: options?.query?.queryKey ?? getAdminGetUsersQueryKey(),
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAdminGetSettings(options?: any) {
  return useQuery({
    queryKey: options?.query?.queryKey ?? getAdminGetSettingsQueryKey(),
    queryFn: async () => {
      const { data, error } = await supabase.from('system_settings').select('*').maybeSingle();
      if (error) throw error;
      return data ?? { active_payment_gateway: 'paystack', cheapdatahub_funding_account: '' };
    },
  });
}

export function useAdminUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ data }: { data: any }) => {
      const { data: existing } = await supabase.from('system_settings').select('id').maybeSingle();
      const payload: Record<string, any> = {
        admin_email: data.admin_email,
        active_payment_gateway: data.active_payment_gateway,
        cheapdatahub_funding_account: data.cheapdatahub_funding_account,
        cheapdatahub_base_url: data.cheapdatahub_base_url,
        brevo_sender_email: data.brevo_sender_email,
        brevo_sender_name: data.brevo_sender_name,
        // Auto-funding fields
        cheapdatahub_bank_name: data.cheapdatahub_bank_name ?? '',
        cheapdatahub_bank_code: data.cheapdatahub_bank_code ?? '',
        cheapdatahub_bank_account: data.cheapdatahub_bank_account ?? '',
        cheapdatahub_account_name: data.cheapdatahub_account_name ?? '',
        cheapdatahub_low_balance_threshold: Number(data.cheapdatahub_low_balance_threshold ?? 5000),
        cheapdatahub_topup_amount: Number(data.cheapdatahub_topup_amount ?? 20000),
        cheapdatahub_auto_fund: Boolean(data.cheapdatahub_auto_fund),
      };
      if (data.paystack_secret_key) payload.paystack_secret_key = data.paystack_secret_key;
      if (data.paystack_public_key) payload.paystack_public_key = data.paystack_public_key;
      if (data.flutterwave_secret_key) payload.flutterwave_secret_key = data.flutterwave_secret_key;
      if (data.flutterwave_public_key) payload.flutterwave_public_key = data.flutterwave_public_key;
      if (data.cheapdatahub_api_key) payload.cheapdatahub_api_key = data.cheapdatahub_api_key;
      if (data.brevo_api_key) payload.brevo_api_key = data.brevo_api_key;

      let error;
      if (existing) {
        ({ error } = await supabase.from('system_settings').update(payload).eq('id', existing.id));
      } else {
        ({ error } = await supabase.from('system_settings').insert(payload));
      }
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: getAdminGetSettingsQueryKey() });
      return { success: true, message: 'Settings updated.' };
    },
  });
}

// ── Admin: Test Paystack key ───────────────────────────────────────────────────
export function useAdminTestPaystack() {
    return useMutation({
      mutationFn: async () => {
        const { data: s } = await supabase.from('system_settings').select('paystack_secret_key').maybeSingle();
        const key = (s as any)?.paystack_secret_key?.trim();
        if (!key) throw new Error('No Paystack secret key saved yet. Save your key first.');
        const r = await fetch('https://api.paystack.co/transaction?perPage=1', {
          headers: { Authorization: `Bearer ${key}` },
        });
        const body = await r.json() as { status: boolean; message: string };
        if (body.status) return 'Paystack key is valid ✓';
        throw new Error(`Paystack rejected the key: ${body.message}`);
      },
    });
  }

  // ── Admin: Test Brevo ─────────────────────────────────────────────────────────
  export function useAdminTestBrevo() {
    return useMutation({
      mutationFn: async () => {
        const { data: s } = await supabase.from('system_settings').select('brevo_api_key,brevo_sender_email,brevo_sender_name,admin_email').maybeSingle();
        const key = (s as any)?.brevo_api_key?.trim();
        const senderEmail = (s as any)?.brevo_sender_email?.trim();
        const senderName = (s as any)?.brevo_sender_name?.trim() || 'CheapDataHub';
        const toEmail = (s as any)?.admin_email?.trim() || 'daramolapeter98@gmail.com';
        if (!key) throw new Error('No Brevo API key saved yet. Save your key first.');
        if (!senderEmail) throw new Error('Sender email not configured. Fill in the Sender Email field and save.');
        const r = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: { 'api-key': key, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sender: { name: senderName, email: senderEmail },
            to: [{ email: toEmail, name: 'Admin' }],
            subject: '✅ Brevo Test Email — CheapDataHub',
            htmlContent: `<div style="font-family:sans-serif;padding:24px;max-width:480px;border:1px solid #e5e7eb;border-radius:8px"><h2 style="color:#4f46e5;margin-top:0">Brevo is working! ✓</h2><p>This is a test email from your CheapDataHub admin panel.</p><p style="color:#6b7280;font-size:13px"><strong>To:</strong> ${toEmail}<br/><strong>From:</strong> ${senderName} &lt;${senderEmail}&gt;</p></div>`,
          }),
        });
        if (r.ok) return `Test email sent to ${toEmail}`;
        const err = await r.json() as { message: string };
        throw new Error(`Brevo error: ${err.message}`);
      },
    });
  }

  // ── Admin: Test Flutterwave key ───────────────────────────────────────────────
  export function useAdminTestFlutterwave() {
    return useMutation({
      mutationFn: async () => {
        const { data: s } = await supabase.from('system_settings').select('flutterwave_secret_key').maybeSingle();
        const key = (s as any)?.flutterwave_secret_key?.trim();
        if (!key) throw new Error('No Flutterwave secret key saved yet. Save your key first.');
        const r = await fetch('https://api.flutterwave.com/v3/banks/NG', {
          headers: { Authorization: `Bearer ${key}` },
        });
        const body = await r.json() as { status: string; message: string };
        if (body.status === 'success') return 'Flutterwave key is valid ✓';
        throw new Error(`Flutterwave rejected the key: ${body.message}`);
      },
    });
  }

  // ── Admin: Test CheapDataHub API key (checks wallet balance) ─────────────────
  export function useAdminTestCheapDataHub() {
    return useMutation({
      mutationFn: async () => {
        // Must go through the backend — CheapDataHub blocks direct browser requests (CORS)
        const headers = await authHeaders();
        const r = await fetch(`${API_BASE}/api/admin/cheapdatahub-balance`, { headers });
        const body = await r.json() as { ok?: boolean; balance?: unknown; message?: string; error?: string };
        if (!r.ok || body.error) throw new Error(body.error ?? 'Could not reach CheapDataHub. Verify your API key.');
        return body.message ?? `CheapDataHub key is valid ✓ — Wallet Balance: ₦${Number(body.balance).toLocaleString()}`;
      },
    });
  }

  // ── Admin: Manual CheapDataHub top-up via Paystack transfer ──────────────────
  export function useAdminTopupCheapDataHub() {
    return useMutation({
      mutationFn: async ({ amount }: { amount: number }) => {
        const { data: s } = await supabase.from('system_settings').select('*').maybeSingle();
        const settings = s as any;
        if (!settings?.paystack_secret_key) throw new Error('Paystack secret key not configured.');
        if (!settings?.cheapdatahub_bank_account || !settings?.cheapdatahub_bank_code) throw new Error('CheapDataHub bank details not configured. Add them in the Auto-Funding section.');
        if (!amount || amount < 100) throw new Error('Minimum transfer amount is ₦100.');
        let recipientCode = settings.cheapdatahub_paystack_recipient_code as string | null;
        if (!recipientCode) {
          const rRes = await fetch('https://api.paystack.co/transferrecipient', {
            method: 'POST',
            headers: { Authorization: `Bearer ${settings.paystack_secret_key}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'nuban',
              name: settings.cheapdatahub_account_name || 'CheapDataHub',
              account_number: settings.cheapdatahub_bank_account,
              bank_code: settings.cheapdatahub_bank_code,
              currency: 'NGN',
            }),
          });
          const rData = await rRes.json() as { status: boolean; data?: { recipient_code: string } };
          if (!rData.status || !rData.data?.recipient_code) throw new Error('Failed to create transfer recipient. Check bank details.');
          recipientCode = rData.data.recipient_code;
          await supabase.from('system_settings').update({ cheapdatahub_paystack_recipient_code: recipientCode }).eq('id', settings.id);
        }
        const tRes = await fetch('https://api.paystack.co/transfer', {
          method: 'POST',
          headers: { Authorization: `Bearer ${settings.paystack_secret_key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source: 'balance',
            reason: 'CheapDataHub wallet top-up',
            amount: Math.round(amount * 100),
            recipient: recipientCode,
          }),
        });
        const tData = await tRes.json() as { status: boolean; message: string; data?: { transfer_code: string; status: string } };
        if (!tData.status) throw new Error(`Transfer failed: ${tData.message}`);
        return `₦${amount.toLocaleString()} transfer to CheapDataHub initiated! Status: ${tData.data?.status ?? 'pending'}`;
      },
    });
  }

  // ── Buy Education (WAEC / NECO / JAMB / GCE result checker PINs) ──────────────
export function useBuyEducation() {
  return useMutation({
    mutationFn: async ({ data }: { data: { exam_body: string; plan_id: string; quantity: number; pin: string } }) => {
      if (API_BASE) {
        const res = await fetch(`${API_BASE}/api/services/education`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
          body: JSON.stringify(data),
        });
        const body = await res.json() as { success: boolean; message: string; pins?: string[] };
        if (!res.ok) throw new Error(body.message || 'Education purchase failed');
        return body;
      }
      // Fallback: manual mode without API
      return { success: true, message: 'PIN request recorded. You will be notified shortly.', pins: [] };
    },
  });
}
