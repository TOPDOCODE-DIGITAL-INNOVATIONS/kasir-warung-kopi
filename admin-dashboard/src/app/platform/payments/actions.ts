'use server'

import { revalidatePath } from 'next/cache'
import { requireSuperAdmin } from '@/lib/platform-auth'
import { reconcilePaymentQueue, successfulReconciliation } from '@/lib/platform-billing/reconcile'
import { platformBillingEnvironment } from '@/lib/platform-billing/config'
import { billingUnavailableMessage, platformBillingDb } from '@/lib/platform-billing/db'

const pageSize = 25

type MonitoringRow = {
  id: string
  checkout_id: string | null
  owner_id: string | null
  owner_email: string | null
  reference_id: string | null
  xendit_session_id: string | null
  plan_name: string | null
  amount: number | null
  status: string
  occurred_at: string
  expires_at: string | null
  last_reconcile_at: string | null
  last_reconcile_result: string | null
  event_type: string | null
  error_code: string | null
}

export async function getPaymentMonitoring(params: { view?: string; page?: string }) {
  const { user } = await requireSuperAdmin()
  const environment = platformBillingEnvironment()
  const view = params.view === 'review' ? 'review' : 'pending'
  const requested = Number(params.page)
  const page = Number.isSafeInteger(requested) && requested >= 1 && (requested - 1) * pageSize <= 2_147_483_647 ? requested : 1
  const { data, error } = await platformBillingDb().rpc('platform_get_payment_monitoring', {
    p_actor: user.id, p_environment: environment, p_view: view,
    p_offset: (page - 1) * pageSize, p_limit: pageSize + 1,
  })
  if (error || !data) throw new Error(billingUnavailableMessage)
  const rows: MonitoringRow[] = data.rows
  return { rows: rows.slice(0, pageSize), environment, view, page, hasNext: rows.length > pageSize }
}

export async function recheckPayment(_previous: { success: boolean; message: string }, form: FormData) {
  const { user } = await requireSuperAdmin()
  const environment = form.get('environment')
  const checkout = form.get('checkout_id')
  if (environment !== platformBillingEnvironment() || typeof checkout !== 'string'
    || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(checkout)) {
    return { success: false, message: 'Data checkout tidak valid.' }
  }

  try {
    const outcomes = await reconcilePaymentQueue({ checkout, actor: user.id })
    const result = outcomes[0]
    if (!result) return { success: false, message: 'Checkout tidak tersedia atau sedang diperiksa.' }

    revalidatePath('/platform/payments')
    revalidatePath('/platform/subscriptions')
    revalidatePath('/platform/subscriptions/[id]', 'page')
    revalidatePath('/platform/owners/[id]', 'page')
    return successfulReconciliation.has(result)
      ? { success: true, message: result === 'active' ? 'Xendit masih menunggu pembayaran.' : 'Status Xendit sudah diperiksa.' }
      : { success: false, message: `Status checkout perlu ditinjau (${result}).` }
  } catch {
    return { success: false, message: 'Pemeriksaan Xendit belum berhasil. Coba lagi.' }
  }
}
