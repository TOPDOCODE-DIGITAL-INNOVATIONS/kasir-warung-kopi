'use server'

import { redirect } from 'next/navigation'
import { getBusinessContext } from '@/lib/business-context'
import { platformBillingEnvironment } from '@/lib/platform-billing/config'
import { billingUnavailableMessage, platformBillingDb } from '@/lib/platform-billing/db'
import { cancelBillingCheckout, createBillingCheckout, getBillingCheckout, syncBillingCheckout } from '@/lib/platform-billing/session-service'
import type { BillingOwnerDetail } from '@/app/platform/subscriptions/types'

async function requireOwner() {
  const { user, account } = await getBusinessContext()
  if (account.role !== 'owner') redirect('/platform')
  if (account.status !== 'active') throw new Error('Pembayaran belum tersedia untuk akun ini.')
  return user.id
}

export async function getOwnerCheckout() {
  const ownerId = await requireOwner()
  return getBillingCheckout(ownerId, ownerId)
}

export async function getOwnerBillingDetail() {
  const ownerId = await requireOwner()
  const { data, error } = await platformBillingDb().rpc('platform_billing_owner_detail', {
    p_actor: ownerId, p_owner: ownerId, p_environment: platformBillingEnvironment(),
  })
  const detail: BillingOwnerDetail | null = data
  if (error || !detail || typeof detail.owner.branch_count !== 'number') throw new Error(billingUnavailableMessage)
  return detail
}

export async function createOwnerCheckout(formData: FormData) {
  const ownerId = await requireOwner()
  return createBillingCheckout(ownerId, ownerId, formData.get('plan_code'))
}

export async function syncOwnerCheckout() {
  const ownerId = await requireOwner()
  return syncBillingCheckout(ownerId, ownerId)
}

export async function cancelOwnerCheckout() {
  const ownerId = await requireOwner()
  return cancelBillingCheckout(ownerId, ownerId)
}
