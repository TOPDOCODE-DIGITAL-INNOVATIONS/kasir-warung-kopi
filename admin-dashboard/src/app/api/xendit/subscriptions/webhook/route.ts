import { NextResponse } from 'next/server'
import { platformDb } from '@/app/platform/db'
import { parseXenditWebhook, resolveWebhookEnvironment } from '@/lib/xendit/webhook'

// Sama dengan region database Supabase (Sydney); lihat src/app/layout.tsx.
export const preferredRegion = 'syd1'

/**
 * Webhook Xendit Subscriptions (recurring.plan.*, recurring.cycle.*) dan Payment Sessions
 * (payment_session.*). Satu URL dipakai untuk Test dan Live; lingkungan ditentukan dari
 * token `x-callback-token` (XENDIT_TEST_WEBHOOK_TOKEN / XENDIT_LIVE_WEBHOOK_TOKEN).
 *
 * Respons 2xx hanya dikirim setelah event tersimpan di billing_webhook_events.
 * Respons 5xx membuat Xendit mengirim ulang (dedup di database mencegah efek ganda).
 */
export async function POST(request: Request) {
  const environment = resolveWebhookEnvironment(request.headers.get('x-callback-token'), {
    test: process.env.XENDIT_TEST_WEBHOOK_TOKEN,
    live: process.env.XENDIT_LIVE_WEBHOOK_TOKEN,
  })
  if (!environment) {
    console.warn('[xendit-webhook] token tidak valid')
    return NextResponse.json({ error: 'invalid token' }, { status: 401 })
  }

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const parsed = parseXenditWebhook(raw)
  if (!parsed) {
    // Payload produk lain / tombol "Test" di dashboard: terima agar tidak dikirim ulang.
    console.info(`[xendit-webhook] env=${environment} payload tanpa event, diabaikan`)
    return NextResponse.json({ received: true, result: 'ignored' })
  }

  const expectedBusiness = environment === 'live'
    ? process.env.XENDIT_LIVE_BUSINESS_ID
    : process.env.XENDIT_TEST_BUSINESS_ID
  if (expectedBusiness && parsed.businessId !== expectedBusiness) {
    console.warn(`[xendit-webhook] env=${environment} event=${parsed.event} business_id tidak cocok`)
    return NextResponse.json({ error: 'unexpected business' }, { status: 403 })
  }

  const { data, error } = await platformDb().rpc('platform_ingest_xendit_webhook', {
    p_environment: environment,
    p_dedup_key: parsed.dedupKey,
    p_event_type: parsed.event,
    p_object_id: parsed.objectId,
    p_payload: parsed.payload,
  })
  if (error) {
    console.error(`[xendit-webhook] env=${environment} event=${parsed.event} object=${parsed.objectId} gagal disimpan: ${error.code ?? ''} ${error.message}`)
    return NextResponse.json({ error: 'temporarily unavailable' }, { status: 500 })
  }

  console.info(`[xendit-webhook] env=${environment} event=${parsed.event} object=${parsed.objectId} result=${data}`)
  return NextResponse.json({ received: true, result: data })
}
