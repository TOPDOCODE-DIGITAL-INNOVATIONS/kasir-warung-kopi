import Link from 'next/link'
import { unstable_rethrow } from 'next/navigation'
import XenditPaymentPanel from '@/components/billing/XenditPaymentPanel'
import { rupiah } from '@/lib/format'
import { platformBillingEnvironment } from '@/lib/platform-billing/config'
import { billingPeriod, branchCoverageLabels, subscriptionLabels } from '@/app/platform/subscriptions/display'
import { cancelOwnerCheckout, createOwnerCheckout, getOwnerBillingDetail, getOwnerCheckout, syncOwnerCheckout } from './actions'

export default async function OwnerSubscriptionPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const { plan } = await searchParams
  let detail
  let checkout
  try {
    ;[detail, checkout] = await Promise.all([
      getOwnerBillingDetail(),
      getOwnerCheckout().catch(error => { unstable_rethrow(error); return null }),
    ])
  } catch (error) {
    unstable_rethrow(error)
  }
  const owner = detail?.owner

  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Langganan &amp; Pembayaran</h1>
        <p className="mt-1 text-sm text-gray-500">Cabang pertama gratis. Pilih paket bulanan atau tahunan untuk cabang tambahan.</p>
      </div>
      <Link href="/dashboard/subscription/history" className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Riwayat Pembayaran</Link>
    </div>

    {owner ? <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm" aria-labelledby="owner-plan">
      <h2 id="owner-plan" className="font-semibold text-gray-900">Paket Cabang Tambahan</h2>
      <dl className="my-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Cabang terdaftar', value: owner.branch_count.toLocaleString('id-ID') },
          { label: 'Cakupan cabang', value: branchCoverageLabels[owner.branch_coverage] },
          { label: 'Status langganan', value: subscriptionLabels[owner.subscription_status] },
          { label: 'Periode berbayar', value: billingPeriod(owner.period_start, owner.period_end) },
        ].map(({ label, value }) => <div key={label}>
          <dt className="text-sm text-gray-500">{label}</dt>
          <dd className="mt-1 text-sm font-medium text-gray-900">{value}</dd>
        </div>)}
      </dl>
      <ul className="grid gap-3 sm:grid-cols-3">
        <li className="rounded-lg border border-blue-100 bg-blue-50/50 p-3">
          <p className="text-sm font-medium text-gray-900">Satu cabang gratis</p>
          <p className="mt-1 text-sm text-gray-600">Rp 0</p>
        </li>
        {checkout?.plans.map(offer => <li key={offer.code} className="rounded-lg border border-gray-200 p-3">
          <p className="text-sm font-medium text-gray-900">{offer.name}</p>
          <p className="mt-1 text-sm text-gray-600">{rupiah(offer.amount)} / {offer.code === 'monthly' ? 'bulan' : 'tahun'}</p>
        </li>)}
      </ul>
      {checkout ? <XenditPaymentPanel key={plan} initialPlan={plan} ownerName={owner.name || owner.email || 'Owner'}
        environment={platformBillingEnvironment()} context={checkout}
        createCheckoutAction={createOwnerCheckout} syncCheckoutAction={syncOwnerCheckout} cancelCheckoutAction={cancelOwnerCheckout} />
        : <p role="status" className="mt-4 text-sm text-amber-800">Checkout Xendit belum tersedia.</p>}
    </section> : <p role="alert" className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">Data langganan belum berhasil dimuat. Muat ulang halaman untuk mencoba lagi.</p>}
  </div>
}
