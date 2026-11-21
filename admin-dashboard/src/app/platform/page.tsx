import Link from 'next/link'
import { unstable_rethrow } from 'next/navigation'
import { Activity, ArrowUpRight, Building2, CalendarClock, CircleAlert, CreditCard, FlaskConical, Receipt, Trophy, UserCheck, UserPlus, UserRound, UserRoundX, Users, Wallet } from 'lucide-react'
import InfoTip from '@/components/InfoTip'
import { rupiah } from '@/lib/format'
import { StatCard } from '@/components/ui'
import { billingEnvironment as appBillingEnvironment } from '@/lib/billing/owner-billing'
import { getPlatformInsights, getPlatformOverview, type InsightRange, type PlatformInsights } from './actions'
import { getBillingOverview } from './subscriptions/actions'
import { billingActionLabel, billingDate } from './subscriptions/display'
import TrendChart from './charts'

const panel = 'rounded-2xl border border-gray-200/70 bg-white shadow-sm'

const billingSegments = [
  { key: 'subscription_active', label: 'Langganan aktif', Icon: CreditCard, bar: 'bg-emerald-500', tone: 'bg-emerald-50 text-emerald-700', info: 'Owner dengan periode langganan berbayar yang sedang berjalan.' },
  { key: 'trial_active', label: 'Trial aktif', Icon: CalendarClock, bar: 'bg-blue-500', tone: 'bg-blue-50 text-blue-700', info: 'Owner yang sedang dalam masa coba gratis.' },
  { key: 'tester_active', label: 'Akun penguji', Icon: FlaskConical, bar: 'bg-sky-500', tone: 'bg-sky-50 text-sky-700', info: 'Owner dengan akses gratis dari Super Admin untuk user testing.' },
  { key: 'past_due', label: 'Perlu pembayaran', Icon: CircleAlert, bar: 'bg-red-500', tone: 'bg-red-50 text-red-600', info: 'Tagihan perpanjangan gagal dan menunggu pembayaran Owner.' },
  { key: 'not_started', label: 'Belum mulai', Icon: UserRound, bar: 'bg-gray-300', tone: 'bg-gray-100 text-gray-600', info: 'Owner yang belum memulai trial maupun langganan.' },
] as const

const percent = (value: number, total: number) => (total ? Math.round((value / total) * 100) : 0)

const ranges: { key: InsightRange; label: string; caption: string }[] = [
  { key: '30d', label: '30 hari', caption: '30 hari terakhir, per hari' },
  { key: '90d', label: '90 hari', caption: '13 minggu terakhir, per minggu' },
  { key: '12m', label: '12 bulan', caption: '12 bulan terakhir, per bulan' },
]
const utc = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('id-ID', { ...options, timeZone: 'UTC' })
const bucketFormat = {
  day: { short: utc({ day: 'numeric', month: 'short' }), full: utc({ weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }) },
  week: { short: utc({ day: 'numeric', month: 'short' }), full: utc({ day: 'numeric', month: 'long', year: 'numeric' }) },
  month: { short: utc({ month: 'short', year: '2-digit' }), full: utc({ month: 'long', year: 'numeric' }) },
}

function points(insights: PlatformInsights, key: 'new_owners' | 'new_branches' | 'transactions' | 'gmv' | 'billing_revenue') {
  const format = bucketFormat[insights.unit]
  return insights.series.map(row => {
    const date = new Date(row.bucket)
    return {
      label: format.short.format(date),
      full: insights.unit === 'week' ? `Minggu mulai ${format.full.format(date)}` : format.full.format(date),
      value: Number(row[key]),
    }
  })
}

