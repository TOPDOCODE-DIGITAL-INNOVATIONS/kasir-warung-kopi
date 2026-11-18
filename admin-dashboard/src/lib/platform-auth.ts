import 'server-only'

import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { platformAccount } from './platform-account'

export const requireSuperAdmin = cache(async () => {
  const supabase = await createClient()
  // Use the current Auth account so a role or status change takes effect immediately.
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect('/login')
  const account = platformAccount(user)
  if (account.role !== 'super_admin' || account.status !== 'active') {
    redirect('/login?message=' + encodeURIComponent('Hanya Super Admin aktif yang dapat mengelola platform.'))
  }
  return { user, account }
})
