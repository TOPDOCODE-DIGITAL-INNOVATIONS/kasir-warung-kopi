'use server'

import { requireSuperAdmin } from '@/lib/platform-auth'
import { platformDb } from './db'

type PlatformOverview = {
  owner_count: number
  branch_count: number
  active_owner_count: number
  inactive_owner_count: number
}

export async function getPlatformOverview() {
  const { user } = await requireSuperAdmin()
  const { data, error } = await platformDb().rpc('platform_owner_overview', { p_actor: user.id }).single<PlatformOverview>()
  if (error) throw new Error('Ringkasan platform belum berhasil dimuat.')
  return data
}