export default async function PlatformPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const { range: requested } = await searchParams
  const range: InsightRange = requested === '90d' || requested === '12m' ? requested : '30d'
  const environment = appBillingEnvironment()
  const [ownerResult, billingResult, insightResult] = await Promise.allSettled([
    getPlatformOverview(), getBillingOverview({ environment }), getPlatformInsights(range, environment),
  ])
  for (const result of [ownerResult, billingResult, insightResult]) if (result.status === 'rejected') unstable_rethrow(result.reason)
  const overview = ownerResult.status === 'fulfilled' ? ownerResult.value : null
  const billing = billingResult.status === 'fulfilled' ? billingResult.value : null
  const insights = insightResult.status === 'fulfilled' ? insightResult.value : null
  const caption = ranges.find(r => r.key === range)!.caption

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-700">Pusat kendali</p>
        <h1 className="mt-1 text-3xl text-gray-900">Overview Platform</h1>
        <p className="mt-1 text-sm text-gray-500">Ringkasan akun Owner, cabang, dan status langganan yang terdaftar.</p>
      </div>

      {overview ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <section aria-label="Total Owner" className="relative overflow-hidden rounded-2xl bg-espresso-900 p-6 text-white shadow-lg md:col-span-2">
            <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-champagne/20 blur-3xl" />
            <div className="relative">
              <div className="flex items-start justify-between gap-3">
                <span className="inline-flex items-center gap-2 rounded-full bg-white/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-champagne ring-1 ring-white/10">
                  <Users aria-hidden="true" className="h-3.5 w-3.5" /> Total Owner
                </span>
                <InfoTip tone="dark" label="Total Owner" text="Jumlah seluruh akun Owner yang terdaftar di platform, aktif maupun nonaktif." />
              </div>
              <p className="mt-5 font-display text-5xl font-semibold tabular-nums">{overview.owner_count.toLocaleString('id-ID')}</p>
              <div className="mt-6">
                <div className="flex justify-between text-xs text-gray-400">
                  <span>Aktif {percent(overview.active_owner_count, overview.owner_count)}%</span>
                  <span>Nonaktif {percent(overview.inactive_owner_count, overview.owner_count)}%</span>
                </div>
                <div aria-hidden="true" className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full bg-champagne" style={{ width: `${percent(overview.active_owner_count, overview.owner_count)}%` }} />
                </div>
              </div>
            </div>
          </section>
          {[
            { label: 'Cabang Terdaftar', value: overview.branch_count, Icon: Building2, tone: 'bg-blue-50 text-blue-700', info: 'Jumlah seluruh cabang usaha milik semua Owner.' },
            { label: 'Owner Aktif', value: overview.active_owner_count, Icon: UserCheck, tone: 'bg-emerald-50 text-emerald-700', info: 'Owner berstatus aktif yang dapat masuk dan memakai aplikasi.' },
            { label: 'Owner Nonaktif', value: overview.inactive_owner_count, Icon: UserRoundX, tone: 'bg-gray-100 text-gray-600', info: 'Owner yang dinonaktifkan oleh admin platform.' },
          ].map(({ label, value, Icon, tone, info }) => (
            <section key={label} aria-label={label} className={`${panel} p-5 transition-shadow hover:shadow-md`}>
              <div className="flex items-start justify-between gap-3">
                <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}><Icon aria-hidden="true" className="h-[18px] w-[18px]" /></span>
                <InfoTip label={label} text={info} />
              </div>
              <p className="mt-4 text-[13px] font-medium text-gray-500">{label}</p>
              <p className="mt-1 text-[26px] font-semibold tracking-tight tabular-nums text-gray-900">{value.toLocaleString('id-ID')}</p>
            </section>
          ))}
        </div>
      ) : <p role="alert" className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
        Ringkasan platform belum berhasil dimuat. Muat ulang halaman untuk mencoba lagi.
      </p>}

      {billing ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <section aria-labelledby="billing-status" className={`${panel} p-6 lg:col-span-2`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 id="billing-status" className="text-base font-semibold text-gray-900">Status Langganan Owner</h2>
                <p className="mt-0.5 text-xs text-gray-500">Lingkungan Xendit: <span className="font-semibold uppercase text-gray-700">{billing.environment}</span> · klik status untuk melihat daftar Owner</p>
              </div>
              <Link href="/platform/subscriptions" className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-semibold text-blue-700 hover:bg-blue-50">
                Kelola <ArrowUpRight aria-hidden="true" className="h-4 w-4" />
              </Link>
            </div>
            <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {billingSegments.map(({ key, label, Icon, tone, bar, info }) => (
                <li key={key} className="relative">
                  <Link href={`/platform/subscriptions?${new URLSearchParams({ status: key, environment: billing.environment })}`}
                    className="flex items-center gap-3 rounded-xl border border-gray-100 p-3.5 pr-10 transition-colors hover:border-blue-200 hover:bg-blue-50/40 focus-visible:outline-2 focus-visible:outline-blue-500">
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tone}`}><Icon aria-hidden="true" className="h-4 w-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-xs font-medium text-gray-500"><span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${bar}`} />{label}</span>
                      <span className="mt-0.5 block text-lg font-semibold tabular-nums text-gray-900">
                        {billing.summary[key].toLocaleString('id-ID')}
                        <span className="ml-1.5 text-xs font-normal text-gray-400">owner</span>
                      </span>
                    </span>
                  </Link>
                  <span className="absolute right-2 top-2"><InfoTip label={label} text={info} /></span>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="billing-plans" className={`${panel} p-6`}>
            <div className="flex items-center gap-1.5">
              <h2 id="billing-plans" className="text-base font-semibold text-gray-900">Paket Langganan</h2>
              <InfoTip label="Paket Langganan" text="Harga paket yang dipakai saat Owner berlangganan. Ubah di menu Subscription & Trial." />
            </div>
            <p className="mt-0.5 text-xs text-gray-500">Harga yang berlaku untuk checkout</p>
            {billing.plans.length ? (
              <ul className="mt-5 space-y-3">
                {billing.plans.map(plan => (
                  <li key={`${plan.code}-${plan.version}`} className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 px-4 py-3.5 ring-1 ring-gray-100">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-900">{plan.name}</p>
                      <p className="text-xs text-gray-500">{plan.code === 'yearly' ? 'Tahunan' : 'Bulanan'} · versi {plan.version}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-display text-lg font-semibold tabular-nums text-gray-900">{plan.amount === null ? '—' : rupiah(plan.amount)}</p>
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${plan.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-200 text-gray-600'}`}>
                        {plan.status === 'active' ? 'Aktif' : 'Draft'}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-5 rounded-xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">Belum ada paket.</p>}
          </section>
        </div>
      ) : <p role="alert" className="rounded-xl border border-amber-100 bg-amber-50 p-4 text-sm text-amber-800">
        Ringkasan langganan belum berhasil dimuat. Buka menu Subscription &amp; Trial untuk detailnya.
      </p>}

      <section aria-labelledby="platform-insights" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="platform-insights" className="text-lg font-semibold text-gray-900">Laporan Aktivitas Platform</h2>
            <p className="mt-0.5 text-xs text-gray-500">{caption} · WITA · billing lingkungan {environment === 'test' ? 'Test' : 'Live'}</p>
          </div>
          <nav aria-label="Rentang laporan" className="inline-flex rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
            {ranges.map(r => (
              <Link key={r.key} href={`/platform?range=${r.key}`} prefetch={false} aria-current={r.key === range ? 'page' : undefined}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${r.key === range ? 'bg-espresso-900 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
                {r.label}
              </Link>
            ))}
          </nav>
        </div>

        {insights ? <>
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            <StatCard icon={UserPlus} tone="gold" label="Owner baru" value={insights.kpis.new_owners.toLocaleString('id-ID')} hint="Pendaftaran pada rentang ini" info="Akun Owner yang mendaftar pada rentang terpilih." />
            <StatCard icon={Activity} tone="sky" label="Owner aktif 7 hari" value={insights.kpis.active_owners_7d.toLocaleString('id-ID')}
              hint={`${insights.kpis.active_branches_7d.toLocaleString('id-ID')} cabang tersinkron`} info="Owner yang minimal satu cabangnya tersinkron dari aplikasi kasir dalam 7 hari terakhir." />
            <StatCard icon={Receipt} tone="green" label="Transaksi kasir" value={insights.kpis.transactions.toLocaleString('id-ID')}
              hint={`${insights.kpis.transacting_owners.toLocaleString('id-ID')} Owner bertransaksi`} info="Transaksi berstatus selesai dari semua cabang Owner pada rentang terpilih." />
            <StatCard icon={Wallet} tone="gold" label="Pendapatan langganan" value={rupiah(insights.kpis.billing_revenue)}
              hint={`GMV kasir ${rupiah(insights.kpis.gmv)}`} info="Pembayaran langganan yang berhasil (siklus tagihan Xendit) pada rentang terpilih." />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className={`${panel} p-5 sm:p-6`} aria-labelledby="chart-owners">
              <h3 id="chart-owners" className="text-[15px] font-semibold text-gray-900">Pertumbuhan Owner</h3>
              <p className="mb-4 mt-0.5 text-xs text-gray-500">Jumlah Owner baru per periode</p>
              <TrendChart seriesLabel="Owner baru" data={points(insights, 'new_owners')} />
            </section>
            <section className={`${panel} p-5 sm:p-6`} aria-labelledby="chart-tx">
              <h3 id="chart-tx" className="text-[15px] font-semibold text-gray-900">Transaksi Kasir</h3>
              <p className="mb-4 mt-0.5 text-xs text-gray-500">Transaksi selesai di semua cabang</p>
              <TrendChart kind="area" seriesLabel="Transaksi" data={points(insights, 'transactions')} />
            </section>
            <section className={`${panel} p-5 sm:p-6`} aria-labelledby="chart-gmv">
              <h3 id="chart-gmv" className="text-[15px] font-semibold text-gray-900">GMV Kasir</h3>
              <p className="mb-4 mt-0.5 text-xs text-gray-500">Total nilai transaksi selesai</p>
              <TrendChart kind="area" format="rupiah" seriesLabel="GMV" data={points(insights, 'gmv')} />
            </section>
            <section className={`${panel} p-5 sm:p-6`} aria-labelledby="chart-revenue">
              <h3 id="chart-revenue" className="text-[15px] font-semibold text-gray-900">Pendapatan Langganan</h3>
              <p className="mb-4 mt-0.5 text-xs text-gray-500">Pembayaran langganan berhasil</p>
              <TrendChart format="rupiah" seriesLabel="Pendapatan" data={points(insights, 'billing_revenue')} />
            </section>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className={`${panel} overflow-hidden`} aria-labelledby="top-owners">
              <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-4">
                <Trophy aria-hidden="true" className="h-4 w-4 text-blue-600" />
                <h3 id="top-owners" className="text-[15px] font-semibold text-gray-900">Owner Teraktif</h3>
                <span className="text-xs text-gray-500">berdasarkan transaksi</span>
              </div>
              {insights.top_owners.length ? (
                <ol className="divide-y divide-gray-100">
                  {insights.top_owners.map((owner, index) => (
                    <li key={owner.owner_id}>
                      <Link href={`/platform/owners/${owner.owner_id}`} prefetch={false} className="flex items-center gap-3 px-5 py-3 hover:bg-blue-50/30">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-600">{index + 1}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-gray-900">{owner.name || owner.email || 'Owner'}</span>
                          <span className="block text-xs text-gray-500">{owner.branches} cabang · GMV {rupiah(Number(owner.gmv))}</span>
                        </span>
                        <span className="text-sm font-semibold tabular-nums text-gray-900">{Number(owner.transactions).toLocaleString('id-ID')}</span>
                      </Link>
                    </li>
                  ))}
                </ol>
              ) : <p className="p-5 text-sm text-gray-500">Belum ada transaksi pada rentang ini.</p>}
            </section>
            <section className={`${panel} overflow-hidden`} aria-labelledby="recent-activity">
              <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-4">
                <Activity aria-hidden="true" className="h-4 w-4 text-blue-600" />
                <h3 id="recent-activity" className="text-[15px] font-semibold text-gray-900">Aktivitas Terbaru</h3>
              </div>
              {insights.recent.length ? (
                <ul className="divide-y divide-gray-100">
                  {insights.recent.map((event, index) => (
                    <li key={`${event.kind}-${event.owner_id}-${index}`}>
                      <Link href={`/platform/owners/${event.owner_id}`} prefetch={false} className="flex items-start gap-3 px-5 py-3 hover:bg-blue-50/30">
                        <span aria-hidden="true" className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${event.kind === 'account_created' ? 'bg-emerald-500' : 'bg-blue-500'}`} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-gray-900">{event.kind === 'account_created' ? 'Owner baru mendaftar' : billingActionLabel(event.kind.replace(/^billing:/, ''))}</span>
                          <span className="block truncate text-xs text-gray-500">{event.name || event.email || 'Owner'}</span>
                        </span>
                        <span className="shrink-0 text-xs text-gray-400">{billingDate(event.at, true)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : <p className="p-5 text-sm text-gray-500">Belum ada aktivitas.</p>}
            </section>
          </div>
        </> : <p role="alert" className="rounded-xl border border-amber-100 bg-amber-50 p-4 text-sm text-amber-800">
          Laporan aktivitas belum berhasil dimuat. Muat ulang halaman untuk mencoba lagi.
        </p>}
      </section>
    </div>
  )
}
