import { createClient } from '@supabase/supabase-js'

/**
 * Client dengan service role key: melewati RLS. Hanya dipakai di server
 * (route /api/sync) setelah token kasir divalidasi.
 */
export function createAdminClient(syncToken?: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY belum diset')
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: syncToken ? { headers: { 'x-sync-token': syncToken } } : undefined,
  })
}
