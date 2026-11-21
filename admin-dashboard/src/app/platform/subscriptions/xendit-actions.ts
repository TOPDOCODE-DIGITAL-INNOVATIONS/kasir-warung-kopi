'use server'

import { revalidatePath } from 'next/cache'
import { requireSuperAdmin } from '@/lib/platform-auth'
import {
  cancelXenditSession,
  getXenditPlanCycles,
  getXenditSession,
  simulateXenditCyclePayment,
  type XenditSessionDetail,
} from '@/lib/xendit/client'
import { createCheckout, reconcileXendit, stopRenewal } from '@/lib/billing/checkout-core'
import { platformDb } from '../db'
import type { BillingEnvironment } from './types'

const route = '/platform/subscriptions'
const uuidPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i

type ActionResult = { success: boolean; message: string; checkoutUrl?: string }

export type CheckoutContext = {
  owner: {
    id: string
    email: string | null
    name: string | null
    xendit_customer_id: string | null
  } | null
  plans: {
    id: string
    code: 'monthly' | 'yearly'
    name: string
    version: number
    interval_months: number
    amount: number
    status: string
  }[]
  open_checkout: {
    id: string
    reference_id: string
    xendit_session_id: string | null
    checkout_url: string | null
    status: string
    amount: number
    expires_at: string | null
    plan_name: string
    plan_code: 'monthly' | 'yearly'
  } | null
  current_subscription: {
    id: string
    status: string
    xendit_plan_id: string | null
    renewal_enabled: boolean
    period_start: string | null
    period_end: string | null
    next_billing_at: string | null
    plan_code: 'monthly' | 'yearly'
    plan_name: string
    amount: number
  } | null
}


const beginMessages: Record<string, string> = {
  forbidden: 'Hanya Super Admin aktif yang dapat membuat checkout.',
  invalid_request: 'Data checkout tidak valid.',
  owner_not_found: 'Data Owner tidak ditemukan.',
  email_missing: 'Owner belum memiliki email. Lengkapi email Owner sebelum membuat checkout.',
  checkout_open: 'Masih ada checkout aktif untuk Owner ini. Salin tautan yang ada atau batalkan terlebih dahulu.',
  subscription_active: 'Owner masih memiliki langganan aktif. Hentikan perpanjangan dan tunggu periode berakhir sebelum membuat checkout baru.',
  payment_verifying: 'Pembayaran Owner sedang diverifikasi Xendit. Klik "Cek Status Xendit" sebelum membuat checkout baru.',
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
  const result = await createCheckout(user.id, ownerId, environment, planCode, beginMessages)
  refresh(ownerId)
  return { success: result.success, message: result.message, checkoutUrl: result.checkoutUrl }
}

function reconcile(
  actor: string,
  ownerId: string,
  environment: BillingEnvironment,
  session: XenditSessionDetail | null,
  planId: string | null
) {
  return reconcileXendit(actor, ownerId, environment, session, planId)
}

