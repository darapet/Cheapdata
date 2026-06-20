import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import { sendTransactionEmail } from './email';

async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin);
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

export function useBuyData() {
  return useMutation({
    mutationFn: async ({ data }: { data: { phone: string; plan_id: string; network: string; pin: string } }) => {
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
        active_payment_gateway: data.active_payment_gateway,
        cheapdatahub_funding_account: data.cheapdatahub_funding_account,
        cheapdatahub_base_url: data.cheapdatahub_base_url,
        brevo_sender_email: data.brevo_sender_email,
        brevo_sender_name: data.brevo_sender_name,
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
