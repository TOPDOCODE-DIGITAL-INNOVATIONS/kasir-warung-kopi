import 'server-only'

import { platformDb } from '@/app/platform/db'
import type { BillingEnvironment } from '@/app/platform/subscriptions/types'
import { getXenditSession, hasXenditKey, XenditApiError, type XenditSessionDetail } from './client'

type Claim = { checkout_id: string; session_id: string; claimed_at: string }

export const successfulReconciliation = new Set([
  'applied', 'already_applied', 'recorded', 'active', 'expired', 'canceled', 'cancelled',
])

export async function reconcilePaymentQueue(environment: BillingEnvironment, manual?: { checkout: string; actor: string }) {
  if (!hasXenditKey(environment)) return null

  const db = platformDb()
  const { data, error } = await db.rpc('platform_claim_payment_reconciliation', {
    p_environment: environment,
    p_limit: manual ? 1 : 10,
    p_checkout: manual?.checkout ?? null,
    p_actor: manual?.actor ?? null,
  })
  if (error) throw new Error('Antrian pembayaran gagal dibaca.')
  const claims: Claim[] = data ?? []

  return Promise.all(claims.map(async claim => {
    let session: XenditSessionDetail | null = null
    let providerError: string | null = null
    try {
      session = await getXenditSession(environment, claim.session_id)
    } catch (error) {
      providerError = error instanceof XenditApiError && error.status === 404 ? 'provider_not_found' : 'provider_unavailable'
    }

    const { data: result, error: finishError } = await db.rpc('platform_finish_payment_reconciliation', {
      p_environment: environment,
      p_checkout: claim.checkout_id,
      p_claimed_at: claim.claimed_at,
      p_actor: manual?.actor ?? null,
      p_session: session,
      p_error: providerError,
    })
    if (finishError || typeof result !== 'string') {
      console.error('[billing-reconcile] Gagal menyimpan hasil pemeriksaan', environment, claim.checkout_id, finishError?.code)
      return 'storage_error'
    }
    return result
  }))
}
