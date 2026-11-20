import 'server-only'

import { xenditRequest } from '@/lib/xendit/client'

type PlatformXenditAccount = { secretKey: string; businessId: string }

export async function ensureXenditCustomer(secretKey: string, params: {
  ownerId: string
  email: string
  name: string
  existingCustomerId?: string | null
}): Promise<string> {
  if (params.existingCustomerId) {
    return params.existingCustomerId
  }
  if (!params.email) {
    throw new Error('Owner belum memiliki email; customer Xendit tidak dapat dibuat.')
  }
  const parts = (params.name || 'Owner KasirKu').trim().split(/\s+/)
  const givenNames = parts[0] || 'Owner'
  const surname = parts.slice(1).join(' ') || 'KasirKu'
  // Referensi tetap per Owner: percobaan ulang menemukan customer yang sama, bukan membuat baru.
  const ref = `kasirku-owner-${params.ownerId}`

  const existing = await xenditRequest<{ data?: { id?: string }[] }>(
    secretKey,
    `/customers?reference_id=${encodeURIComponent(ref)}`
  ).catch(() => null)
  const found = existing?.data?.find((c) => c.id)?.id
  if (found) return found

  const res = await xenditRequest<{ id?: string }>(secretKey, '/customers', {
    method: 'POST',
    idempotencyKey: ref,
    body: {
      reference_id: ref,
      type: 'INDIVIDUAL',
      email: params.email,
      individual_detail: {
        given_names: givenNames.slice(0, 50),
        surname: surname.slice(0, 50),
      },
    },
  })

  if (!res.id) {
    throw new Error('Gagal membuat customer Xendit.')
  }
  return res.id
}

export type XenditSessionResponse = {
  payment_session_id: string
  business_id: string
  payment_link_url?: string
  status?: string
  expires_at?: string
  customer_id?: string
}

export async function createXenditPaymentSession(account: PlatformXenditAccount, params: {
  referenceId: string
  customerId: string
  amount: number
  planName: string
  successReturnUrl: string
  cancelReturnUrl: string
}): Promise<{
  sessionId: string
  checkoutUrl: string
  expiresAt: string | null
}> {
  const res = await xenditRequest<XenditSessionResponse>(account.secretKey, '/sessions', {
    method: 'POST',
    idempotencyKey: params.referenceId,
    body: {
      reference_id: params.referenceId,
      customer_id: params.customerId,
      session_type: 'PAY',
      mode: 'PAYMENT_LINK',
      capture_method: 'AUTOMATIC',
      amount: params.amount,
      currency: 'IDR',
      country: 'ID',
      description: `Pembayaran KasirKu Paket ${params.planName}`,
      success_return_url: params.successReturnUrl,
      cancel_return_url: params.cancelReturnUrl,
    },
  })
  requireMatchingBusiness(res, account)

  const sessionId = res.payment_session_id
  const checkoutUrl = res.payment_link_url
  if (!sessionId || !checkoutUrl) {
    throw new Error('Xendit tidak mengembalikan tautan pembayaran (payment_link_url).')
  }

  return {
    sessionId,
    checkoutUrl,
    expiresAt: res.expires_at ?? null,
  }
}

export type XenditSessionDetail = XenditSessionResponse & { reference_id?: string }

function requireMatchingBusiness(session: XenditSessionResponse, account: PlatformXenditAccount) {
  if (session.business_id !== account.businessId) throw new Error('Business ID sesi Xendit tidak cocok dengan akun platform.')
}

export async function getXenditSession(account: PlatformXenditAccount, sessionId: string): Promise<XenditSessionDetail> {
  const session = await xenditRequest<XenditSessionDetail>(account.secretKey, `/sessions/${encodeURIComponent(sessionId)}`)
  requireMatchingBusiness(session, account)
  return session
}

export async function cancelXenditSession(account: PlatformXenditAccount, sessionId: string) {
  await getXenditSession(account, sessionId)
  return xenditRequest<XenditSessionResponse>(account.secretKey, `/sessions/${encodeURIComponent(sessionId)}/cancel`, {
    method: 'POST',
  })
}
