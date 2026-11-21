import 'server-only'

import { cache } from 'react'
import { createAdminClient } from '@/utils/supabase/admin'
import { getBusinessContext } from '@/lib/business-context'
import { computeAccess, TRIAL_DAYS, type Access, type BillingSnapshot } from '../../../../shared/billing-access'
import type { BillingEnvironment } from '@/app/platform/subscriptions/types'

export type OwnerBillingPlan = { code: 'monthly' | 'yearly'; name: string; amount: number; interval_months: number }

export type OwnerBilling = BillingSnapshot & {
  status: 'ok'
  trial_started_at: string | null
  trial_ends_at: string | null
  subscription: {
    status: 'pending' | 'active' | 'past_due' | 'ended'
    plan_code: 'monthly' | 'yearly'
    plan_name: string
    amount: number
    period_start: string | null
    period_end: string | null
    renewal_enabled: boolean
    next_billing_at: string | null
    has_plan: boolean
    xendit_plan_id: string | null
  } | null
  open_checkout: {
    status: 'creating' | 'open'
    checkout_url: string | null
    expires_at: string | null
    plan_name: string
    amount: number
    has_session: boolean
    xendit_session_id: string | null
  } | null
  plans: OwnerBillingPlan[]
}

/** Lingkungan Xendit yang dipakai Owner. Default Test sampai akun Live siap. */
export function billingEnvironment(): BillingEnvironment {
  return process.env.BILLING_ENVIRONMENT?.trim().toLowerCase() === 'live' ? 'live' : 'test'
}

/**
 * Baca status billing Owner (dan mulai trial otomatis bila memenuhi syarat).
 * Mengembalikan null bila billing belum dapat dibaca; pemanggil TIDAK boleh
 * membatasi akses berdasarkan kegagalan baca (fail-open untuk operasional usaha).
 */
export async function readOwnerBilling(ownerId: string): Promise<OwnerBilling | null> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return null
  try {
    const { data, error } = await createAdminClient().rpc('owner_billing_status', {
      p_owner: ownerId, p_environment: billingEnvironment(), p_trial_days: TRIAL_DAYS,
    })
    if (error) {
      console.error('[billing] owner_billing_status', error.message)
      return null
    }
    return (data as { status?: string })?.status === 'ok' ? (data as OwnerBilling) : null
  } catch (err) {
    console.error('[billing] owner_billing_status', err)
    return null
  }
}

const UNLIMITED: Access = {
  state: 'active', endsAt: null, graceEndsAt: null, daysLeft: 0, readOnly: false, paymentIssue: false, showReminder: false,
}

/** Billing + hak akses akun yang sedang login (di-cache per request). */
export const getCurrentOwnerAccess = cache(async (): Promise<{ billing: OwnerBilling | null; access: Access }> => {
  const { user, account } = await getBusinessContext()
  if (account.role === 'super_admin') return { billing: null, access: UNLIMITED }
  const billing = await readOwnerBilling(user.id)
  return { billing, access: billing ? computeAccess(billing) : UNLIMITED }
})

export const READ_ONLY_MESSAGE =
  'Langganan Anda sudah berakhir sehingga data hanya dapat dilihat. Buka menu Langganan untuk melanjutkan.'

/** Panggil di awal setiap server action yang mengubah data. */
export async function assertWritable() {
  const { access } = await getCurrentOwnerAccess()
  if (access.readOnly) throw new Error(READ_ONLY_MESSAGE)
}
