import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('[AudiCondo] VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY não configuradas. Configure no ambiente local/CI usado antes do push; Netlify não é mais o fluxo de build deste projeto.')
}

export const supabase = createClient(
    supabaseUrl || 'https://placeholder.supabase.co',
    supabaseAnonKey || 'placeholder',
    {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: false,
            storageKey: 'auditcondo-auth-v2'
        }
    }
)
