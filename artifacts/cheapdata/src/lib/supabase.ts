import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder'

// Detect the correct site URL (works both on GitHub Pages and locally)
const siteUrl = typeof window !== 'undefined'
  ? window.location.origin + (import.meta.env.BASE_URL || '/')
  : 'https://darapet.github.io/Cheapdata/'

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
