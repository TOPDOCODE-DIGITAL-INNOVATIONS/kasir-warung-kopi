import 'server-only'
import type { BillingEnvironment } from '@/app/platform/subscriptions/types'

const XENDIT_BASE_URL = 'https://api.xendit.co'
const REQUEST_TIMEOUT_MS = 20_000

/** Xendit menjawab dengan error (4xx/5xx). Kegagalan jaringan/timeout TIDAK memakai kelas ini. */
export class XenditApiError extends Error {
  constructor(message: string, readonly status: number, readonly errorCode: string | null) {
    super(message)
    this.name = 'XenditApiError'
  }
}

function resolveSecretKey(environment: BillingEnvironment): string {
  const key =
    environment === 'test'
      ? process.env.XENDIT_TEST_SECRET_KEY || process.env.XENDIT_SECRET_KEY
      : process.env.XENDIT_LIVE_SECRET_KEY || process.env.XENDIT_SECRET_KEY

  if (!key) {
    throw new Error(
      `Secret key Xendit untuk lingkungan ${environment === 'test' ? 'Test (XENDIT_TEST_SECRET_KEY / XENDIT_SECRET_KEY)' : 'Live (XENDIT_LIVE_SECRET_KEY)'} belum dikonfigurasi di .env.`
    )
  }
  if (environment === 'test' && !key.startsWith('xnd_development_')) {
    throw new Error('Lingkungan Test hanya menerima secret key Test Mode (diawali xnd_development_).')
  }
  if (environment === 'live' && !key.startsWith('xnd_production_')) {
    throw new Error('Lingkungan Live hanya menerima secret key Live Mode (diawali xnd_production_).')
  }
  return key
}

async function xenditRequest<T = Record<string, unknown>>(
  environment: BillingEnvironment,
  path: string,
  options: { method?: 'GET' | 'POST'; body?: unknown; idempotencyKey?: string } = {}
): Promise<T> {
  const secretKey = resolveSecretKey(environment)
  const auth = Buffer.from(`${secretKey}:`).toString('base64')
  const headers: Record<string, string> = {
    Authorization: `Basic ${auth}`,
    'Content-Type': 'application/json',
  }
  if (options.idempotencyKey) {
    headers['Idempotency-key'] = options.idempotencyKey
  }

  const res = await fetch(`${XENDIT_BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    cache: 'no-store',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

  const text = await res.text()
  let parsed: Record<string, unknown> = {}
  try {
    parsed = text ? (JSON.parse(text) as Record<string, unknown>) : {}
  } catch {
    // ignore non-json
  }

  if (!res.ok) {
    const msg =
      typeof parsed.message === 'string'
        ? parsed.message
        : `Xendit API error (${res.status})`
    throw new XenditApiError(msg, res.status, typeof parsed.error_code === 'string' ? parsed.error_code : null)
  }

  return parsed as T
}

export async function ensureXenditCustomer(params: {
  environment: BillingEnvironment
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
    params.environment,
    `/customers?reference_id=${encodeURIComponent(ref)}`
  ).catch(() => null)
  const found = existing?.data?.find((c) => c.id)?.id
  if (found) return found

  const res = await xenditRequest<{ id?: string }>(params.environment, '/customers', {
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
  payment_link_url?: string
  status?: string
  expires_at?: string
  customer_id?: string
}

export async function createXenditPaymentSession(params: {
  environment: BillingEnvironment
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
  const res = await xenditRequest<XenditSessionResponse>(params.environment, '/sessions', {
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

export async function getXenditSession(environment: BillingEnvironment, sessionId: string): Promise<XenditSessionDetail> {
  return xenditRequest<XenditSessionResponse>(environment, `/sessions/${encodeURIComponent(sessionId)}`)
}

export async function cancelXenditSession(environment: BillingEnvironment, sessionId: string) {
  return xenditRequest<XenditSessionResponse>(environment, `/sessions/${encodeURIComponent(sessionId)}/cancel`, {
    method: 'POST',
  })
}

