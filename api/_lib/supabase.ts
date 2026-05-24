import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import ws from 'ws'

function getEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is not defined`)
  return value
}

function getSupabaseUrl(): string {
  return (
    process.env.SUPABASE_URL?.trim() ||
    process.env.VITE_SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    getEnv('SUPABASE_URL')
  )
}

export function getAdminSupabaseClient(): SupabaseClient {
  const url = getSupabaseUrl()
  const serviceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY')

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    realtime: {
      transport: ws as any,
    },
  })
}
