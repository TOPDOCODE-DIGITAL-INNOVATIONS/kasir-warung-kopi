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

export type InsightRange = '30d' | '90d' | '12m'

export type PlatformInsights = {
  range: InsightRange
  unit: 'day' | 'week' | 'month'
  series: { bucket: string; new_owners: number; new_branches: number; transactions: number; gmv: number; billing_revenue: number }[]
  kpis: {
    new_owners: number; transactions: number; gmv: number; billing_revenue: number
    active_branches_7d: number; active_owners_7d: number; transacting_owners: number
  }
  top_owners: { owner_id: string; name: string | null; email: string | null; transactions: number; gmv: number; branches: number }[]
  recent: { at: string; kind: string; owner_id: string; name: string | null; email: string | null }[]
}

export async function getPlatformInsights(range: InsightRange, environment: 'test' | 'live') {
  const { user } = await requireSuperAdmin()
  const { data, error } = await platformDb().rpc('platform_insights', { p_actor: user.id, p_environment: environment, p_range: range })
  if (error || !data) throw new Error('Insight platform belum berhasil dimuat.')
  return data as PlatformInsights
}
