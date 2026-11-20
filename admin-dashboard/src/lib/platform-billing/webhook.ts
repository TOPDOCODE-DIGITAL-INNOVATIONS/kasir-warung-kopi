import { createHash, timingSafeEqual } from 'node:crypto'

export type ParsedXenditWebhook = {
  event: string
  businessId: string | null
  objectId: string
  referenceId: string
  dedupKey: string
  payload: Record<string, unknown>
}

export function sameSecret(received: string, expected: string) {
  const a = createHash('sha256').update(received).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
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

  const objectId = text(d.payment_session_id)
  const referenceId = text(d.reference_id)
  if (!objectId || !referenceId) return null
  const envelopeBusiness = text(payload.business_id)
  const sessionBusiness = text(d.business_id)
  const businessId = sessionBusiness && sessionBusiness !== envelopeBusiness ? null : envelopeBusiness
  // Satu event yang sama (dikirim ulang) menghasilkan kunci yang sama; perubahan status
  // pada objek yang sama menghasilkan kunci baru.
  const parts = [
    event,
    objectId,
    text(d.status) ?? '',
    text(d.updated) ?? '',
    typeof d.attempt_count === 'number' ? String(d.attempt_count) : '',
  ]
  const dedupKey = createHash('sha256').update(parts.join('|')).digest('hex')

  return { event, businessId, objectId, referenceId, dedupKey, payload }
}
