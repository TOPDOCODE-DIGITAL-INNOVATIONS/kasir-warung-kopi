import Link from 'next/link'
import { notFound, unstable_rethrow } from 'next/navigation'
import { Activity, ArrowLeft, ArrowUpRight, Building2, Clock, Package, Receipt, Wallet } from 'lucide-react'
import { StatCard, Badge } from '@/components/ui'
import { rupiah } from '@/lib/format'
import { billingEnvironment as appBillingEnvironment, billingEnabled } from '@/lib/billing/owner-billing'
import { getOwnerActivity, getOwnerDetail } from '../actions'
import { getBillingOwnerDetail } from '../../subscriptions/actions'
import { subscriptionLabels, testerLabels, trialLabels, billingActionLabel } from '../../subscriptions/display'
import TrendChart from '../../charts'
import type { OwnerActivity } from '../types'

const dateFormat = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeZone: 'Asia/Makassar' })
const dateTimeFormat = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Makassar' })
const panel = 'overflow-hidden rounded-2xl border border-gray-200/70 bg-white shadow-sm'
const paginationLink = 'rounded-xl border border-gray-200 px-3 py-2 font-semibold text-gray-700 hover:bg-gray-50'
const ownerList = '/platform/owners'
const dayLabel = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const dayFull = new Intl.DateTimeFormat('id-ID', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
const when = (value: string | null) => value ? dateTimeFormat.format(new Date(value)) + ' WITA' : '—'

const eventLabels: Record<string, string> = {
  account_created: 'Akun didaftarkan', email_confirmed: 'Email diverifikasi', signed_in: 'Masuk terakhir ke dashboard',
  branch_created: 'Cabang dibuat', synced: 'Sinkronisasi terakhir dari kasir', shift_opened: 'Shift kasir dibuka', shift_closed: 'Shift kasir ditutup',
}
const eventLabel = (kind: string) => kind.startsWith('billing:') ? billingActionLabel(kind.slice(8)) : eventLabels[kind] ?? kind
const eventTone = (kind: string) => kind.startsWith('billing:') ? 'bg-blue-500' : kind.startsWith('shift') ? 'bg-emerald-500' : kind === 'synced' ? 'bg-sky-500' : 'bg-gray-400'

function relative(value: string | null) {
  if (!value) return 'Belum pernah'
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000)
  if (minutes < 60) return `${Math.max(minutes, 0)} menit lalu`
  if (minutes < 1440) return `${Math.round(minutes / 60)} jam lalu`
  return `${Math.round(minutes / 1440)} hari lalu`
}

