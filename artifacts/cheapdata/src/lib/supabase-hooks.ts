import { useQuery, useMutation } from '@tanstack/react-query'
import { supabase } from './supabase'
import { useAuth } from '@/hooks/useAuth'
import crypto from 'crypto-js'

// ── Query key helpers ──────────────────────────────────────────────────────────
export const getGetProfileQueryKey = () => ['profile']
export const getGetTransactionsQueryKey = () => ['transactions']
export const getGetDataPlansQueryKey = (network?: string) => ['data-plans', network]
export const getGetSystemSettingsQueryKey = () => ['system-settings']
export const getAdminStatsQueryKey = () => ['admin-stats']
export const getAdminUsersQueryKey = () => ['admin-users']
export const getAdminTransactionsQueryKey = () => ['admin-transactions']

// ── PIN hashing ────────────────────────────────────────────────────────────────
function hashPin(pin: string): string {
  return crypto.SHA256(pin + 'cheapdatahub_salt').toString()
}

// ── Profile ────────────────────────────────────────────────────────────────────
export function useGetProfile() {
  const { user } = useAuth()
  return useQuery({
    queryKey: getGetProfileQueryKey(),
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user!.id)
        .single()
      if (error) throw error
      return data
    },
  })
}

export function useUpdateProfile() {
  const { user } = useAuth()
  return useMutation({
    mutationFn: async ({ data }: { data: { full_name?: string; phone?: string } }) => {
      const { error } = await supabase
        .from('profiles')
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq('id', user!.id)
      if (error) throw error
    },
  })
}

// ── PIN management ─────────────────────────────────────────────────────────────
export function useSetupPin() {
  const { user } = useAuth()
  return useMutation({
    mutationFn: async ({ data }: { data: { pin: string } }) => {
      const { error } = await supabase
        .from('profiles')
        .update({ transaction_pin: hashPin(data.pin) })
        .eq('id', user!.id)
      if (error) throw error
    },
  })
}

export function useVerifyPin() {
  const { user } = useAuth()
  return useMutation({
    mutationFn: async ({ data }: { data: { pin: string } }) => {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('transaction_pin')
        .eq('id', user!.id)
        .single()
      if (error) throw error
      const valid = profile?.transaction_pin === hashPin(data.pin)
      return { valid }
    },
  })
}

// ── Wallet ─────────────────────────────────────────────────────────────────────
export function useGetWalletBalance() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['wallet-balance'],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('wallet_balance')
        .eq('id', user!.id)
        .single()
      if (error) throw error
      return data?.wallet_balance ?? 0
    },
  })
}

