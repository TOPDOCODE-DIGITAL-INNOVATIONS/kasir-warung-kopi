'use server'

import { revalidatePath } from 'next/cache'
import { requireSuperAdmin } from '@/lib/platform-auth'
import { platformBillingEnvironment } from '@/lib/platform-billing/config'
import { billingUnavailableMessage, platformBillingDb } from '@/lib/platform-billing/db'
import { cancelBillingCheckout, createBillingCheckout, getBillingCheckout, syncBillingCheckout,
  type CheckoutActionResult, type CheckoutContext } from '@/lib/platform-billing/session-service'

const route = '/platform/subscriptions'
const uuidPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i

function readForm(formData: FormData) {
  const ownerId = String(formData.get('owner_id') ?? '')
  const environment = platformBillingEnvironment()
  return { ownerId, environment, valid: uuidPattern.test(ownerId) && formData.get('environment') === environment }
}

export async function getCheckoutContext(ownerId: string): Promise<CheckoutContext | null> {
  const { user } = await requireSuperAdmin()
  return uuidPattern.test(ownerId) ? getBillingCheckout(user.id, ownerId) : null
}

export async function createXenditCheckout(formData: FormData): Promise<CheckoutActionResult> {
  const { user } = await requireSuperAdmin()
  const { ownerId, valid } = readForm(formData)
  if (!valid) return { success: false, message: 'ID Owner tidak valid.' }
  return createBillingCheckout(user.id, ownerId, formData.get('plan_code'))
}

export async function syncXenditStatus(formData: FormData): Promise<CheckoutActionResult> {
  const { user } = await requireSuperAdmin()
  const { ownerId, valid } = readForm(formData)
  if (!valid) return { success: false, message: 'ID Owner tidak valid.' }
  return syncBillingCheckout(user.id, ownerId)
}

export async function cancelOpenXenditCheckout(formData: FormData): Promise<CheckoutActionResult> {
  const { user } = await requireSuperAdmin()
  const { ownerId, valid } = readForm(formData)
  if (!valid) return { success: false, message: 'ID Owner tidak valid.' }
  return cancelBillingCheckout(user.id, ownerId)
}

export async function updatePlanPrice(formData: FormData): Promise<CheckoutActionResult> {
  const { user } = await requireSuperAdmin()
  const code = formData.get('plan_code')
  const amount = Number(String(formData.get('amount') ?? '').replace(/[^\d]/g, ''))
  if ((code !== 'monthly' && code !== 'yearly') || !Number.isSafeInteger(amount) || amount < 1000 || amount > 100_000_000) {
    return { success: false, message: 'Harga harus antara Rp1.000 dan Rp100.000.000.' }
  }

  let result
  try {
    result = await platformBillingDb().rpc('platform_set_plan_price', { p_actor: user.id, p_code: code, p_amount: amount })
  } catch {
    return { success: false, message: billingUnavailableMessage }
  }
  const { data, error } = result
  if (error || data !== 'updated') {
    return { success: false, message: data === 'forbidden' ? 'Hanya Super Admin aktif yang dapat mengubah harga.' : 'Harga belum berhasil disimpan.' }
  }
  revalidatePath(route, 'layout')
  return { success: true, message: 'Harga paket diperbarui untuk checkout baru. Nominal checkout yang sudah dibuat tetap berlaku.' }
}
