import Link from 'next/link'
import { unstable_rethrow } from 'next/navigation'
import { CalendarClock, CircleAlert, CreditCard, FlaskConical, UserRound } from 'lucide-react'
import DataPanel from '@/components/DataPanel'
import FilterForm, { FilterSubmit } from '@/components/FilterForm'
import { rupiah } from '@/lib/format'
import { getBillingOverview } from './actions'
import { billingDate, subscriptionLabels, trialLabels } from './display'
import { billingFilters } from './types'
import PlanPriceForm from './PlanPriceForm'
import WebhookSettingsPanel from './WebhookSettingsPanel'
import { getWebhookSettingsStatus } from './xendit-actions'
import { getSiteUrl } from '@/lib/site-url'
import { Badge, EmptyState, PageHeader, StatCard, ui } from '@/components/ui'

const route = '/platform/subscriptions'
const field = 'rounded-xl border border-gray-200 bg-gray-50/60 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition-colors hover:border-gray-300 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100 mt-1 w-full'
const panel = 'overflow-hidden rounded-2xl border border-gray-200/70 bg-white shadow-sm'
const pageButton = 'rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50'

const cards = [
  { key: 'trial_active', Icon: CalendarClock, tone: 'gold', info: 'Owner yang sedang dalam masa coba gratis.' },
  { key: 'subscription_active', Icon: CreditCard, tone: 'green', info: 'Owner dengan periode langganan berbayar yang berjalan.' },
  { key: 'tester_active', Icon: FlaskConical, tone: 'sky', info: 'Owner yang diberi akses penuh gratis oleh Super Admin untuk user testing.' },
  { key: 'past_due', Icon: CircleAlert, tone: 'red', info: 'Tagihan perpanjangan gagal dan menunggu pembayaran.' },
  { key: 'not_started', Icon: UserRound, tone: 'gray', info: 'Owner yang belum memulai trial maupun langganan.' },
] as const

