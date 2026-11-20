import Link from 'next/link'
import { notFound, unstable_rethrow } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { rupiah } from '@/lib/format'
import { platformBillingEnvironment } from '@/lib/platform-billing/config'
import { billingUnavailableMessage } from '@/lib/platform-billing/db'
import { getBillingOwnerDetail } from '../actions'
import { billingDate, subscriptionLabels, trialLabels } from '../display'
import StartTrialButton from '../StartTrialButton'
import XenditPaymentPanel from '../XenditPaymentPanel'
import { getCheckoutContext } from '../xendit-actions'

const panel = 'overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm'
const tableHead = 'whitespace-nowrap px-4 py-3'
const tableCell = 'whitespace-nowrap px-4 py-3 text-gray-600'

const checkoutLabels: Record<string, string> = {
  creating: 'Dibuat', open: 'Menunggu pembayaran', completed: 'Selesai',
  expired: 'Kedaluwarsa', cancelled: 'Dibatalkan', failed: 'Gagal',
}
const cycleLabels: Record<string, string> = {
  scheduled: 'Terjadwal', pending: 'Dalam proses', retrying: 'Dicoba ulang',
  failed: 'Gagal', succeeded: 'Dibayar', cancelled: 'Dibatalkan',
}

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
    { label: 'Paket', value: owner.plan_name || '—' },
    { label: 'Status langganan', value: subscriptionLabels[owner.subscription_status] },
    { label: 'Periode berbayar', value: owner.period_end ? `${billingDate(owner.period_start)} – ${billingDate(owner.period_end)}` : '—' },
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
        {[{ label: 'Free Trial', fields: trial }, { label: 'Langganan', fields: subscription }].map(({ label, fields }) => (
          <section key={label} className={`${panel} p-5`}>
            <h2 className="font-semibold text-gray-900">{label}</h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              {fields.map(({ label, value }) => (
                <div className="min-w-0" key={label}>
                  <dt className="text-sm text-gray-500">{label}</dt>
                  <dd className="mt-1 break-words text-sm font-medium text-gray-900">{value}</dd>
                </div>
              ))}
            </dl>
            {label === 'Free Trial' && <StartTrialButton ownerId={owner.owner_id} name={name} environment={environment} canStart={owner.trial_status === 'none'} />}
            {label === 'Langganan' && (checkoutContext ? (
              <XenditPaymentPanel
                ownerId={owner.owner_id}
                ownerName={name}
                environment={environment}
                context={checkoutContext}
              />
            ) : <p role="status" className="mt-4 text-sm text-amber-800">Checkout Xendit belum siap. Periksa konfigurasi server dan migration Supabase.</p>)}
          </section>
        ))}
      </div>

      <section className={panel} aria-labelledby="billing-cycles">
        <h2 id="billing-cycles" className="border-b border-gray-100 px-5 py-4 font-semibold text-gray-900">Riwayat tagihan <span className="ml-2 text-xs font-normal text-gray-500">25 terbaru</span></h2>
        <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-700">
                <tr>{['Paket', 'Jadwal', 'Nominal', 'Status', 'Dibayar', 'Referensi pembayaran'].map(label => <th key={label} scope="col" className={tableHead}>{label}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {cycles.map(cycle => <tr key={cycle.id}>
                  <th scope="row" className={`${tableCell} font-medium text-gray-900`}>{cycle.plan_name}</th>
                  <td className={tableCell}>{billingDate(cycle.scheduled_at)}</td>
                  <td className={tableCell}>{rupiah(cycle.amount)}</td>
                  <td className={tableCell}>{cycleLabels[cycle.status] || cycle.status}</td>
                  <td className={tableCell}>{billingDate(cycle.paid_at)}</td>
                  <td className={tableCell}>{cycle.xendit_payment_id || '—'}</td>
                </tr>)}
                {!cycles.length && <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-500">Belum ada riwayat tagihan.</td></tr>}
              </tbody>
            </table>
        </div>
      </section>

      <section className={panel} aria-labelledby="billing-checkouts">
        <h2 id="billing-checkouts" className="border-b border-gray-100 px-5 py-4 font-semibold text-gray-900">Sesi checkout <span className="ml-2 text-xs font-normal text-gray-500">25 terbaru</span></h2>
        <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-700">
                <tr>{['Referensi', 'Paket', 'Nominal', 'Status', 'Dibuat', 'Kedaluwarsa'].map(label => <th key={label} scope="col" className={tableHead}>{label}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {checkouts.map(checkout => <tr key={checkout.id}>
                  <th scope="row" className={`${tableCell} font-medium text-gray-900`}>{checkout.reference_id}</th>
                  <td className={tableCell}>{checkout.plan_name}</td>
                  <td className={tableCell}>{rupiah(checkout.amount)}</td>
                  <td className={tableCell}>{checkoutLabels[checkout.status] || checkout.status}</td>
                  <td className={tableCell}>{billingDate(checkout.created_at)}</td>
                  <td className={tableCell}>{billingDate(checkout.expires_at)}</td>
                </tr>)}
                {!checkouts.length && <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-500">Belum ada sesi checkout.</td></tr>}
              </tbody>
            </table>
        </div>
      </section>
    </div>
  )
}
