import 'server-only'

import { createClient } from '@/utils/supabase/server'
import { platformAccount } from './platform-account'

/** Foundation for the future platform area; no public management endpoint yet. */
export async function requireSuperAdmin() {
  const supabase = await createClient()
  // Fetch current Auth data, rather than trusting a stale JWT/session role.
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Silakan masuk terlebih dahulu.')
  const account = platformAccount(user)
  if (account.role !== 'super_admin' || account.status !== 'active') {
    throw new Error('Hanya super admin aktif yang dapat mengelola platform.')
  }
  return { user, account }
}
