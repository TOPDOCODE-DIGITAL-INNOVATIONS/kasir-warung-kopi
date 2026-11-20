export type { BillingEnvironment } from '@/lib/platform-billing/config'

export const TRIAL_DURATION_DAYS = 14

export const billingFilters = {
  trial_active: 'Trial aktif',
  subscription_active: 'Langganan aktif',
  pending: 'Menunggu pembayaran',
  past_due: 'Perlu pembayaran',
  not_started: 'Belum mulai',
} as const

export type BillingFilter = keyof typeof billingFilters
export type TrialStatus = 'none' | 'scheduled' | 'active' | 'expired'
export type SubscriptionStatus = 'none' | 'pending' | 'active' | 'past_due' | 'expired'

export type BillingOwner = {
  owner_id: string
  name: string | null
  email: string | null
  trial_status: TrialStatus
  trial_start: string | null
  trial_end: string | null
  subscription_status: SubscriptionStatus
  plan_name: string | null
  period_start: string | null
  period_end: string | null
  next_billing_at: string | null
}

export type BillingOverview = {
  summary: Record<Exclude<BillingFilter, 'pending'>, number>
  plans: { code: 'monthly' | 'yearly'; name: string; version: number; amount: number | null; status: 'draft' | 'active' }[]
  owners: BillingOwner[]
}

export type BillingOwnerDetail = {
  owner: BillingOwner
  cycles: {
    id: string; plan_name: string; status: string; amount: number; scheduled_at: string | null
    paid_at: string | null; xendit_payment_id: string | null
  }[]
  checkouts: {
    id: string; plan_name: string; status: string; amount: number; reference_id: string
    created_at: string; expires_at: string | null
  }[]
}
