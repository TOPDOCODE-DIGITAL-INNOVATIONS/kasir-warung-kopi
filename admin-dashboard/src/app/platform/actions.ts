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

export type SyncIncident = {
  businessId: string
  name: string
  failed: number
  lastFailureAt: string
  lastError: string | null
  lastSyncedAt: string | null
  /** Ada push berhasil setelah kegagalan terakhir. */
  recovered: boolean
}

export type SyncIncidents = {
  total: number
  failed: number
  invalidToken: number
  incidents: SyncIncident[]
}

/** Kegagalan sync 24 jam terakhir di seluruh cabang, dikelompokkan per cabang. */
export async function getSyncIncidents(): Promise<SyncIncidents> {
  await requireSuperAdmin()
  const db = platformDb()
  const since = new Date(Date.now() - 86400000).toISOString()
  const [totalRes, failedRes] = await Promise.all([
    db.from('sync_events').select('id', { count: 'exact', head: true }).gte('created_at', since),
    db.from('sync_events').select('business_id, created_at, error, http_status')
      .gte('created_at', since).gte('http_status', 400).order('created_at', { ascending: false }).limit(2000),
  ])
  if (totalRes.error || failedRes.error) throw new Error('Monitoring sync belum berhasil dimuat.')

  const byBusiness = new Map<string, { failed: number; lastFailureAt: string; lastError: string | null }>()
  let invalidToken = 0
  for (const e of failedRes.data ?? []) {
    if (!e.business_id) { invalidToken++; continue }
    const cur = byBusiness.get(e.business_id)
    if (cur) cur.failed++
    else byBusiness.set(e.business_id, { failed: 1, lastFailureAt: e.created_at, lastError: e.error })
  }

  const ids = [...byBusiness.keys()]
  const { data: businesses, error } = ids.length
    ? await db.from('businesses').select('id, name, last_synced_at').in('id', ids)
    : { data: [], error: null }
  if (error) throw new Error('Monitoring sync belum berhasil dimuat.')
  const info = new Map((businesses ?? []).map((b) => [b.id as string, b]))

  const incidents = ids.map((id) => {
    const f = byBusiness.get(id)!
    const b = info.get(id)
    const lastSyncedAt = (b?.last_synced_at as string | null) ?? null
    return {
      businessId: id,
      name: (b?.name as string | null) ?? 'Cabang dihapus',
      ...f,
      lastSyncedAt,
      recovered: !!lastSyncedAt && new Date(lastSyncedAt) > new Date(f.lastFailureAt),
    }
  }).sort((a, b) => Number(a.recovered) - Number(b.recovered) || b.failed - a.failed)

  return { total: totalRes.count ?? 0, failed: (failedRes.data ?? []).length, invalidToken, incidents }
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
