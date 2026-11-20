import 'server-only'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { XenditApiError } from '@/lib/xendit/client'
import {
  cancelXenditSession,
  createXenditPaymentSession,
  ensureXenditCustomer,
  getXenditSession,
  type XenditSessionDetail,
} from '@/lib/platform-billing/checkout'
import { platformBillingEnvironment, platformBillingPublicOrigin, platformXenditAccount } from '@/lib/platform-billing/config'
import { billingUnavailableMessage, platformBillingDb, requirePlatformBillingSchema } from '@/lib/platform-billing/db'
import type { BillingEnvironment } from '@/lib/platform-billing/config'

const route = '/platform/subscriptions'

export type CheckoutActionResult = { success: boolean; message: string; checkoutUrl?: string }

export type CheckoutContext = {
  plans: { code: 'monthly' | 'yearly'; name: string; amount: number }[]
  open_checkout: {
    reference_id: string
    xendit_session_id: string | null
    checkout_url: string | null
    amount: number
    plan_name: string
    plan_code: 'monthly' | 'yearly'
  } | null
}

type BeginCheckout = {
  status: string
  reference_id: string
  amount: number
  plan_name: string
  owner_email: string
  owner_name: string
  xendit_customer_id: string | null
}

const beginMessages: Record<string, string> = {
  forbidden: 'Akun ini tidak dapat membuat checkout.',
  invalid_request: 'Data checkout tidak valid.',
  owner_not_found: 'Data Owner tidak ditemukan.',
  email_missing: 'Owner belum memiliki email. Lengkapi email Owner sebelum membuat checkout.',
  checkout_open: 'Masih ada checkout aktif untuk Owner ini. Salin tautan yang ada atau batalkan terlebih dahulu.',
  plan_unavailable: 'Paket langganan belum aktif.',
}

function errorMessage(err: unknown, fallback: string) {
  return err instanceof Error && err.message ? err.message : fallback
}

function refresh(ownerId: string) {
  revalidatePath(route)
  revalidatePath(`${route}/${ownerId}`)
  revalidatePath(`/platform/owners/${ownerId}`)
  revalidatePath('/platform/payments')
  revalidatePath('/dashboard/subscription')
  revalidatePath('/dashboard/subscription/history')
}

export async function getBillingCheckout(actorId: string, ownerId: string): Promise<CheckoutContext | null> {
  const db = platformBillingDb()
  await requirePlatformBillingSchema(db)
  const { data, error } = await db.rpc('platform_get_checkout_context', {
    p_actor: actorId,
    p_environment: platformBillingEnvironment(),
    p_owner: ownerId,
  })
  if (error) throw new Error(billingUnavailableMessage)
  if (!data) return null
  return data as CheckoutContext
}

export async function createBillingCheckout(actorId: string, ownerId: string, planCode: FormDataEntryValue | null): Promise<CheckoutActionResult> {
  const environment = platformBillingEnvironment()
  if (planCode !== 'monthly' && planCode !== 'yearly') return { success: false, message: 'Pilih paket bulanan atau tahunan.' }

  let db
  let xenditAccount
  let returnUrl
  try {
    db = platformBillingDb()
    await requirePlatformBillingSchema(db)
    xenditAccount = platformXenditAccount()
    returnUrl = `${platformBillingPublicOrigin()}/billing/thanks`
  } catch (error) {
    return { success: false, message: errorMessage(error, billingUnavailableMessage) }
  }

  // Reserve one checkout per Owner before contacting Xendit.
  const { data, error } = await db.rpc('platform_begin_payment_checkout', {
    p_actor: actorId,
    p_owner: ownerId,
    p_environment: environment,
    p_plan_code: planCode,
    p_reference_id: `pay-${environment}-branch-${randomUUID()}`,
  })
  if (error || !data) return { success: false, message: 'Checkout belum berhasil disiapkan. Silakan coba kembali.' }
  const begin = data as BeginCheckout
  if (begin.status !== 'created' && begin.status !== 'resume') {
    return { success: false, message: beginMessages[begin.status] ?? 'Checkout belum berhasil disiapkan.' }
  }

  try {
    // 2. Customer Xendit (dicari ulang dengan referensi tetap, disimpan segera).
    const customerId = await ensureXenditCustomer(xenditAccount.secretKey, {
      ownerId,
      email: begin.owner_email,
      name: begin.owner_name,
      existingCustomerId: begin.xendit_customer_id,
    })
    if (!begin.xendit_customer_id) {
      const { data: saved, error: customerError } = await db.rpc('platform_save_xendit_customer', {
        p_actor: actorId, p_owner: ownerId, p_environment: environment, p_customer_id: customerId,
      })
      if (customerError || saved !== 'saved') throw new Error('Customer Xendit belum berhasil disimpan.')
    }

    // 3. Sesi Xendit dengan idempotency key = reference_id (aman dicoba ulang).
    const session = await createXenditPaymentSession(xenditAccount, {
      referenceId: begin.reference_id,
      customerId,
      amount: Number(begin.amount),
      planName: begin.plan_name,
      successReturnUrl: returnUrl,
      cancelReturnUrl: `${returnUrl}?status=cancelled`,
    })

    // 4. Simpan tautan.
    const { data: attached, error: attachError } = await db.rpc('platform_attach_checkout_session', {
      p_actor: actorId,
      p_environment: environment,
      p_reference_id: begin.reference_id,
      p_xendit_session_id: session.sessionId,
      p_checkout_url: session.checkoutUrl,
      p_expires_at: session.expiresAt,
    })
    if (attached === 'completed' && !attachError) {
      refresh(ownerId)
      return { success: true, message: 'Pembayaran checkout sudah tercatat.' }
    }
    if (attachError || attached !== 'open') {
      console.error(`[xendit-checkout] ref=${begin.reference_id} session=${session.sessionId} gagal disimpan: ${attachError?.message ?? attached}`)
      return {
        success: false,
        message: `Sesi Xendit ${session.sessionId} sudah dibuat tetapi gagal disimpan. Klik "Buat Checkout" lagi untuk melanjutkan referensi yang sama.`,
      }
    }

    refresh(ownerId)
    return {
      success: true,
      message: `Checkout ${begin.plan_name} berhasil dibuat di Xendit (${environment === 'test' ? 'Test Mode' : 'Live'}).`,
      checkoutUrl: session.checkoutUrl,
    }
  } catch (err) {
    if (err instanceof XenditApiError && err.status >= 400 && err.status < 500
      && ![408, 409, 429].includes(err.status) && !/duplicate|idempotenc/i.test(err.errorCode ?? '')) {
      // Xendit menolak permintaan: sesi pasti tidak dibuat, percobaan ini ditutup.
      await db.rpc('platform_fail_checkout', {
        p_actor: actorId, p_environment: environment, p_reference_id: begin.reference_id, p_status: 'failed',
      })
      refresh(ownerId)
      return { success: false, message: `Xendit menolak checkout: ${err.message}` }
    }
    // Timeout / gangguan jaringan / 5xx: sesi mungkin sudah dibuat. Biarkan 'creating'
    // agar percobaan berikutnya memakai idempotency key yang sama.
    refresh(ownerId)
    return {
      success: false,
      message: `${errorMessage(err, 'Xendit belum merespons.')} Klik "Buat Checkout" lagi untuk melanjutkan referensi ${begin.reference_id} tanpa membuat tagihan ganda.`,
    }
  }
}

