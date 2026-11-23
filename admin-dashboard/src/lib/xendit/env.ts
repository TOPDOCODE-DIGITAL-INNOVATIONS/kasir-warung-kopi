import type { BillingEnvironment } from '@/app/platform/subscriptions/types'

/**
 * Satu set env Xendit untuk semua lingkungan (development / preview / production):
 *   XENDIT_SECRET_KEY, XENDIT_WEBHOOK_TOKEN, XENDIT_BUSINESS_ID
 * Mode Test/Live ditentukan dari awalan secret key, bukan dari nama variabel:
 *   xnd_production_ -> live, selain itu (termasuk kosong) -> test.
 */
export function xenditSecretKey(): string {
  return process.env.XENDIT_SECRET_KEY?.trim() || ''
}

export function xenditEnvironment(): BillingEnvironment {
  return xenditSecretKey().startsWith('xnd_production_') ? 'live' : 'test'
}

export function xenditWebhookToken(): string | undefined {
  return process.env.XENDIT_WEBHOOK_TOKEN?.trim() || undefined
}

export function xenditBusinessId(): string | undefined {
  return process.env.XENDIT_BUSINESS_ID?.trim() || undefined
}
