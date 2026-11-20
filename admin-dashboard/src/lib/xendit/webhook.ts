import { createHash, timingSafeEqual } from 'node:crypto'

export type WebhookEnvironment = 'test' | 'live'

export type ParsedXenditWebhook = {
  event: string
  businessId: string | null
  objectId: string | null
  dedupKey: string
  payload: Record<string, unknown>
}

function sameSecret(received: string, expected: string) {
  const a = createHash('sha256').update(received).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}

/**
 * Xendit mengirim token verifikasi di header `x-callback-token`. Test Mode dan Live Mode
 * punya token berbeda, jadi token juga menentukan lingkungan event.
 */
export function resolveWebhookEnvironment(
  token: string | null,
  tokens: { test?: string; live?: string }
): WebhookEnvironment | null {
  if (!token) return null
  if (tokens.live && sameSecret(token, tokens.live)) return 'live'
  if (tokens.test && sameSecret(token, tokens.test)) return 'test'
  return null
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function parseXenditWebhook(raw: unknown): ParsedXenditWebhook | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const payload = raw as Record<string, unknown>
  const event = text(payload.event)
  const data = payload.data
  if (!event || !data || typeof data !== 'object' || Array.isArray(data)) return null
  const d = data as Record<string, unknown>
  if (d.session_type !== 'PAY' || (event !== 'payment_session.completed' && event !== 'payment_session.expired')) return null

  const objectId = text(d.id) ?? text(d.payment_session_id)
  // Satu event yang sama (dikirim ulang) menghasilkan kunci yang sama; perubahan status
  // pada objek yang sama menghasilkan kunci baru.
  const parts = [
    event,
    objectId ?? '',
    text(d.status) ?? '',
    text(d.updated) ?? '',
    typeof d.attempt_count === 'number' ? String(d.attempt_count) : '',
  ]
  const dedupKey = createHash('sha256').update(parts.join('|')).digest('hex')

  return { event, businessId: text(payload.business_id), objectId, dedupKey, payload }
}
