import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

const siteUrl = typeof window !== 'undefined'
  ? window.location.origin + (import.meta.env.BASE_URL || '/')
  : '/'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
  global: {
    headers: { 'x-app-name': 'CheapDataHub' },
  },
})

export { siteUrl }
