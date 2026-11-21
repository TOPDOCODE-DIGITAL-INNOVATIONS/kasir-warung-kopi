import 'server-only'

import {
  XenditApiError,
  createXenditSubscriptionSession,
  deactivateXenditRecurringPlan,
  ensureXenditCustomer,
  getXenditPlanCycles,
  getXenditRecurringPlan,
  type XenditSessionDetail,
} from '@/lib/xendit/client'
import { createAdminClient } from '@/utils/supabase/admin'
import type { BillingEnvironment } from '@/app/platform/subscriptions/types'

/**
 * Alur checkout & rekonsiliasi Xendit yang dipakai Super Admin (/platform) dan Owner
 * (/dashboard/billing). Izin dicek ulang di database: actor harus Super Admin aktif
 * atau Owner itu sendiri (billing.can_manage_billing).
 */

const PRODUCTION_SITE_URL = 'https://kasir-warung-kopi.vercel.app'

export type CheckoutResult = { success: boolean; status: string; message: string; checkoutUrl?: string }

type BeginCheckout = {
  status: string
  reference_id: string
  created_at: string
  amount: number
  plan_name: string
  interval_months: number
  owner_email: string
  owner_name: string
  xendit_customer_id: string | null
}

export function billingSiteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, '')
  return configured?.startsWith('https://') ? configured : PRODUCTION_SITE_URL
}

function db() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Secret key server belum dikonfigurasi.')
  return createAdminClient()
}

function errorMessage(err: unknown, fallback: string) {
  return err instanceof Error && err.message ? err.message : fallback
}

export async function createCheckout(
  actorId: string, ownerId: string, environment: BillingEnvironment, planCode: 'monthly' | 'yearly',
  messages: Record<string, string>,
): Promise<CheckoutResult> {
  const client = db()
  const { data, error } = await client.rpc('platform_begin_checkout', {
    p_actor: actorId,
    p_owner: ownerId,
    p_environment: environment,
    p_plan_code: planCode,
    p_reference_id: `sub-${environment}-${ownerId.slice(0, 8)}-${Date.now()}`,
  })
  if (error || !data) return { success: false, status: 'error', message: 'Checkout belum berhasil disiapkan. Silakan coba kembali.' }
  const begin = data as BeginCheckout
  if (begin.status !== 'created' && begin.status !== 'resume') {
    return { success: false, status: begin.status, message: messages[begin.status] ?? 'Checkout belum berhasil disiapkan.' }
  }

  try {
    const customerId = await ensureXenditCustomer({
      environment,
      ownerId,
      email: begin.owner_email,
      name: begin.owner_name,
      existingCustomerId: begin.xendit_customer_id,
    })
    if (!begin.xendit_customer_id) {
      await client.rpc('platform_save_xendit_customer', {
        p_actor: actorId, p_owner: ownerId, p_environment: environment, p_customer_id: customerId,
      })
    }

    // Idempotency key = reference_id, sehingga aman dicoba ulang setelah timeout.
    const returnUrl = `${billingSiteUrl()}/billing/thanks`
    const session = await createXenditSubscriptionSession({
      environment,
      referenceId: begin.reference_id,
      customerId,
      amount: Number(begin.amount),
      intervalMonths: Number(begin.interval_months),
      planName: begin.plan_name,
      ownerName: begin.owner_name,
      ownerEmail: begin.owner_email,
      successReturnUrl: returnUrl,
      cancelReturnUrl: `${returnUrl}?status=cancelled`,
      checkoutCreatedAt: new Date(begin.created_at),
    })

    const { data: attached, error: attachError } = await client.rpc('platform_attach_checkout_session', {
      p_actor: actorId,
      p_environment: environment,
      p_reference_id: begin.reference_id,
      p_xendit_session_id: session.sessionId,
      p_xendit_plan_id: session.recurringPlanId,
      p_checkout_url: session.checkoutUrl,
      p_expires_at: session.expiresAt,
    })
    if (attachError || attached !== 'open') {
      console.error(`[xendit-checkout] ref=${begin.reference_id} session=${session.sessionId} gagal disimpan: ${attachError?.message ?? attached}`)
      return {
        success: false,
        status: 'attach_failed',
        message: `Sesi Xendit ${session.sessionId} sudah dibuat tetapi gagal disimpan. Ulangi untuk melanjutkan referensi yang sama.`,
      }
    }

    return {
      success: true,
      status: 'open',
      message: `Checkout ${begin.plan_name} berhasil dibuat di Xendit (${environment === 'test' ? 'Test Mode' : 'Live'}).`,
      checkoutUrl: session.checkoutUrl,
    }
  } catch (err) {
    if (err instanceof XenditApiError && err.status >= 400 && err.status < 500) {
      // Xendit menolak: sesi pasti tidak dibuat, percobaan ditutup.
      await client.rpc('platform_fail_checkout', {
        p_actor: actorId, p_environment: environment, p_reference_id: begin.reference_id, p_status: 'failed',
      })
      return { success: false, status: 'rejected', message: `Xendit menolak checkout: ${err.message}` }
    }
    // Timeout / 5xx: sesi mungkin sudah dibuat. Biarkan 'creating' agar percobaan berikutnya
    // memakai idempotency key yang sama.
    return {
      success: false,
      status: 'retry',
      message: `${errorMessage(err, 'Xendit belum merespons.')} Ulangi untuk melanjutkan referensi ${begin.reference_id} tanpa membuat tagihan ganda.`,
    }
  }
}

export async function reconcileXendit(
  actorId: string, ownerId: string, environment: BillingEnvironment,
  session: XenditSessionDetail | null, planId: string | null,
) {
  const [plan, cycles] = planId
    ? await Promise.all([getXenditRecurringPlan(environment, planId), getXenditPlanCycles(environment, planId)])
    : [null, []]

  const { data, error } = await db().rpc('platform_reconcile_xendit', {
    p_actor: actorId,
    p_owner: ownerId,
    p_environment: environment,
    p_session: session,
    p_plan: plan,
    p_cycles: cycles,
  })
  if (error) throw new Error('Status Xendit gagal disimpan ke database.')
  const status = (data as { status?: string } | null)?.status
  if (status !== 'ok') throw new Error(status === 'owner_mismatch' ? 'Data Xendit tidak cocok dengan Owner ini.' : 'Status Xendit gagal diterapkan.')
  return { planStatus: plan?.status ?? null, cycles }
}

export async function stopRenewal(actorId: string, ownerId: string, environment: BillingEnvironment, planId: string) {
  await deactivateXenditRecurringPlan(environment, planId)
  return reconcileXendit(actorId, ownerId, environment, null, planId)
}
