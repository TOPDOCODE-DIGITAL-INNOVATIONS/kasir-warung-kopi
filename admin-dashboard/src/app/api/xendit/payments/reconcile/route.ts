import { platformBillingEnvironment } from '@/lib/platform-billing/config'
import { reconcilePaymentQueue, successfulReconciliation } from '@/lib/platform-billing/reconcile'
import { sameSecret } from '@/lib/platform-billing/webhook'

export const preferredRegion = 'syd1'
export const maxDuration = 60

export async function POST(request: Request) {
  const secret = process.env.BILLING_CRON_SECRET
  const auth = request.headers.get('authorization')
  if (!secret || !auth || !sameSecret(auth, `Bearer ${secret}`)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }

  try {
    const outcomes = await reconcilePaymentQueue()
    return Response.json({ results: [{
      environment: platformBillingEnvironment(),
      checked: outcomes.length,
      paymentsApplied: outcomes.filter(result => result === 'applied').length,
      needsReview: outcomes.filter(result => !successfulReconciliation.has(result)).length,
    }] })
  } catch (error) {
    console.error('[billing-reconcile] Pemeriksaan berkala gagal', error)
    return Response.json({ error: 'temporarily unavailable' }, { status: 503 })
  }
}
