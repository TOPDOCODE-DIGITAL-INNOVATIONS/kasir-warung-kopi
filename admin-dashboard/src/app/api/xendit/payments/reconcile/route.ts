import { createHash, timingSafeEqual } from 'node:crypto'
import { reconcilePaymentQueue, successfulReconciliation } from '@/lib/xendit/reconcile'

export const preferredRegion = 'syd1'
export const maxDuration = 60

function digest(value: string) {
  return createHash('sha256').update(value).digest()
}

export async function POST(request: Request) {
  const secret = process.env.BILLING_CRON_SECRET
  const auth = request.headers.get('authorization')
  if (!secret || !auth || !timingSafeEqual(digest(auth), digest(`Bearer ${secret}`))) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }

  try {
    const results = await Promise.all((['test', 'live'] as const).map(async environment => {
      const outcomes = await reconcilePaymentQueue(environment)
      if (!outcomes) return { environment, configured: false }
      return {
        environment,
        checked: outcomes.length,
        paymentsApplied: outcomes.filter(result => result === 'applied').length,
        needsReview: outcomes.filter(result => !successfulReconciliation.has(result)).length,
      }
    }))
    return Response.json({ results })
  } catch (error) {
    console.error('[billing-reconcile] Pemeriksaan berkala gagal', error)
    return Response.json({ error: 'temporarily unavailable' }, { status: 503 })
  }
}
