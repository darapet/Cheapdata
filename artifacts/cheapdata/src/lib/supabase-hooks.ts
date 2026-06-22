import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import { sendTransactionEmail } from './email';

async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
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
      // Use upsert so this works even if the profile row was never created.
      // If the row already exists (id conflict) it updates; otherwise it inserts.
      const { error } = await supabase.from('profiles').upsert(
        {
          id: user.id,
          email: user.email ?? '',
          transaction_pin: hashedPin,
          is_pin_set: true,
        },
        { onConflict: 'id' }
      );
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
      // Use the safe RPC function — only exposes funding_account & gateway, never secret keys
      const { data: publicSettings } = await supabase.rpc('get_public_settings');
      const settings = Array.isArray(publicSettings) ? publicSettings[0] : publicSettings;
      const reference = makeRef('CDH');
      const total_amount = amount + 50;
      await supabase.from('wallet_fundings').insert({ user_id: user.id, type: 'funding', description: `Wallet Funding N${amount.toLocaleString()}`, amount, status: 'pending', reference });
      return { reference, total_amount, funding_account: (settings as any)?.cheapdatahub_funding_account ?? '0123456789' };
    },
  });
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

// ── API helpers ───────────────────────────────────────────────────────────────
// All admin tests route through Supabase Edge Functions — secret keys stay server-side.
const EDGE_BASE = (import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '') + '/functions/v1';

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` };
}

// ── Service hooks — routed through Supabase Edge Functions ───────────────────

export function useBuyData() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ data }: { data: { phone: string; plan_id: string; network: string; pin: string } }) => {
      const res = await fetch(`${EDGE_BASE}/buy-data`, {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify(data),
      });
      const body = await res.json() as { success: boolean; message: string; reference?: string; new_balance?: number };
      return body;
    },
    onSuccess: (data) => {
      if (data.success) queryClient.invalidateQueries({ queryKey: getGetProfileQueryKey() });
    },
  });
}

export function useBuyAirtime() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ data }: { data: { phone: string; network: string; amount: number; pin: string } }) => {
      const res = await fetch(`${EDGE_BASE}/buy-airtime`, {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify(data),
      });
      const body = await res.json() as { success: boolean; message: string; reference?: string; new_balance?: number };
      return body;
    },
    onSuccess: (data) => {
      if (data.success) queryClient.invalidateQueries({ queryKey: getGetProfileQueryKey() });
    },
  });
}

export function useBuyCable() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ data }: { data: { smart_card_number: string; cable_provider: string; plan_id: string; amount: number; pin: string } }) => {
      const res = await fetch(`${EDGE_BASE}/buy-cable`, {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify(data),
      });
      const body = await res.json() as { success: boolean; message: string; reference?: string; new_balance?: number };
      return body;
    },
    onSuccess: (data) => {
      if (data.success) queryClient.invalidateQueries({ queryKey: getGetProfileQueryKey() });
    },
  });
}

export function useBuyElectricity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ data }: { data: { meter_number: string; disco: string; amount: number; meter_type: string; pin: string } }) => {
      const res = await fetch(`${EDGE_BASE}/buy-electricity`, {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify(data),
      });
      const body = await res.json() as { success: boolean; message: string; token?: string; reference?: string; new_balance?: number };
      return body;
    },
    onSuccess: (data) => {
      if (data.success) queryClient.invalidateQueries({ queryKey: getGetProfileQueryKey() });
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
      const payload: Record<string, any> = {
        admin_email: data.admin_email,
        active_payment_gateway: data.active_payment_gateway,
        cheapdatahub_funding_account: data.cheapdatahub_funding_account,
        cheapdatahub_base_url: data.cheapdatahub_base_url,
        brevo_sender_email: data.brevo_sender_email,
        brevo_sender_name: data.brevo_sender_name,
        cheapdatahub_bank_name: data.cheapdatahub_bank_name ?? '',
        cheapdatahub_bank_code: data.cheapdatahub_bank_code ?? '',
        cheapdatahub_bank_account: data.cheapdatahub_bank_account ?? '',
        cheapdatahub_account_name: data.cheapdatahub_account_name ?? '',
        cheapdatahub_low_balance_threshold: Number(data.cheapdatahub_low_balance_threshold ?? 5000),
        cheapdatahub_topup_amount: Number(data.cheapdatahub_topup_amount ?? 20000),
        cheapdatahub_auto_fund: Boolean(data.cheapdatahub_auto_fund),
        email_provider: data.email_provider || 'brevo',
        smtp_host: data.smtp_host || 'smtp-relay.brevo.com',
        smtp_port: Number(data.smtp_port ?? 587),
      };
      if ((data.paystack_secret_key as string)?.trim()) payload.paystack_secret_key = (data.paystack_secret_key as string).trim();
      if ((data.paystack_public_key as string)?.trim()) payload.paystack_public_key = (data.paystack_public_key as string).trim();
      if ((data.flutterwave_secret_key as string)?.trim()) payload.flutterwave_secret_key = (data.flutterwave_secret_key as string).trim();
      if ((data.flutterwave_public_key as string)?.trim()) payload.flutterwave_public_key = (data.flutterwave_public_key as string).trim();
      if ((data.cheapdatahub_api_key as string)?.trim()) payload.cheapdatahub_api_key = (data.cheapdatahub_api_key as string).trim();
      if ((data.brevo_api_key as string)?.trim()) payload.brevo_api_key = (data.brevo_api_key as string).trim();
      if ((data.smtp_user as string)?.trim()) payload.smtp_user = (data.smtp_user as string).trim();
      if ((data.smtp_pass as string)?.trim()) payload.smtp_pass = (data.smtp_pass as string).trim();

      const { data: existing } = await supabase.from('system_settings').select('id').maybeSingle();
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
// Routes through Supabase Edge Function — secret key never seen by the browser.
export function useAdminTestPaystack() {
  return useMutation({
    mutationFn: async () => {
      const r = await fetch(`${EDGE_BASE}/test-paystack`, { headers: await authHeaders() });
      const body = await r.json() as { ok?: boolean; message?: string; error?: string };
      if (!r.ok || body.error) throw new Error(body.error ?? 'Paystack test failed.');
      return body.message ?? 'Paystack key is valid ✓';
    },
  });
}

// ── Admin: Test SMTP ──────────────────────────────────────────────────────────
// Routes through Supabase Edge Function — SMTP credentials never seen by the browser.
export function useAdminTestBrevo() {
  return useMutation({
    mutationFn: async () => {
      const r = await fetch(`${EDGE_BASE}/test-brevo`, {
        method: 'POST',
        headers: await authHeaders(),
      });
      const body = await r.json() as { ok?: boolean; message?: string; error?: string };
      if (!r.ok || body.error) throw new Error(body.error ?? 'SMTP test failed.');
      return body.message ?? 'Test email sent';
    },
  });
}

// ── Admin: Test Flutterwave key ───────────────────────────────────────────────
// Routes through Supabase Edge Function — secret key never seen by the browser.
export function useAdminTestFlutterwave() {
  return useMutation({
    mutationFn: async () => {
      const r = await fetch(`${EDGE_BASE}/test-flutterwave`, { headers: await authHeaders() });
      const body = await r.json() as { ok?: boolean; message?: string; error?: string };
      if (!r.ok || body.error) throw new Error(body.error ?? 'Flutterwave test failed.');
      return body.message ?? 'Flutterwave key is valid ✓';
    },
  });
}

// ── Admin: Test CheapDataHub API key (checks wallet balance) ─────────────────
// Routes through Supabase Edge Function — API key never seen by the browser.
export function useAdminTestCheapDataHub() {
  return useMutation({
    mutationFn: async () => {
      const r = await fetch(`${EDGE_BASE}/test-cheapdatahub`, { headers: await authHeaders() });
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

// ── Update user profile ───────────────────────────────────────────────────────
export function useUpdateProfile() {
  return useMutation({
    mutationFn: async ({ data }: { data: { full_name?: string; phone?: string; address?: string } }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('profiles')
        .update({
          ...(data.full_name !== undefined ? { full_name: data.full_name.trim() } : {}),
          ...(data.phone     !== undefined ? { phone: data.phone.trim() }         : {}),
          ...(data.address   !== undefined ? { address: data.address.trim() }     : {}),
        })
        .eq('id', user.id);
      if (error) throw error;
      return { success: true };
    },
  });
}

// ── Create Dedicated Virtual Account ─────────────────────────────────────────
export function useCreateDva() {
  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`${EDGE_BASE}/create-dva`, {
        method: "POST",
        headers: await authHeaders(),
      });
      const body = await res.json() as { success?: boolean; account_number?: string; account_name?: string; bank_name?: string; error?: string };
      if (!res.ok) throw new Error(body.error ?? "Failed to create account");
      return body;
    },
  });
}

// ── Buy Education (WAEC / NECO / JAMB / GCE result checker PINs) ──────────────
export function useBuyEducation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ data }: { data: { exam_body: string; plan_id: string; quantity: number; pin: string } }) => {
      const res = await fetch(`${EDGE_BASE}/buy-education`, {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify(data),
      });
      const body = await res.json() as { success: boolean; message: string; pins?: string[]; reference?: string; new_balance?: number };
      if (!res.ok) throw new Error(body.message || 'Education purchase failed');
      return body;
    },
    onSuccess: (data) => {
      if (data.success) queryClient.invalidateQueries({ queryKey: getGetProfileQueryKey() });
    },
  });
}
