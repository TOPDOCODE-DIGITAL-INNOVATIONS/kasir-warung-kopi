import { NextResponse } from 'next/server'
import { platformBillingEnvironment, platformXenditWebhookConfig } from '@/lib/platform-billing/config'
import { platformBillingDb, requirePlatformBillingSchema } from '@/lib/platform-billing/db'
import { parseXenditWebhook, sameSecret } from '@/lib/platform-billing/webhook'

// Sama dengan region database Supabase (Sydney); lihat src/app/layout.tsx.
export const preferredRegion = 'syd1'

/**
 * Webhook Xendit Payment Sessions untuk pembayaran satu kali.
 * Deployment menentukan lingkungan. Token dan business ID harus cocok dengan akun platform.
 *
 * Respons 2xx hanya dikirim setelah event tersimpan di billing_webhook_events.
 * Respons 5xx membuat Xendit mengirim ulang (dedup di database mencegah efek ganda).
 */
export async function POST(request: Request) {
  const environment = platformBillingEnvironment()
  const config = platformXenditWebhookConfig()
  if (!config) return NextResponse.json({ error: 'billing unavailable' }, { status: 503 })

  const token = request.headers.get('x-callback-token')
  if (!token || !sameSecret(token, config.token)) {
    return NextResponse.json({ error: 'invalid token' }, { status: 401 })
  }

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const parsed = parseXenditWebhook(raw)
  if (!parsed || !parsed.referenceId.startsWith(`pay-${environment}-`)) {
    return NextResponse.json({ received: true, result: 'ignored' })
  }

  if (parsed.businessId !== config.businessId) {
    return NextResponse.json({ error: 'unexpected business' }, { status: 403 })
  }

  try {
    const db = platformBillingDb()
    await requirePlatformBillingSchema(db)
    const { data, error } = await db.rpc('platform_ingest_xendit_webhook', {
      p_environment: environment,
      p_dedup_key: parsed.dedupKey,
      p_event_type: parsed.event,
      p_object_id: parsed.objectId,
      p_payload: parsed.payload,
    })
    if (error) throw error
    console.info(`[platform-billing-webhook] env=${environment} event=${parsed.event} object=${parsed.objectId} result=${data}`)
    return NextResponse.json({ received: true, result: data })
  } catch {
    console.error(`[platform-billing-webhook] env=${environment} object=${parsed.objectId} gagal diproses`)
    return NextResponse.json({ error: 'temporarily unavailable' }, { status: 500 })
  }
}
