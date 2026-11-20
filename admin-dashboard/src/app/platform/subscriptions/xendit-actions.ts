'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { requireSuperAdmin } from '@/lib/platform-auth'
import {
  XenditApiError,
  cancelXenditSession,
  createXenditPaymentSession,
  ensureXenditCustomer,
  getXenditSession,
  type XenditSessionDetail,
} from '@/lib/xendit/client'
import { platformDb } from '../db'
import type { BillingEnvironment } from './types'

const route = '/platform/subscriptions'
const uuidPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
const PRODUCTION_SITE_URL = 'https://kasir-warung-kopi.vercel.app'

type ActionResult = { success: boolean; message: string; checkoutUrl?: string }

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
  forbidden: 'Hanya Super Admin aktif yang dapat membuat checkout.',
  invalid_request: 'Data checkout tidak valid.',
  owner_not_found: 'Data Owner tidak ditemukan.',
  email_missing: 'Owner belum memiliki email. Lengkapi email Owner sebelum membuat checkout.',
  checkout_open: 'Masih ada checkout aktif untuk Owner ini. Salin tautan yang ada atau batalkan terlebih dahulu.',
  plan_unavailable: 'Paket langganan belum aktif.',
}

function readForm(formData: FormData) {
  const ownerId = String(formData.get('owner_id') ?? '')
  const environment: BillingEnvironment = formData.get('environment') === 'test' ? 'test' : 'live'
  return { ownerId, environment, valid: uuidPattern.test(ownerId) }
}

function errorMessage(err: unknown, fallback: string) {
  return err instanceof Error && err.message ? err.message : fallback
}

function refresh(ownerId: string) {
  revalidatePath(route)
  revalidatePath(`${route}/${ownerId}`)
}

function siteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, '')
  return configured?.startsWith('https://') ? configured : PRODUCTION_SITE_URL
}

export async function getCheckoutContext(
  ownerId: string,
  environment: BillingEnvironment
): Promise<CheckoutContext | null> {
  const { user } = await requireSuperAdmin()
  if (!uuidPattern.test(ownerId)) return null

  const { data, error } = await platformDb().rpc('platform_get_checkout_context', {
    p_actor: user.id,
    p_environment: environment,
    p_owner: ownerId,
  })
  if (error || !data) return null
  return data as CheckoutContext
}

export async function createXenditCheckout(formData: FormData): Promise<ActionResult> {
  const { user } = await requireSuperAdmin()
  const { ownerId, environment, valid } = readForm(formData)
  const planCode = formData.get('plan_code') === 'yearly' ? 'yearly' : 'monthly'
  if (!valid) return { success: false, message: 'ID Owner tidak valid.' }

  // 1. Catat percobaan checkout di DB lebih dulu (kunci satu checkout per Owner).
  const db = platformDb()
  const { data, error } = await db.rpc('platform_begin_payment_checkout', {
    p_actor: user.id,
    p_owner: ownerId,
    p_environment: environment,
    p_plan_code: planCode,
    p_reference_id: `pay-${environment}-${randomUUID()}`,
  })
  if (error || !data) return { success: false, message: 'Checkout belum berhasil disiapkan. Silakan coba kembali.' }
  const begin = data as BeginCheckout
  if (begin.status !== 'created' && begin.status !== 'resume') {
    return { success: false, message: beginMessages[begin.status] ?? 'Checkout belum berhasil disiapkan.' }
  }

  try {
    // 2. Customer Xendit (dicari ulang dengan referensi tetap, disimpan segera).
    const customerId = await ensureXenditCustomer({
      environment,
      ownerId,
      email: begin.owner_email,
      name: begin.owner_name,
      existingCustomerId: begin.xendit_customer_id,
    })
    if (!begin.xendit_customer_id) {
      await db.rpc('platform_save_xendit_customer', {
        p_actor: user.id, p_owner: ownerId, p_environment: environment, p_customer_id: customerId,
      })
    }

    // 3. Sesi Xendit dengan idempotency key = reference_id (aman dicoba ulang).
    const returnUrl = `${siteUrl()}/billing/thanks`
    const session = await createXenditPaymentSession({
      environment,
      referenceId: begin.reference_id,
      customerId,
      amount: Number(begin.amount),
      planName: begin.plan_name,
      successReturnUrl: returnUrl,
      cancelReturnUrl: `${returnUrl}?status=cancelled`,
    })

    // 4. Simpan tautan.
    const { data: attached, error: attachError } = await db.rpc('platform_attach_checkout_session', {
      p_actor: user.id,
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
        p_actor: user.id, p_environment: environment, p_reference_id: begin.reference_id, p_status: 'failed',
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
  const { data, error } = await platformDb().rpc('platform_reconcile_payment_checkout', {
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

export async function syncXenditStatus(formData: FormData): Promise<ActionResult> {
  try {
    const { user } = await requireSuperAdmin()
    const { ownerId, environment, valid } = readForm(formData)
    if (!valid) return { success: false, message: 'ID Owner tidak valid.' }

    const ctx = await getCheckoutContext(ownerId, environment)
    if (!ctx) return { success: false, message: 'Data billing Owner tidak ditemukan.' }

    const sessionId = ctx.open_checkout?.xendit_session_id
    if (!sessionId) return { success: false, message: 'Belum ada sesi Xendit yang bisa dicek.' }

    const session = await getXenditSession(environment, sessionId)
    await reconcilePayment(user.id, ownerId, environment, session)
    refresh(ownerId)
    return { success: true, message: `Status sesi Xendit diperbarui (${session.status ?? '—'}).` }
  } catch (err) {
    return { success: false, message: errorMessage(err, 'Gagal memeriksa status ke Xendit.') }
  }
}

export async function cancelOpenXenditCheckout(formData: FormData): Promise<ActionResult> {
  try {
    const { user } = await requireSuperAdmin()
    const { ownerId, environment, valid } = readForm(formData)
    if (!valid) return { success: false, message: 'ID Owner tidak valid.' }

    const ctx = await getCheckoutContext(ownerId, environment)
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
    try {
      await cancelXenditSession(environment, checkout.xendit_session_id)
    } catch (error) {
      cancellationError = error
    }
    const session = await getXenditSession(environment, checkout.xendit_session_id)
    await reconcilePayment(user.id, ownerId, environment, session)
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

export async function updatePlanPrice(formData: FormData): Promise<ActionResult> {
  const { user } = await requireSuperAdmin()
  const code = formData.get('plan_code')
  const amount = Number(String(formData.get('amount') ?? '').replace(/[^\d]/g, ''))
  if ((code !== 'monthly' && code !== 'yearly') || !Number.isSafeInteger(amount) || amount < 1000 || amount > 100_000_000) {
    return { success: false, message: 'Harga harus antara Rp1.000 dan Rp100.000.000.' }
  }

  const { data, error } = await platformDb().rpc('platform_set_plan_price', {
    p_actor: user.id, p_code: code, p_amount: amount,
  })
  if (error || data !== 'updated') {
    return { success: false, message: data === 'forbidden' ? 'Hanya Super Admin aktif yang dapat mengubah harga.' : 'Harga belum berhasil disimpan.' }
  }
  revalidatePath(route, 'layout')
  return { success: true, message: 'Harga paket diperbarui untuk checkout baru. Nominal checkout yang sudah dibuat tetap berlaku.' }
}