export async function syncXenditStatus(formData: FormData): Promise<ActionResult> {
  try {
    const { user } = await requireSuperAdmin()
    const { ownerId, environment, valid } = readForm(formData)
    if (!valid) return { success: false, message: 'ID Owner tidak valid.' }

    const ctx = await getCheckoutContext(ownerId, environment)
    if (!ctx) return { success: false, message: 'Data billing Owner tidak ditemukan.' }

    const sessionId = ctx.open_checkout?.xendit_session_id ?? null
    const session = sessionId ? await getXenditSession(environment, sessionId) : null
    const planId = ctx.current_subscription?.xendit_plan_id
      ?? session?.subscription?.recurring_plan_id ?? session?.recurring_plan_id ?? null

    if (!session && !planId) {
      return { success: false, message: 'Belum ada sesi atau plan Xendit untuk dicek.' }
    }

    const { planStatus } = await reconcile(user.id, ownerId, environment, session, planId)
    refresh(ownerId)
    return { success: true, message: `Status Xendit berhasil diperbarui${planStatus ? ` (Plan: ${planStatus})` : ''}.` }
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

    try {
      await cancelXenditSession(environment, checkout.xendit_session_id)
    } catch (err) {
      // Mungkin sudah dibayar / kedaluwarsa: ambil status sebenarnya, jangan tandai batal sembarangan.
      const session = await getXenditSession(environment, checkout.xendit_session_id)
      const planId = session.subscription?.recurring_plan_id ?? session.recurring_plan_id ?? null
      await reconcile(user.id, ownerId, environment, session, planId)
      refresh(ownerId)
      return {
        success: false,
        message: `Xendit tidak membatalkan sesi (${errorMessage(err, 'ditolak')}). Status terbaru: ${session.status ?? '-'}.`,
      }
    }

    const session = await getXenditSession(environment, checkout.xendit_session_id)
    await reconcile(user.id, ownerId, environment, session, null)
    refresh(ownerId)
    return { success: true, message: 'Sesi checkout Xendit berhasil dibatalkan.' }
  } catch (err) {
    return { success: false, message: errorMessage(err, 'Gagal membatalkan sesi checkout.') }
  }
}

export async function stopXenditAutoRenewal(formData: FormData): Promise<ActionResult> {
  try {
    const { user } = await requireSuperAdmin()
    const { ownerId, environment, valid } = readForm(formData)
    if (!valid) return { success: false, message: 'ID Owner tidak valid.' }

    const ctx = await getCheckoutContext(ownerId, environment)
    const planId = ctx?.current_subscription?.xendit_plan_id
    if (!planId) return { success: false, message: 'ID plan Xendit belum tersedia.' }

    const { planStatus } = await stopRenewal(user.id, ownerId, environment, planId)
    refresh(ownerId)
    if (planStatus?.toUpperCase() !== 'INACTIVE') {
      return { success: false, message: `Permintaan terkirim, tetapi Xendit masih melaporkan plan ${planStatus ?? '-'}. Cek ulang beberapa saat lagi.` }
    }
    return { success: true, message: 'Perpanjangan otomatis di Xendit telah dihentikan.' }
  } catch (err) {
    return { success: false, message: errorMessage(err, 'Gagal menghentikan perpanjangan di Xendit.') }
  }
}

export async function simulateXenditCycle(formData: FormData): Promise<ActionResult> {
  try {
    const { user } = await requireSuperAdmin()
    const { ownerId, environment, valid } = readForm(formData)
    if (!valid) return { success: false, message: 'ID Owner tidak valid.' }
    if (environment !== 'test') return { success: false, message: 'Simulasi hanya tersedia pada lingkungan Test.' }

    const ctx = await getCheckoutContext(ownerId, environment)
    const planId = ctx?.current_subscription?.xendit_plan_id
    if (!planId) return { success: false, message: 'ID plan Xendit belum tersedia untuk disimulasikan.' }

    const cycles = await getXenditPlanCycles(environment, planId)
    const target = cycles.find((c) => ['SCHEDULED', 'PENDING', 'RETRYING'].includes((c.status ?? '').toUpperCase()))
    if (!target) {
      return {
        success: false,
        message: 'Belum ada siklus yang bisa disimulasikan. Buka tautan checkout dan otorisasi metode bayar test terlebih dahulu.',
      }
    }

    await simulateXenditCyclePayment(environment, planId, target.id, Number(target.amount ?? ctx?.current_subscription?.amount))
    await reconcile(user.id, ownerId, environment, null, planId)
    refresh(ownerId)
    return {
      success: true,
      message: 'Simulasi pembayaran dikirim ke Xendit. Status lunas mengikuti siklus yang dilaporkan Xendit (webhook / Cek Status).',
    }
  } catch (err) {
    return { success: false, message: errorMessage(err, 'Gagal menjalankan simulasi pembayaran.') }
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
  return { success: true, message: 'Harga paket diperbarui. Berlaku untuk checkout baru; pelanggan lama tetap di harga lama.' }
}
