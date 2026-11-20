import Link from 'next/link'
import { unstable_rethrow } from 'next/navigation'
import { rupiah } from '@/lib/format'
import { billingEnvironment } from '../subscriptions/actions'
import { billingDate } from '../subscriptions/display'
import { getPaymentMonitoring } from './actions'
import RecheckPaymentButton from './RecheckPaymentButton'

const route = '/platform/payments'
const button = 'rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50'
const tabs = [{ value: 'pending', label: 'Checkout tertunda' }, { value: 'review', label: 'Webhook perlu ditinjau' }] as const
const results: Record<string, string> = {
  checking: 'Sedang diperiksa', active: 'Menunggu pembayaran', applied: 'Pembayaran tercatat',
  already_applied: 'Pembayaran sudah tercatat', expired: 'Kedaluwarsa', canceled: 'Dibatalkan',
  cancelled: 'Dibatalkan', provider_not_found: 'Sesi tidak ditemukan', provider_unavailable: 'Xendit belum merespons',
}

export default async function PlatformPaymentsPage({ searchParams }: {
  searchParams: Promise<{ view?: string; environment?: string; page?: string }>
}) {
  const search = await searchParams
  const environment = billingEnvironment(search.environment)
  const view = search.view === 'review' ? 'review' : 'pending'
  const href = (tab = view, mode = environment, page = 1) => `${route}?view=${tab}&environment=${mode}&page=${page}`
  let monitoring
  try {
    monitoring = await getPaymentMonitoring(search)
  } catch (error) {
    unstable_rethrow(error)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Pemantauan Pembayaran</h1>
        <p className="mt-1 text-sm text-gray-500">Pantau checkout dan hasil pemeriksaan pembayaran Xendit.</p>
      </div>

      <section className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm" aria-label="Daftar pembayaran">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 p-4">
          <nav aria-label="Daftar pemantauan" className="flex flex-wrap gap-2">
            {tabs.map(tab => <Link key={tab.value} href={href(tab.value)} prefetch={false}
              aria-current={tab.value === view ? 'page' : undefined}
              className={`rounded-lg px-3 py-2 text-sm font-medium ${tab.value === view ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}>
              {tab.label}
            </Link>)}
          </nav>
          <nav aria-label="Lingkungan billing" className="flex gap-1 rounded-lg bg-gray-100 p-1">
            {(['test', 'live'] as const).map(mode => <Link key={mode} href={href(view, mode)} prefetch={false}
              aria-current={mode === environment ? 'page' : undefined}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${mode === environment ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>
              {mode === 'test' ? 'Test' : 'Live'}
            </Link>)}
          </nav>
        </div>

        {!monitoring ? <p role="alert" className="p-5 text-sm text-red-700">Data pemantauan belum berhasil dimuat.</p> : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-gray-600">
                <thead className="bg-gray-50 text-xs uppercase text-gray-700">
                  <tr>{['Owner', 'Referensi', view === 'pending' ? 'Status checkout' : 'Event dan alasan', 'Pemeriksaan terakhir', 'Aksi'].map(label =>
                    <th key={label} scope="col" className="whitespace-nowrap px-4 py-3">{label}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {monitoring.rows.map(row => <tr key={row.id} className="align-top">
                    <td className="min-w-44 px-4 py-3">
                      {row.owner_id ? <Link className="break-all font-medium text-blue-700 hover:underline" prefetch={false}
                        href={`/platform/subscriptions/${row.owner_id}?environment=${environment}`}>{row.owner_email || 'Detail langganan'}</Link> : '—'}
                      {row.plan_name && <p className="mt-0.5 text-xs">{row.plan_name}{row.amount != null ? ` · ${rupiah(row.amount)}` : ''}</p>}
                    </td>
                    <td className="min-w-48 px-4 py-3">
                      <p className="break-all font-medium text-gray-900">{row.reference_id || '—'}</p>
                      {row.xendit_session_id && <p className="mt-0.5 break-all text-xs">{row.xendit_session_id}</p>}
                    </td>
                    <td className="min-w-44 px-4 py-3">
                      {view === 'pending' ? <>
                        <p className="font-medium text-amber-800">{row.status === 'creating' ? 'Menunggu konfirmasi sesi' : 'Menunggu pembayaran'}</p>
                        <p className="mt-0.5 text-xs">Dibuat {billingDate(row.occurred_at, true)}</p>
                        {row.expires_at && <p className="mt-0.5 text-xs">Kedaluwarsa {billingDate(row.expires_at, true)}</p>}
                      </> : <>
                        <p className="break-all font-medium text-gray-900">{row.event_type}</p>
                        <p className="mt-0.5 break-all text-xs text-red-700">{row.error_code || 'Perlu ditinjau'}</p>
                        <p className="mt-0.5 text-xs">Diterima {billingDate(row.occurred_at, true)}</p>
                      </>}
                    </td>
                    <td className="min-w-44 px-4 py-3">
                      <p>{billingDate(row.last_reconcile_at, true)}</p>
                      {row.last_reconcile_result && <p className="mt-0.5 break-all text-xs">{results[row.last_reconcile_result] ?? row.last_reconcile_result}</p>}
                    </td>
                    <td className="min-w-36 px-4 py-3">
                      {row.checkout_id && row.xendit_session_id
                        ? <RecheckPaymentButton checkoutId={row.checkout_id} environment={environment} />
                        : <span className="text-xs text-gray-500">{row.checkout_id ? 'Sesi Xendit belum tercatat' : 'Checkout belum terhubung'}</span>}
                    </td>
                  </tr>)}
                  {!monitoring.rows.length && <tr><td colSpan={5} className="p-8 text-center">{view === 'pending'
                    ? 'Tidak ada checkout tertunda.' : 'Tidak ada webhook yang perlu ditinjau.'}</td></tr>}
                </tbody>
              </table>
            </div>
            {(monitoring.page > 1 || monitoring.hasNext) && <nav aria-label="Halaman pemantauan" className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 p-4 text-sm text-gray-600">
              <span>Halaman {monitoring.page}</span>
              <div className="flex gap-2">
                {monitoring.page > 1 && <Link className={button} prefetch={false} href={href(view, environment, monitoring.page - 1)}>Sebelumnya</Link>}
                {monitoring.hasNext && <Link className={button} prefetch={false} href={href(view, environment, monitoring.page + 1)}>Berikutnya</Link>}
              </div>
            </nav>}
          </>
        )}
      </section>
    </div>
  )
}