async function reconcilePayment(
  actor: string,
  ownerId: string,
  environment: BillingEnvironment,
  session: XenditSessionDetail,
) {
  const { data, error } = await platformBillingDb().rpc('platform_reconcile_payment_checkout', {
    p_actor: actor,
    p_owner: ownerId,
    p_environment: environment,
    p_session: session,
  })
  if (error || !data) throw new Error('Status pembayaran Xendit gagal disimpan.')
  if (!['applied', 'already_applied', 'recorded'].includes(data)) {
    throw new Error(`Status pembayaran Xendit perlu ditinjau (${data}).`)
  }
}

export async function syncBillingCheckout(actorId: string, ownerId: string): Promise<CheckoutActionResult> {
  try {
    const environment = platformBillingEnvironment()
    const ctx = await getBillingCheckout(actorId, ownerId)
    if (!ctx) return { success: false, message: 'Data billing Owner tidak ditemukan.' }

    const sessionId = ctx.open_checkout?.xendit_session_id
    if (!sessionId) return { success: false, message: 'Belum ada sesi Xendit yang bisa dicek.' }

    const session = await getXenditSession(platformXenditAccount(), sessionId)
    await reconcilePayment(actorId, ownerId, environment, session)
    refresh(ownerId)
    return { success: true, message: `Status sesi Xendit diperbarui (${session.status ?? '—'}).` }
  } catch (err) {
    return { success: false, message: errorMessage(err, 'Gagal memeriksa status ke Xendit.') }
  }
}

export async function cancelBillingCheckout(actorId: string, ownerId: string): Promise<CheckoutActionResult> {
  try {
    const environment = platformBillingEnvironment()
    const ctx = await getBillingCheckout(actorId, ownerId)
    const checkout = ctx?.open_checkout
    if (!checkout) return { success: false, message: 'Tidak ada checkout terbuka untuk dibatalkan.' }

    if (!checkout.xendit_session_id) {
      // Percobaan yang belum terkonfirmasi: pastikan tidak ada sesi Xendit yang bisa dibayar.
      return {
        success: false,
        message: 'Checkout ini belum terkonfirmasi dari Xendit. Klik "Buat Checkout" untuk melanjutkannya, lalu batalkan bila perlu.',
      }
    }

    let cancellationError: unknown
    const account = platformXenditAccount()
    try {
      await cancelXenditSession(account, checkout.xendit_session_id)
    } catch (error) {
      cancellationError = error
    }
    const session = await getXenditSession(account, checkout.xendit_session_id)
    await reconcilePayment(actorId, ownerId, environment, session)
    refresh(ownerId)
    if (!['CANCELED', 'CANCELLED'].includes(session.status ?? '')) {
      const message = errorMessage(cancellationError, 'Sesi belum dibatalkan.')
      return { success: false, message: `${message} Status sesi ${session.status ?? '—'}.` }
    }
    return { success: true, message: 'Sesi checkout Xendit berhasil dibatalkan.' }
  } catch (err) {
    return { success: false, message: errorMessage(err, 'Gagal membatalkan sesi checkout.') }
  }
}
