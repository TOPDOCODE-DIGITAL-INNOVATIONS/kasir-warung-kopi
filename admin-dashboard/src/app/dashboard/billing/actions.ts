'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getBusinessContext } from '@/lib/business-context'
import { BILLING_DISABLED_MESSAGE, billingEnabled, billingEnvironment, readOwnerBilling } from '@/lib/billing/owner-billing'
import { createCheckout, reconcileXendit, stopRenewal } from '@/lib/billing/checkout-core'
import { getXenditSession } from '@/lib/xendit/client'

export type BillingActionState = { status: 'idle' | 'success' | 'error'; message: string }

const ownerMessages: Record<string, string> = {
  forbidden: 'Akun Anda belum dapat berlangganan. Hubungi admin KasirKu.',
  invalid_request: 'Permintaan tidak valid. Muat ulang halaman.',
  owner_not_found: 'Akun tidak ditemukan. Silakan masuk kembali.',
  email_missing: 'Akun Anda belum memiliki email.',
  checkout_open: 'Anda masih punya tautan pembayaran yang aktif. Gunakan tombol "Lanjutkan Pembayaran".',
  subscription_active: 'Langganan Anda masih aktif. Paket baru bisa dipilih setelah periode berjalan berakhir.',
  payment_verifying: 'Pembayaran Anda sedang diverifikasi. Klik "Cek Status Pembayaran" beberapa saat lagi.',
  plan_unavailable: 'Paket belum tersedia. Hubungi admin KasirKu.',
}

async function owner() {
  const { user, account } = await getBusinessContext()
  if (account.role !== 'owner') throw new Error('Halaman ini khusus Owner.')
  return user.id
}

const done = (message: string): BillingActionState => {
  revalidatePath('/dashboard', 'layout')
  return { status: 'success', message }
}
const fail = (message: string): BillingActionState => ({ status: 'error', message })

/** Buat (atau lanjutkan) checkout Xendit lalu arahkan Owner ke halaman pembayaran. */
export async function startCheckout(_prev: BillingActionState, form: FormData): Promise<BillingActionState> {
  if (!billingEnabled()) return { status: 'error', message: BILLING_DISABLED_MESSAGE }
  const plan = form.get('plan_code')
  if (plan !== 'monthly' && plan !== 'yearly') return fail('Pilih paket langganan.')
  let url: string | undefined
  try {
    const id = await owner()
    const result = await createCheckout(id, id, billingEnvironment(), plan, ownerMessages)
    if (!result.success || !result.checkoutUrl) {
      revalidatePath('/dashboard/billing')
      return fail(result.message)
    }
    url = result.checkoutUrl
  } catch (err) {
    console.error('[billing] owner checkout', err)
    return fail('Pembayaran belum dapat dibuat. Silakan coba beberapa saat lagi.')
  }
  redirect(url)
}

/** Ambil status terbaru dari Xendit (bila webhook belum masuk). */
export async function checkPaymentStatus(): Promise<BillingActionState> {
  if (!billingEnabled()) return { status: 'error', message: BILLING_DISABLED_MESSAGE }
  try {
    const id = await owner()
    const environment = billingEnvironment()
    const billing = await readOwnerBilling(id)
    if (!billing) return fail('Status langganan belum dapat dibaca. Coba lagi.')
    const sessionId = billing.open_checkout?.xendit_session_id ?? null
    const session = sessionId ? await getXenditSession(environment, sessionId) : null
    const planId = billing.subscription?.xendit_plan_id
      ?? session?.subscription?.recurring_plan_id ?? session?.recurring_plan_id ?? null
    if (!session && !planId) return fail('Belum ada pembayaran untuk dicek.')
    await reconcileXendit(id, id, environment, session, planId)
    return done('Status pembayaran diperbarui.')
  } catch (err) {
    console.error('[billing] owner reconcile', err)
    return fail('Status pembayaran belum dapat dicek. Silakan coba lagi.')
  }
}

/** Hentikan perpanjangan otomatis. Akses tetap berlaku sampai akhir periode yang sudah dibayar. */
export async function cancelAutoRenewal(): Promise<BillingActionState> {
  if (!billingEnabled()) return { status: 'error', message: BILLING_DISABLED_MESSAGE }
  try {
    const id = await owner()
    const billing = await readOwnerBilling(id)
    const planId = billing?.subscription?.renewal_enabled ? billing.subscription.xendit_plan_id : null
    if (!planId) return fail('Tidak ada perpanjangan otomatis yang aktif.')
    const { planStatus } = await stopRenewal(id, id, billingEnvironment(), planId)
    if (planStatus?.toUpperCase() !== 'INACTIVE') return fail('Permintaan terkirim, tetapi belum dikonfirmasi Xendit. Cek ulang beberapa saat lagi.')
    return done('Perpanjangan otomatis dihentikan. Langganan tetap aktif sampai akhir periode.')
  } catch (err) {
    console.error('[billing] owner cancel renewal', err)
    return fail('Perpanjangan belum dapat dihentikan. Silakan coba lagi.')
  }
}
