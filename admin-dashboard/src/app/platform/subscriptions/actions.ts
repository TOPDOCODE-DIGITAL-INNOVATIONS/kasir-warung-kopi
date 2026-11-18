import 'server-only'

import { requireSuperAdmin } from '@/lib/platform-auth'
import { platformDb } from '../db'
import { billingFilters, type BillingEnvironment, type BillingFilter, type BillingOverview, type BillingOwnerDetail } from './types'

const PAGE_SIZE = 25

export function billingEnvironment(value: unknown): BillingEnvironment {
  return value === 'test' ? 'test' : 'live'
}

export async function getBillingOverview(params: { environment?: unknown; q?: unknown; status?: unknown; page?: unknown }) {
  const { user } = await requireSuperAdmin()
  const environment = billingEnvironment(params.environment)
  const search = typeof params.q === 'string' ? params.q.trim().slice(0, 120) : ''
  const status = typeof params.status === 'string' && Object.hasOwn(billingFilters, params.status)
    ? params.status as BillingFilter : ''
  const requestedPage = typeof params.page === 'string' ? Number(params.page) : 1
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 && (requestedPage - 1) * PAGE_SIZE <= 2_147_483_647
    ? requestedPage : 1

  const { data, error } = await platformDb().rpc('platform_billing_overview', {
    p_actor: user.id, p_environment: environment, p_search: search, p_filter: status || null,
    p_offset: (page - 1) * PAGE_SIZE, p_limit: PAGE_SIZE + 1,
  })
  if (error || !data) throw new Error('Data subscription dan trial belum berhasil dimuat.')
  const overview: BillingOverview = data
  return {
    ...overview,
    owners: overview.owners.slice(0, PAGE_SIZE),
    hasNext: overview.owners.length > PAGE_SIZE,
    environment, search, status, page,
  }
}

export async function getBillingOwnerDetail(id: string, environment: BillingEnvironment) {
  const { user } = await requireSuperAdmin()
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) return null

  const { data, error } = await platformDb().rpc('platform_billing_owner_detail', {
    p_actor: user.id, p_environment: environment, p_owner: id,
  })
  if (error) throw new Error('Detail billing Owner belum berhasil dimuat.')
  return data as BillingOwnerDetail | null
}
