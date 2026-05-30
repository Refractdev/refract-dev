// src/renderer/lib/supabase.ts
import { createClient } from '@supabase/supabase-js'

const url  = (typeof import.meta.env !== 'undefined' ? import.meta.env.VITE_SUPABASE_URL : process.env.VITE_SUPABASE_URL) as string
const key  = (typeof import.meta.env !== 'undefined' ? import.meta.env.VITE_SUPABASE_ANON_KEY : process.env.VITE_SUPABASE_ANON_KEY) as string

const maskedUrl = url ? `${url.slice(0, 20)}...` : 'undefined'
const hasKey = !!key
console.log(`[supabase] Initializing — URL: ${maskedUrl}, key present: ${hasKey}`)

if (!url || !key) {
  console.error('[supabase] Keys missing!', { url, key })
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env')
}

export const supabase = createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
})

console.log('[supabase] Client created successfully')

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UserProfile {
  id: string
  auth_id: string
  name: string
  email: string
  github_token?: string | null
  github_installation_id?: number | null
  onboarding_completed: boolean
  onboarding_answers?: Record<string, any>
  language: 'en' | 'pt' | 'es' | 'fr' | 'de'
  theme: 'light' | 'dark'
  avatar_url: string | null
  created_at: string
}