export function useInitializeFunding() {
  const { user } = useAuth()
  return useMutation({
    mutationFn: async ({ data }: { data: { amount: number; gateway: 'paystack' | 'flutterwave' } }) => {
      const settings = await getPublicSettings()
      const ref = `FUND-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
      const totalAmount = data.amount + 50

      await supabase.from('wallet_fundings').insert({
        user_id: user!.id,
        type: 'credit',
        amount: data.amount,
        processing_fee: 50,
        total_amount: totalAmount,
        status: 'pending',
        payment_gateway: data.gateway,
        reference: ref,
        description: 'Wallet Funding',
      })

      if (data.gateway === 'paystack') {
        return {
          gateway: 'paystack',
          reference: ref,
          public_key: settings?.paystack_public_key || '',
          amount: totalAmount * 100,
        }
      } else {
        return {
          gateway: 'flutterwave',
          reference: ref,
          public_key: settings?.flutterwave_public_key || '',
          amount: totalAmount,
        }
      }
    },
  })
}

// ── Transactions ───────────────────────────────────────────────────────────────
export function useGetTransactions() {
  const { user } = useAuth()
  return useQuery({
    queryKey: getGetTransactionsQueryKey(),
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wallet_fundings')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return data ?? []
    },
  })
}

// ── Data plans ─────────────────────────────────────────────────────────────────
export function useGetDataPlans(network?: string) {
  return useQuery({
    queryKey: getGetDataPlansQueryKey(network),
    queryFn: async () => {
      let query = supabase
        .from('data_plans')
        .select('*')
        .eq('is_active', true)
        .order('retail_price', { ascending: true })
      if (network) query = query.eq('network', network)
      const { data, error } = await query
      if (error) throw error
      return data ?? []
    },
  })
}

// ── Settings (public) ──────────────────────────────────────────────────────────
async function getPublicSettings() {
  const { data } = await supabase
    .from('system_settings')
    .select('paystack_public_key, flutterwave_public_key, active_payment_gateway')
    .maybeSingle()
  return data
}

export function useGetPublicSettings() {
  return useQuery({
    queryKey: ['public-settings'],
    queryFn: getPublicSettings,
  })
}

// ── Admin: Settings (via backend API to bypass RLS on secret keys) ─────────────
async function authHeaders() {
  const { data } = await supabase.auth.getSession()
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` }
}

export function useAdminGetSettings() {
  return useQuery({
    queryKey: getGetSystemSettingsQueryKey(),
    queryFn: async () => {
      const res = await fetch('/api/admin/settings', { headers: await authHeaders() })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
  })
}

export function useAdminUpdateSettings() {
  return useMutation({
    mutationFn: async ({ data }: { data: Record<string, string> }) => {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error(await res.text())
    },
  })
}

// ── Admin: Stats ───────────────────────────────────────────────────────────────
export function useAdminGetStats() {
  return useQuery({
    queryKey: getAdminStatsQueryKey(),
    queryFn: async () => {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const todayStr = today.toISOString()

      const [usersRes, txRes, todayTxRes] = await Promise.all([
        supabase.from('profiles').select('id, wallet_balance, created_at'),
        supabase.from('wallet_fundings').select('amount, type, status'),
        supabase.from('wallet_fundings').select('amount, type, status').gte('created_at', todayStr),
      ])

      const users = usersRes.data ?? []
      const allTx = txRes.data ?? []
      const todayTx = todayTxRes.data ?? []

      const total_users = users.length
      const total_revenue = allTx
        .filter(t => t.type === 'credit' && t.status === 'completed')
        .reduce((s, t) => s + (t.amount ?? 0), 0)
      const total_transactions = allTx.length
      const today_revenue = todayTx
        .filter(t => t.type === 'credit' && t.status === 'completed')
        .reduce((s, t) => s + (t.amount ?? 0), 0)
      const today_transactions = todayTx.length
      const total_disbursed = allTx
        .filter(t => t.type === 'debit' && t.status === 'completed')
        .reduce((s, t) => s + (t.amount ?? 0), 0)

      return {
        total_users,
        total_revenue,
        total_transactions,
        today_revenue,
        today_transactions,
        total_disbursed,
      }
    },
  })
}

// ── Admin: Users ───────────────────────────────────────────────────────────────
export function useAdminGetUsers() {
  return useQuery({
    queryKey: getAdminUsersQueryKey(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })
}

export function useAdminCreditWallet() {
  return useMutation({
    mutationFn: async ({ userId, amount, description }: { userId: string; amount: number; description: string }) => {
      const ref = `ADMIN-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
      const { data: profile } = await supabase.from('profiles').select('wallet_balance').eq('id', userId).single()
      const newBalance = (profile?.wallet_balance ?? 0) + amount
      const { error } = await supabase.from('profiles').update({ wallet_balance: newBalance }).eq('id', userId)
      if (error) throw error
      await supabase.from('wallet_fundings').insert({
        user_id: userId,
        type: 'credit',
        amount,
        description: description || 'Admin Credit',
        status: 'completed',
        reference: ref,
        payment_gateway: 'admin',
      })
    },
  })
}

// ── Admin: Transactions ────────────────────────────────────────────────────────
export function useAdminGetTransactions() {
  return useQuery({
    queryKey: getAdminTransactionsQueryKey(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wallet_fundings')
        .select('*, profiles(full_name, email, phone)')
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error
      return data ?? []
    },
  })
}

// ── Admin: Test Paystack key ───────────────────────────────────────────────────
export function useAdminTestPaystack() {
  return useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/admin/test-paystack', {
        method: 'POST',
        headers: await authHeaders(),
      })
      const body = await res.json() as { ok?: boolean; message?: string; error?: string }
      if (!res.ok) throw new Error(body.error ?? 'Test failed')
      return body.message ?? 'Success'
    },
  })
}

// ── Admin: Test Brevo (send test email) ───────────────────────────────────────
export function useAdminTestBrevo() {
  return useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/admin/test-brevo', {
        method: 'POST',
        headers: await authHeaders(),
      })
      const body = await res.json() as { ok?: boolean; message?: string; error?: string }
      if (!res.ok) throw new Error(body.error ?? 'Test failed')
      return body.message ?? 'Success'
    },
  })
}

// ── Admin: Test Flutterwave key ───────────────────────────────────────────────
export function useAdminTestFlutterwave() {
  return useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/admin/test-flutterwave', {
        method: 'POST',
        headers: await authHeaders(),
      })
      const body = await res.json() as { ok?: boolean; message?: string; error?: string }
      if (!res.ok) throw new Error(body.error ?? 'Test failed')
      return body.message ?? 'Success'
    },
  })
}