export default async function SubscriptionsPage({ searchParams }: {
  searchParams: Promise<{ environment?: string; q?: string; status?: string; page?: string }>
}) {
  let overview
  let webhookStatus = null
  const siteUrl = await getSiteUrl()
  try {
    ;[overview, webhookStatus] = await Promise.all([
      getBillingOverview(await searchParams),
      getWebhookSettingsStatus().catch(() => null),
    ])
  } catch (error) {
    unstable_rethrow(error)
  }

  const paging = (page: number, environment: string, search: string, status: string) =>
    `${route}?${new URLSearchParams({ page: String(page), environment, q: search, status })}`

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Monetisasi" title="Subscription & Trial" description="Pantau trial, paket, dan periode penagihan akun Owner." />
      {overview ? (
        <>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
            {cards.map(({ key, Icon, tone, info }) => (
              <StatCard key={key} icon={Icon} tone={tone} label={billingFilters[key]} value={overview.summary[key].toLocaleString('id-ID')} hint="Owner" info={info} />
            ))}
          </div>

          <section aria-labelledby="subscription-plans" className={panel}>
            <div className="border-b border-gray-100 px-5 py-4 sm:px-6">
              <h2 id="subscription-plans" className="text-[15px] font-semibold text-gray-900">Paket langganan</h2>
              <p className="mt-0.5 text-xs text-gray-500">Harga yang dipakai saat Owner checkout. Perubahan berlaku untuk checkout berikutnya.</p>
            </div>
            {overview.plans.length ? (
              <ul className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
                {overview.plans.map(plan => (
                  <li key={plan.code} className="rounded-2xl border border-gray-200/70 bg-gray-50/40 p-5">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-gray-900">{plan.name}</h3>
                      <Badge tone={plan.status === 'active' ? 'green' : 'gray'}>{plan.status === 'active' ? 'Aktif' : 'Draf'}</Badge>
                    </div>
                    <p className="mt-2 font-display text-2xl font-semibold tabular-nums text-gray-900">
                      {plan.amount == null ? <span className="font-sans text-sm font-normal text-gray-500">Harga belum ditentukan</span> : <>{rupiah(plan.amount)}<span className="ml-1 font-sans text-sm font-normal text-gray-500">/ {plan.code === 'monthly' ? 'bulan' : 'tahun'}</span></>}
                    </p>
                    <PlanPriceForm code={plan.code} amount={plan.amount} />
                  </li>
                ))}
              </ul>
            ) : <p className="px-5 py-4 text-sm text-gray-500">Belum ada paket langganan.</p>}
          </section>

          {webhookStatus && (
            <WebhookSettingsPanel
              webhookUrl={`${siteUrl}/api/xendit/subscriptions/webhook`}
              testStatus={webhookStatus.test}
              liveStatus={webhookStatus.live}
            />
          )}

          <DataPanel label="Memuat daftar Owner..." className={panel}>
            <div className="border-b border-gray-100 px-5 py-4 sm:px-6">
              <h2 className="text-[15px] font-semibold text-gray-900">Daftar Subscription &amp; Trial</h2>
              <p className="mt-0.5 text-xs text-gray-500">Klik nama Owner untuk melihat riwayat tagihan dan checkout.</p>
            </div>
          <FilterForm key={`${overview.environment}:${overview.search}:${overview.status}`} action={route}
            className="grid items-end gap-3 border-b border-gray-100 bg-gray-50/50 px-5 py-4 sm:grid-cols-2 sm:px-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,12rem)_minmax(0,10rem)_auto]">
            <label className={ui.label}>
              Cari Owner
              <input name="q" type="search" maxLength={120} defaultValue={overview.search} placeholder="Nama atau email" className={field} />
            </label>
            <label className={ui.label}>
              Status
              <select name="status" defaultValue={overview.status} className={field}>
                <option value="">Semua status</option>
                {Object.entries(billingFilters).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
            </label>
            <label className={ui.label}>
              Lingkungan
              <select name="environment" defaultValue={overview.environment} className={field}>
                <option value="live">Live</option>
                <option value="test">Test</option>
              </select>
            </label>
            <FilterSubmit className={ui.btnPrimary}>Terapkan</FilterSubmit>
          </FilterForm>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-gray-600">
                <thead className="bg-gray-50/70 text-[11px] uppercase text-gray-500 tracking-[0.08em] border-b border-gray-100">
                  <tr>{['Owner', 'Trial', 'Langganan', 'Paket', 'Periode berbayar', 'Tagihan berikutnya'].map(label =>
                    <th key={label} scope="col" className={`whitespace-nowrap ${ui.th}`}>{label}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {overview.owners.map(owner => (
                    <tr key={owner.owner_id} className="transition-colors hover:bg-blue-50/30">
                      <th scope="row" className="min-w-44 px-5 py-3.5 font-normal">
                        <Link href={`${route}/${owner.owner_id}?environment=${overview.environment}`} prefetch={false}
                          className="font-semibold text-gray-900 hover:text-blue-700">
                          {owner.name || owner.email || 'Owner'}
                        </Link>
                        {owner.name && owner.email && <p className="mt-0.5 break-all text-xs text-gray-500">{owner.email}</p>}
                        {owner.tester_status === 'active' && <Badge tone="sky" className="mt-1">Penguji s/d {billingDate(owner.tester_until)}</Badge>}
                      </th>
                      <td className="whitespace-nowrap px-5 py-3.5">
                        <Badge tone={owner.trial_status === 'active' ? 'gold' : owner.trial_status === 'scheduled' ? 'sky' : 'gray'}>{trialLabels[owner.trial_status]}</Badge>
                        {owner.trial_end && <p className="mt-0.5 text-xs text-gray-500">Berakhir {billingDate(owner.trial_end)}</p>}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3.5">
                        <Badge tone={owner.subscription_status === 'active' ? 'green' : owner.subscription_status === 'past_due' ? 'red' : owner.subscription_status === 'pending' ? 'amber' : 'gray'}>
                          {subscriptionLabels[owner.subscription_status]}
                        </Badge>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3.5">{owner.plan_name || '—'}</td>
                      <td className="whitespace-nowrap px-5 py-3.5">{owner.period_end
                        ? `${billingDate(owner.period_start)} – ${billingDate(owner.period_end)}` : '—'}</td>
                      <td className="whitespace-nowrap px-5 py-3.5">{billingDate(owner.next_billing_at)}</td>
                    </tr>
                  ))}
                  {!overview.owners.length && <tr><td colSpan={6}><EmptyState icon={UserRound} title="Tidak ada Owner" description="Tidak ada Owner pada hasil ini. Ubah kata kunci atau filter." /></td></tr>}
                </tbody>
              </table>
            </div>
            {(overview.page > 1 || overview.hasNext) && (
              <nav aria-label="Halaman subscription" className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 p-4 text-sm text-gray-600">
                <span>Halaman {overview.page}</span>
                <div className="flex gap-2">
                  {overview.page > 1 && <Link prefetch={false} href={paging(overview.page - 1, overview.environment, overview.search, overview.status)} className={pageButton}>Sebelumnya</Link>}
                  {overview.hasNext && <Link prefetch={false} href={paging(overview.page + 1, overview.environment, overview.search, overview.status)} className={pageButton}>Berikutnya</Link>}
                </div>
              </nav>
            )}
          </DataPanel>
        </>
      ) : <p role="alert" className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
        Data subscription dan trial belum berhasil dimuat. Muat ulang halaman untuk mencoba lagi.
      </p>}
    </div>
  )
}
