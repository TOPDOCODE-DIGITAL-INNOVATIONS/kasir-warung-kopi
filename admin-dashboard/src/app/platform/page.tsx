import Link from 'next/link'
import { unstable_rethrow } from 'next/navigation'
import { ArrowUpRight, Building2, CalendarClock, CircleAlert, CreditCard, UserCheck, UserRound, UserRoundX, Users } from 'lucide-react'
import InfoTip from '@/components/InfoTip'
import { rupiah } from '@/lib/format'
import { getPlatformOverview } from './actions'
import { getBillingOverview } from './subscriptions/actions'

const panel = 'rounded-2xl border border-gray-200/70 bg-white shadow-sm'

const billingSegments = [
  { key: 'subscription_active', label: 'Langganan aktif', Icon: CreditCard, bar: 'bg-emerald-500', tone: 'bg-emerald-50 text-emerald-700', info: 'Owner dengan periode langganan berbayar yang sedang berjalan.' },
  { key: 'trial_active', label: 'Trial aktif', Icon: CalendarClock, bar: 'bg-blue-500', tone: 'bg-blue-50 text-blue-700', info: 'Owner yang sedang dalam masa coba gratis.' },
  { key: 'past_due', label: 'Perlu pembayaran', Icon: CircleAlert, bar: 'bg-red-500', tone: 'bg-red-50 text-red-600', info: 'Tagihan perpanjangan gagal dan menunggu pembayaran Owner.' },
  { key: 'not_started', label: 'Belum mulai', Icon: UserRound, bar: 'bg-gray-300', tone: 'bg-gray-100 text-gray-600', info: 'Owner yang belum memulai trial maupun langganan.' },
] as const

const percent = (value: number, total: number) => (total ? Math.round((value / total) * 100) : 0)

export default async function PlatformPage() {
  const [ownerResult, billingResult] = await Promise.allSettled([getPlatformOverview(), getBillingOverview({})])
  for (const result of [ownerResult, billingResult]) if (result.status === 'rejected') unstable_rethrow(result.reason)
  const overview = ownerResult.status === 'fulfilled' ? ownerResult.value : null
  const billing = billingResult.status === 'fulfilled' ? billingResult.value : null

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
    </div>
  )
}