export default async function OwnerDetailPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ page?: string | string[] }>
}) {
  const [{ id }, { page: requestedPage }] = await Promise.all([params, searchParams])
  const environment = appBillingEnvironment()
  let result
  let activity: OwnerActivity | null = null
  let billing = null
  try {
    ;[result, activity, billing] = await Promise.all([
      getOwnerDetail(id, requestedPage),
      getOwnerActivity(id, environment).catch(error => { unstable_rethrow(error); return null }),
      getBillingOwnerDetail(id, environment).catch(error => { unstable_rethrow(error); return null }),
    ])
  } catch (error) {
    unstable_rethrow(error)
  }
  if (result === null) notFound()

  if (!result) return (
    <div className="space-y-4">
      <Link href={ownerList} className="text-sm font-medium text-blue-600 hover:underline">Kembali ke Kelola Owner</Link>
      <p role="alert" className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
        Detail Owner belum berhasil dimuat. Muat ulang halaman untuk mencoba lagi.
      </p>
    </div>
  )

  const { owner, page, hasNext } = result
  const title = owner.name || owner.email || 'Owner'
  const facts = [
    { label: 'Email', value: owner.email || '—' },
    { label: 'Status akun', value: owner.status === 'active' ? 'Aktif' : 'Nonaktif' },
    { label: 'Verifikasi email', value: owner.email_confirmed ? 'Terverifikasi' : 'Belum terverifikasi' },
    { label: 'Tanggal daftar', value: owner.created_at ? dateFormat.format(new Date(owner.created_at)) : '—' },
    { label: 'Terakhir masuk', value: owner.last_sign_in_at ? dateTimeFormat.format(new Date(owner.last_sign_in_at)) + ' WITA' : 'Belum pernah masuk' },
  ]
  const pageHref = (number: number) => `${ownerList}/${owner.id}?page=${number}`

  return (
    <div className="space-y-6">
      <div>
        <Link href={ownerList} className="mb-4 inline-flex items-center gap-2 rounded-lg px-2 py-1 -ml-2 text-sm font-semibold text-gray-600 transition-colors hover:bg-white hover:text-gray-900">
          <ArrowLeft aria-hidden="true" className="h-4 w-4" /> Kembali ke Kelola Owner
        </Link>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-700">Pelanggan</p>
          <h1 className="mt-1 break-words text-[28px] leading-tight text-gray-900 sm:text-3xl">{title}</h1>
        <p className="mt-1 text-sm text-gray-500">Detail akun, langganan, cabang, dan aktivitas Owner di aplikasi.</p>
      </div>

      <section className={`${panel} p-5 sm:p-6`} aria-labelledby="owner-account">
        <h2 id="owner-account" className="text-[15px] font-semibold text-gray-900">Informasi akun</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {facts.map(({ label, value }) => (
            <div key={label} className="min-w-0">
              <dt className="text-xs font-medium text-gray-500">{label}</dt>
              <dd className="mt-1 break-words text-sm font-medium text-gray-900">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {billing && (
        <section className={`${panel} p-5 sm:p-6`} aria-labelledby="owner-billing">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 id="owner-billing" className="text-[15px] font-semibold text-gray-900">Langganan</h2>
              <p className="mt-0.5 text-xs text-gray-500">Lingkungan {environment === 'test' ? 'Test' : 'Live'} (yang dipakai aplikasi Owner){billingEnabled() ? '' : ' · BILLING_ENABLED mati, akses belum dibatasi'}</p>
            </div>
            <Link href={`/platform/subscriptions/${owner.id}?environment=${environment}`} className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-semibold text-blue-700 hover:bg-blue-50">
              Kelola trial &amp; penguji <ArrowUpRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge tone={billing.owner.trial_status === 'active' ? 'gold' : 'gray'}>Trial: {trialLabels[billing.owner.trial_status]}</Badge>
            <Badge tone={billing.owner.subscription_status === 'active' ? 'green' : billing.owner.subscription_status === 'past_due' ? 'red' : 'gray'}>
              Langganan: {subscriptionLabels[billing.owner.subscription_status]}{billing.owner.plan_name ? ` · ${billing.owner.plan_name}` : ''}
            </Badge>
            {billing.owner.tester_status !== 'none' && <Badge tone={billing.owner.tester_status === 'active' ? 'sky' : 'gray'}>
              {testerLabels[billing.owner.tester_status]}{billing.owner.tester_until ? ` · s/d ${dateFormat.format(new Date(billing.owner.tester_until))}` : ''}
            </Badge>}
          </div>
        </section>
      )}

      {activity ? <>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard icon={Receipt} tone="green" label="Transaksi 30 hari" value={activity.totals.transactions_30d.toLocaleString('id-ID')}
            hint={`Total ${activity.totals.transactions_total.toLocaleString('id-ID')} transaksi`} info="Transaksi kasir berstatus selesai di semua cabang Owner." />
          <StatCard icon={Wallet} tone="gold" label="Omzet 30 hari" value={rupiah(activity.totals.revenue_30d)} hint="Semua cabang" info="Jumlah grand total transaksi selesai 30 hari terakhir." />
          <StatCard icon={Building2} tone="sky" label="Cabang aktif 7 hari" value={`${activity.totals.active_branches_7d} / ${activity.totals.branches}`}
            hint={`Sinkron terakhir ${relative(activity.totals.last_synced_at)}`} info="Cabang yang aplikasi kasirnya tersinkron dalam 7 hari terakhir." />
          <StatCard icon={Package} tone="gray" label="Produk" value={activity.totals.products.toLocaleString('id-ID')}
            hint={`Transaksi terakhir ${relative(activity.totals.last_transaction_at)}`} info="Jumlah produk di semua cabang Owner." />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className={`${panel} p-5 sm:p-6`} aria-labelledby="owner-tx-chart">
            <h2 id="owner-tx-chart" className="text-[15px] font-semibold text-gray-900">Transaksi harian</h2>
            <p className="mb-4 mt-0.5 text-xs text-gray-500">30 hari terakhir · WITA</p>
            <TrendChart seriesLabel="Transaksi" data={activity.daily.map(d => ({ label: dayLabel.format(new Date(d.day)), full: dayFull.format(new Date(d.day)), value: Number(d.transactions) }))} />
          </section>
          <section className={`${panel} p-5 sm:p-6`} aria-labelledby="owner-revenue-chart">
            <h2 id="owner-revenue-chart" className="text-[15px] font-semibold text-gray-900">Omzet harian</h2>
            <p className="mb-4 mt-0.5 text-xs text-gray-500">30 hari terakhir · WITA</p>
            <TrendChart kind="area" format="rupiah" seriesLabel="Omzet" data={activity.daily.map(d => ({ label: dayLabel.format(new Date(d.day)), full: dayFull.format(new Date(d.day)), value: Number(d.revenue) }))} />
          </section>
        </div>
      </> : <p role="alert" className="rounded-xl border border-amber-100 bg-amber-50 p-4 text-sm text-amber-800">Aktivitas Owner belum berhasil dimuat.</p>}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <section className={panel} aria-labelledby="owner-branches">
        <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-5 py-4">
          <h2 id="owner-branches" className="font-semibold text-gray-900">Cabang terdaftar</h2>
          <span className="text-sm text-gray-500">{owner.branch_count.toLocaleString('id-ID')} cabang</span>
        </div>
        {activity?.branches.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-600">
              <thead className="bg-gray-50/70 text-[11px] uppercase text-gray-500 tracking-[0.08em] border-b border-gray-100">
                <tr>{['Cabang', 'Transaksi 30 hr', 'Omzet 30 hr', 'Sinkron terakhir', 'Transaksi terakhir', 'Produk'].map(label =>
                  <th key={label} scope="col" className="whitespace-nowrap px-5 py-3">{label}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {activity.branches.map(branch => (
                  <tr key={branch.id}>
                    <th scope="row" className="px-5 py-3 font-normal">
                      <span className="font-medium text-gray-900">{branch.name}</span>
                      <span className="block text-xs text-gray-500">Dibuat {dateFormat.format(new Date(branch.created_at))}{branch.open_shifts ? ' · shift berjalan' : ''}</span>
                    </th>
                    <td className="whitespace-nowrap px-5 py-3 tabular-nums">{Number(branch.transactions_30d).toLocaleString('id-ID')}</td>
                    <td className="whitespace-nowrap px-5 py-3 tabular-nums">{rupiah(Number(branch.revenue_30d))}</td>
                    <td className="whitespace-nowrap px-5 py-3">{relative(branch.last_synced_at)}{branch.last_device_code && <span className="block text-xs text-gray-500">Perangkat {branch.last_device_code}</span>}</td>
                    <td className="whitespace-nowrap px-5 py-3">{relative(branch.last_transaction_at)}</td>
                    <td className="whitespace-nowrap px-5 py-3 tabular-nums">{Number(branch.product_count).toLocaleString('id-ID')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : owner.branches.length ? (
          <ul className="divide-y divide-gray-100 text-sm">
            {owner.branches.map(branch => <li key={branch.id} className="px-5 py-3"><span className="font-medium text-gray-900">{branch.name}</span>
              <span className="ml-2 text-gray-500">{dateFormat.format(new Date(branch.created_at))}</span></li>)}
          </ul>
        ) : <p className="p-5 text-sm text-gray-500">{page === 1 ? 'Owner ini belum memiliki cabang.' : 'Tidak ada cabang pada halaman ini.'}</p>}
        {!activity && (page > 1 || hasNext) && <nav aria-label="Halaman cabang" className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 p-4 text-sm text-gray-600">
          <span>Halaman {page}</span>
          <div className="flex gap-2">
            {page > 1 && <Link href={pageHref(page - 1)} prefetch={false} className={paginationLink}>Sebelumnya</Link>}
            {hasNext && <Link href={pageHref(page + 1)} prefetch={false} className={paginationLink}>Berikutnya</Link>}
          </div>
        </nav>}
      </section>

      <section className={panel} aria-labelledby="owner-timeline">
        <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-4">
          <Activity aria-hidden="true" className="h-4 w-4 text-blue-600" />
          <h2 id="owner-timeline" className="font-semibold text-gray-900">Aktivitas terbaru</h2>
        </div>
        {activity?.events.length ? (
          <ol className="max-h-[32rem] space-y-0 overflow-y-auto px-5 py-4">
            {activity.events.map((event, index) => (
              <li key={`${event.kind}-${event.at}-${index}`} className="relative flex gap-3 pb-4 last:pb-0">
                <span aria-hidden="true" className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${eventTone(event.kind)}`} />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">{eventLabel(event.kind)}</p>
                  <p className="text-xs text-gray-500">{[event.branch, event.kind.startsWith('billing:') ? null : event.detail].filter(Boolean).join(' · ')}</p>
                  <p className="mt-0.5 flex items-center gap-1 text-[11px] text-gray-400"><Clock aria-hidden="true" className="h-3 w-3" />{when(event.at)}</p>
                </div>
              </li>
            ))}
          </ol>
        ) : <p className="p-5 text-sm text-gray-500">Belum ada aktivitas.</p>}
      </section>
      </div>
    </div>
  )
}
