import 'server-only'

import { requireSuperAdmin } from '@/lib/platform-auth'
import { platformBillingEnvironment } from '@/lib/platform-billing/config'
import { billingUnavailableMessage, platformBillingDb } from '@/lib/platform-billing/db'
import { billingFilters, type BillingFilter, type BillingOverview, type BillingOwnerDetail } from './types'

const PAGE_SIZE = 25

export async function getBillingOverview(params: { q?: unknown; status?: unknown; page?: unknown }) {
  const { user } = await requireSuperAdmin()
  const environment = platformBillingEnvironment()
  const search = typeof params.q === 'string' ? params.q.trim().slice(0, 120) : ''
  const status = typeof params.status === 'string' && Object.hasOwn(billingFilters, params.status)
    ? params.status as BillingFilter : ''
  const requestedPage = typeof params.page === 'string' ? Number(params.page) : 1
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 && (requestedPage - 1) * PAGE_SIZE <= 2_147_483_647
    ? requestedPage : 1

  const { data, error } = await platformBillingDb().rpc('platform_billing_overview', {
    p_actor: user.id, p_environment: environment, p_search: search, p_filter: status || null,
    p_offset: (page - 1) * PAGE_SIZE, p_limit: PAGE_SIZE + 1,
  })
  if (error || !data) throw new Error(billingUnavailableMessage)
  const overview: BillingOverview = data
  if (typeof overview.summary?.free_branch !== 'number') throw new Error(billingUnavailableMessage)
  return {
    ...overview,
    owners: overview.owners.slice(0, PAGE_SIZE),
    hasNext: overview.owners.length > PAGE_SIZE,
    environment, search, status, page,
  }
}

export async function getBillingOwnerDetail(id: string) {
  const { user } = await requireSuperAdmin()
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) return null

  const { data, error } = await platformBillingDb().rpc('platform_billing_owner_detail', {
    p_actor: user.id, p_environment: platformBillingEnvironment(), p_owner: id,
  })
  const detail: BillingOwnerDetail | null = data
  if (error || (detail && typeof detail.owner.branch_count !== 'number')) throw new Error(billingUnavailableMessage)
  return detail
}
