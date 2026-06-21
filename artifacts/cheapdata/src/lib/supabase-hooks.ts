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

// ── API helpers ───────────────────────────────────────────────────────────────
// EDGE_BASE: Supabase Edge Functions (for buy-data, buy-airtime, etc.)
const EDGE_BASE = (import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '') + '/functions/v1';

// API_BASE: Express backend — set VITE_API_BASE_URL in your GitHub Actions secrets
// e.g. https://your-app.replit.app  (no trailing slash)
const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` };
}

async function apiPost(path: string, body?: unknown) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: await authHeaders(),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json() as Record<string, unknown>;
  if (!res.ok) throw new Error((json.error as string) ?? `Request failed: ${res.status}`);
  return json;
}

async function apiGet(path: string) {
  const res = await fetch(`${API_BASE}${path}`, { headers: await authHeaders() });
  const json = await res.json() as Record<string, unknown>;
  if (!res.ok) throw new Error((json.error as string) ?? `Request failed: ${res.status}`);
  return json;
}

// ── Service hooks — routed through Supabase Edge Functions ───────────────────
// Edge functions run server-side so they can call CheapDataHub without CORS issues.

export function useBuyData() {
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
  });
}

export function useBuyAirtime() {
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
  });
}

export function useBuyCable() {
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
  });
}

export function useBuyElectricity() {
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
// Calls the Express backend so the secret key never leaves the server.
export function useAdminTestPaystack() {
  return useMutation({
    mutationFn: async () => {
      const json = await apiPost('/api/admin/test-paystack');
      return (json.message as string) ?? 'Paystack key is valid ✓';
    },
  });
}

// ── Admin: Test Brevo ─────────────────────────────────────────────────────────
// Calls the Express backend so the API key never leaves the server.
export function useAdminTestBrevo() {
  return useMutation({
    mutationFn: async () => {
      const json = await apiPost('/api/admin/test-brevo');
      return (json.message as string) ?? 'Test email sent';
    },
  });
}

// ── Admin: Test Flutterwave key ───────────────────────────────────────────────
// Calls the Express backend so the secret key never leaves the server.
export function useAdminTestFlutterwave() {
  return useMutation({
    mutationFn: async () => {
      const json = await apiPost('/api/admin/test-flutterwave');
      return (json.message as string) ?? 'Flutterwave key is valid ✓';
    },
  });
}

// ── Admin: Test CheapDataHub API key (checks wallet balance) ─────────────────
// Calls the Express backend so the API key never leaves the server.
export function useAdminTestCheapDataHub() {
  return useMutation({
    mutationFn: async () => {
      const json = await apiGet('/api/admin/cheapdatahub-balance');
      return (json.message as string) ?? `CheapDataHub key is valid ✓ — Wallet Balance: ₦${Number(json.balance).toLocaleString()}`;
    },
  });
}

// ── Admin: Manual CheapDataHub top-up via Paystack transfer ──────────────────
// Calls the Express backend so the Paystack secret key never leaves the server.
export function useAdminTopupCheapDataHub() {
  return useMutation({
    mutationFn: async ({ amount }: { amount: number }) => {
      const json = await apiPost('/api/admin/cheapdatahub-topup', { amount });
      return (json.message as string) ?? `₦${amount.toLocaleString()} transfer initiated!`;
    },
  });
}

// ── Buy Education (WAEC / NECO / JAMB / GCE result checker PINs) ──────────────
export function useBuyEducation() {
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
  });
}
