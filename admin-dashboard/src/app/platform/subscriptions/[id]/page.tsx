import Link from 'next/link'
import { notFound, unstable_rethrow } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { rupiah } from '@/lib/format'
import { billingEnvironment, getBillingOwnerDetail } from '../actions'
import { billingActionLabel, billingDate, subscriptionLabels, testerLabels, trialLabels } from '../display'
import StartTrialButton from '../StartTrialButton'
import TesterAccessControls from '../TesterAccessControls'
import XenditSubscriptionPanel from '../XenditSubscriptionPanel'
import { getCheckoutContext } from '../xendit-actions'
import { billingEnvironment as appBillingEnvironment, billingEnabled } from '@/lib/billing/owner-billing'

const panel = 'overflow-hidden rounded-2xl border border-gray-200/70 bg-white shadow-sm'
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

export default async function BillingDetailPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ environment?: string }>
}) {
  const [{ id }, search] = await Promise.all([params, searchParams])
  const environment = billingEnvironment(search.environment)
  const list = `/platform/subscriptions?environment=${environment}`
  let detail
  let checkoutContext = null
  try {
    ;[detail, checkoutContext] = await Promise.all([
      getBillingOwnerDetail(id, environment),
      getCheckoutContext(id, environment),
    ])
  } catch (error) {
    unstable_rethrow(error)
  }
  if (detail === null) notFound()

  const back = (
    <Link href={list} className="-ml-2 inline-flex items-center gap-2 rounded-lg px-2 py-1 text-sm font-semibold text-gray-600 transition-colors hover:bg-white hover:text-gray-900">
      <ArrowLeft aria-hidden="true" className="h-4 w-4" /> Kembali ke Subscription &amp; Trial
    </Link>
  )
  if (!detail) return (
    <div className="space-y-4">
      {back}
      <p role="alert" className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">Detail billing belum berhasil dimuat. Muat ulang halaman untuk mencoba lagi.</p>
    </div>
  )

  const { owner, cycles, checkouts } = detail
  const audit = detail.audit ?? []
  const name = owner.name || owner.email || 'Owner'
  const trial = [
    { label: 'Status trial', value: trialLabels[owner.trial_status] },
    { label: 'Mulai', value: billingDate(owner.trial_start, true) },
    { label: 'Berakhir', value: billingDate(owner.trial_end, true) },
    { label: 'Akun penguji', value: testerLabels[owner.tester_status] },
    ...(owner.tester_until ? [{ label: owner.tester_status === 'active' ? 'Penguji sampai' : 'Penguji berakhir', value: billingDate(owner.tester_until, true) }] : []),
    ...(owner.tester_note ? [{ label: 'Catatan penguji', value: owner.tester_note }] : []),
  ]
  const subscription = [
    { label: 'Paket', value: owner.plan_name || '—' },
    { label: 'Status langganan', value: subscriptionLabels[owner.subscription_status] },
    { label: 'Periode berbayar', value: owner.period_end ? `${billingDate(owner.period_start)} – ${billingDate(owner.period_end)}` : '—' },
    { label: 'Tagihan berikutnya', value: billingDate(owner.next_billing_at, true) },
    { label: 'Perpanjangan otomatis', value: owner.renewal_enabled == null ? '—' : owner.renewal_enabled ? 'Aktif' : 'Nonaktif' },
    { label: 'ID plan Xendit', value: owner.reference_plan_id || '—' },
  ]

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        {back}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-700">Monetisasi</p>
          <h1 className="mt-1 break-words text-[28px] leading-tight text-gray-900 sm:text-3xl">{name}</h1>
          <p className="mt-1 break-words text-sm text-gray-500">
            <Link href={`/platform/owners/${owner.owner_id}`} className="mr-2 font-semibold text-blue-700 hover:underline">Lihat aktivitas pelanggan</Link>
            {[owner.name ? owner.email : null, environment === 'test' ? 'Lingkungan Test' : 'Lingkungan Live'].filter(Boolean).join(' · ')}
          </p>
        </div>
      </div>

      {environment !== appBillingEnvironment() && (
        <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Aplikasi Owner saat ini memakai lingkungan <b>{appBillingEnvironment() === 'test' ? 'Test' : 'Live'}</b>. Perubahan trial/penguji di lingkungan ini
          tidak memengaruhi akses Owner. <Link className="font-semibold underline" href={`/platform/subscriptions/${owner.owner_id}?environment=${appBillingEnvironment()}`}>Buka lingkungan {appBillingEnvironment() === 'test' ? 'Test' : 'Live'}</Link>
        </p>
      )}
      {!billingEnabled() && (
        <p role="status" className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
          BILLING_ENABLED belum aktif: trial, penguji, dan langganan tercatat, tetapi akses Owner belum dibatasi.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        {[{ label: 'Free Trial & Penguji', fields: trial }, { label: 'Langganan', fields: subscription }].map(({ label, fields }) => (
          <section key={label} className={`${panel} p-5 sm:p-6`}>
            <h2 className="text-[15px] font-semibold text-gray-900">{label}</h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              {fields.map(({ label, value }) => (
                <div className="min-w-0" key={label}>
                  <dt className="text-xs font-medium text-gray-500">{label}</dt>
                  <dd className="mt-1 break-words text-sm font-medium text-gray-900">{value}</dd>
                </div>
              ))}
            </dl>
            {label === 'Free Trial & Penguji' && <>
              <StartTrialButton ownerId={owner.owner_id} name={name} environment={environment} canStart={owner.trial_status === 'none' && owner.tester_status !== 'active'} />
              <TesterAccessControls ownerId={owner.owner_id} name={name} environment={environment} trialStatus={owner.trial_status} testerStatus={owner.tester_status} />
            </>}
            {label === 'Langganan' && (
              <XenditSubscriptionPanel
                ownerId={owner.owner_id}
                ownerName={name}
                environment={environment}
                context={checkoutContext}
              />
            )}
          </section>
        ))}
      </div>

      <section className={panel} aria-labelledby="billing-cycles">
        <h2 id="billing-cycles" className="border-b border-gray-100 px-5 py-4 font-semibold text-gray-900">Siklus tagihan <span className="ml-2 text-xs font-normal text-gray-500">25 terbaru</span></h2>
        <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50/70 text-[11px] uppercase text-gray-500 tracking-[0.08em] border-b border-gray-100">
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
                {!cycles.length && <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-500">Belum ada siklus tagihan.</td></tr>}
              </tbody>
            </table>
        </div>
      </section>

      <section className={panel} aria-labelledby="billing-checkouts">
        <h2 id="billing-checkouts" className="border-b border-gray-100 px-5 py-4 font-semibold text-gray-900">Sesi checkout <span className="ml-2 text-xs font-normal text-gray-500">25 terbaru</span></h2>
        <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50/70 text-[11px] uppercase text-gray-500 tracking-[0.08em] border-b border-gray-100">
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
      <section className={panel} aria-labelledby="billing-audit">
        <h2 id="billing-audit" className="border-b border-gray-100 px-5 py-4 font-semibold text-gray-900">Log aktivitas billing <span className="ml-2 text-xs font-normal text-gray-500">30 terbaru</span></h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50/70 text-[11px] uppercase text-gray-500 tracking-[0.08em] border-b border-gray-100">
              <tr>{['Waktu', 'Aktivitas', 'Oleh', 'Hasil', 'Referensi'].map(label => <th key={label} scope="col" className={tableHead}>{label}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {audit.map(event => <tr key={event.id}>
                <td className={tableCell}>{billingDate(event.created_at, true)}</td>
                <th scope="row" className={`${tableCell} font-medium text-gray-900`}>{billingActionLabel(event.action)}</th>
                <td className={tableCell}>{event.actor}</td>
                <td className={tableCell}>{event.outcome === 'success' ? 'Berhasil' : 'Gagal'}</td>
                <td className={`${tableCell} max-w-64 truncate`}>{event.reference_id || '—'}</td>
              </tr>)}
              {!audit.length && <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-500">Belum ada aktivitas billing.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
