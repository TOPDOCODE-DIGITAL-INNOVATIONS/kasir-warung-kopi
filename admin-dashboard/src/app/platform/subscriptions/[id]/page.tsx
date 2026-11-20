import Link from 'next/link'
import { notFound, unstable_rethrow } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import PaymentHistory from '@/components/billing/PaymentHistory'
import { platformBillingEnvironment } from '@/lib/platform-billing/config'
import { billingUnavailableMessage } from '@/lib/platform-billing/db'
import { getBillingOwnerDetail } from '../actions'
import { billingDate, billingPeriod, branchCoverageLabels, subscriptionLabels, trialLabels } from '../display'
import StartTrialButton from '../StartTrialButton'
import XenditPaymentPanel from '@/components/billing/XenditPaymentPanel'
import { getCheckoutContext, createXenditCheckout, syncXenditStatus, cancelOpenXenditCheckout } from '../xendit-actions'

const panel = 'overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm'

export default async function BillingDetailPage({ params }: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const environment = platformBillingEnvironment()
  let detail
  let checkoutContext = null
  try {
    ;[detail, checkoutContext] = await Promise.all([
      getBillingOwnerDetail(id),
      getCheckoutContext(id).catch(error => {
        unstable_rethrow(error)
        return null
      }),
    ])
  } catch (error) {
    unstable_rethrow(error)
  }
  if (detail === null) notFound()

  const back = (
    <Link href="/platform/subscriptions" className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:underline">
      <ArrowLeft aria-hidden="true" className="h-4 w-4" /> Kembali ke Subscription &amp; Trial
    </Link>
  )
  if (!detail) return (
    <div className="space-y-4">
      {back}
      <p role="alert" className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">{billingUnavailableMessage}</p>
    </div>
  )

  const { owner, cycles, checkouts } = detail
  const name = owner.name || owner.email || 'Owner'
  const trial = [
    { label: 'Status trial', value: trialLabels[owner.trial_status] },
    { label: 'Mulai', value: billingDate(owner.trial_start, true) },
    { label: 'Berakhir', value: billingDate(owner.trial_end, true) },
  ]
  const subscription = [
    { label: 'Cabang terdaftar', value: owner.branch_count.toLocaleString('id-ID') },
    { label: 'Cakupan cabang', value: branchCoverageLabels[owner.branch_coverage] },
    { label: 'Paket', value: owner.plan_name || '—' },
    { label: 'Status langganan', value: subscriptionLabels[owner.subscription_status] },
    { label: 'Periode berbayar', value: billingPeriod(owner.period_start, owner.period_end) },
    { label: 'Perpanjang sebelum', value: billingDate(owner.next_billing_at ?? owner.period_end, true) },
  ]

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        {back}
        <div>
          <h1 className="break-words text-2xl font-bold text-gray-900">{name}</h1>
          <p className="mt-1 break-words text-sm text-gray-500">
            {[owner.name ? owner.email : null, environment === 'test' ? 'Lingkungan Test' : 'Lingkungan Live'].filter(Boolean).join(' · ')}
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        {[{ label: 'Free Trial', fields: trial }, { label: 'Paket Cabang Tambahan', fields: subscription }].map(({ label, fields }) => (
          <section key={label} className={`${panel} p-5`}>
            <h2 className="font-semibold text-gray-900">{label}</h2>
            {label === 'Paket Cabang Tambahan' && <p className="mt-1 text-sm text-gray-500">
              Cabang pertama gratis. Paket bisa dibayar sebelum atau sesudah cabang tambahan dibuat.
            </p>}
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              {fields.map(({ label, value }) => (
                <div className="min-w-0" key={label}>
                  <dt className="text-sm text-gray-500">{label}</dt>
                  <dd className="mt-1 break-words text-sm font-medium text-gray-900">{value}</dd>
                </div>
              ))}
            </dl>
            {label === 'Free Trial' && <StartTrialButton ownerId={owner.owner_id} name={name} environment={environment} canStart={owner.trial_status === 'none'} />}
            {label === 'Paket Cabang Tambahan' && (checkoutContext ? (
              <XenditPaymentPanel
                ownerId={owner.owner_id}
                ownerName={name}
                environment={environment}
                context={checkoutContext}
                createCheckoutAction={createXenditCheckout}
                syncCheckoutAction={syncXenditStatus}
                cancelCheckoutAction={cancelOpenXenditCheckout}
              />
            ) : <p role="status" className="mt-4 text-sm text-amber-800">Checkout Xendit belum siap. Periksa konfigurasi server dan migration Supabase.</p>)}
          </section>
        ))}
      </div>

      <PaymentHistory cycles={cycles} checkouts={checkouts} />
    </div>
  )
}
