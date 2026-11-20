import Link from 'next/link'
import { unstable_rethrow } from 'next/navigation'
import { CalendarClock, CircleAlert, CreditCard, UserRound } from 'lucide-react'
import DataPanel from '@/components/DataPanel'
import FilterForm, { FilterSubmit } from '@/components/FilterForm'
import { rupiah } from '@/lib/format'
import { billingUnavailableMessage } from '@/lib/platform-billing/db'
import { getBillingOverview } from './actions'
import { billingDate, subscriptionLabels, trialLabels } from './display'
import { billingFilters } from './types'
import PlanPriceForm from './PlanPriceForm'

const route = '/platform/subscriptions'
const field = 'mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
const panel = 'overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm'
const pageButton = 'rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50'

const cards = [
  { key: 'trial_active', Icon: CalendarClock, tone: 'bg-amber-50 text-amber-700' },
  { key: 'subscription_active', Icon: CreditCard, tone: 'bg-green-50 text-green-600' },
  { key: 'past_due', Icon: CircleAlert, tone: 'bg-red-50 text-red-600' },
  { key: 'not_started', Icon: UserRound, tone: 'bg-gray-100 text-gray-500' },
] as const

export default async function SubscriptionsPage({ searchParams }: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>
}) {
  let overview
  try {
    overview = await getBillingOverview(await searchParams)
  } catch (error) {
    unstable_rethrow(error)
  }

  const paging = (page: number, search: string, status: string) =>
    `${route}?${new URLSearchParams({ page: String(page), q: search, status })}`

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Subscription &amp; Trial</h1>
        <p className="mt-1 text-sm text-gray-500">Pantau trial, paket, dan periode penagihan akun Owner.</p>
      </div>
      {overview ? (
        <>
          <FilterForm key={`${overview.search}:${overview.status}`} action={route}
            className="grid items-end gap-3 rounded-xl border border-gray-100 bg-white p-4 shadow-sm sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,12rem)_auto]">
            <label className="text-sm font-medium text-gray-700">
              Cari Owner
              <input name="q" type="search" maxLength={120} defaultValue={overview.search} placeholder="Nama atau email" className={field} />
            </label>
            <label className="text-sm font-medium text-gray-700">
              Status
              <select name="status" defaultValue={overview.status} className={field}>
                <option value="">Semua status</option>
                {Object.entries(billingFilters).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
            </label>
            <FilterSubmit className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700">Terapkan</FilterSubmit>
          </FilterForm>

          <DataPanel label="Memuat ringkasan billing..." compact className="rounded-xl">
            <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {cards.map(({ key, Icon, tone }) => (
                <div key={key} className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
                  <div>
                    <dt className="text-sm font-medium text-gray-500">{billingFilters[key]}</dt>
                    <dd className="mt-1 text-2xl font-bold tabular-nums text-gray-900">{overview.summary[key].toLocaleString('id-ID')}</dd>
                  </div>
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${tone}`}>
                    <Icon aria-hidden="true" className="h-5 w-5" />
                  </div>
                </div>
              ))}
            </dl>
          </DataPanel>

          <section aria-labelledby="subscription-plans" className={panel}>
            <h2 id="subscription-plans" className="border-b border-gray-100 px-5 py-4 font-semibold text-gray-900">Paket langganan</h2>
            {overview.plans.length ? (
              <ul className="grid gap-4 p-5 sm:grid-cols-2">
                {overview.plans.map(plan => (
                  <li key={plan.code} className="rounded-lg border border-gray-200 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-gray-900">{plan.name}</h3>
                      <span className="rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600">
                        {plan.status === 'active' ? 'Aktif' : 'Draf'}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-gray-600">
                      {plan.amount == null ? 'Harga belum ditentukan' : `${rupiah(plan.amount)} / ${plan.code === 'monthly' ? 'bulan' : 'tahun'}`}
                    </p>
                    <PlanPriceForm code={plan.code} amount={plan.amount} />
                  </li>
                ))}
              </ul>
            ) : <p className="px-5 py-4 text-sm text-gray-500">Belum ada paket langganan.</p>}
          </section>

          <DataPanel label="Memuat daftar Owner..." className={panel}>
            <h2 className="border-b border-gray-100 px-5 py-4 font-semibold text-gray-900">Daftar Subscription &amp; Trial</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-gray-600">
                <thead className="bg-gray-50 text-xs uppercase text-gray-700">
                  <tr>{['Owner', 'Trial', 'Langganan', 'Paket', 'Periode berbayar', 'Perpanjang sebelum'].map(label =>
                    <th key={label} scope="col" className="whitespace-nowrap px-4 py-3">{label}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {overview.owners.map(owner => (
                    <tr key={owner.owner_id} className="hover:bg-gray-50">
                      <th scope="row" className="min-w-44 px-4 py-3 font-normal">
                        <Link href={`${route}/${owner.owner_id}`} prefetch={false}
                          className="font-semibold text-blue-600 hover:underline">
                          {owner.name || owner.email || 'Owner'}
                        </Link>
                        {owner.name && owner.email && <p className="mt-0.5 break-all">{owner.email}</p>}
                      </th>
                      <td className="whitespace-nowrap px-4 py-3">
                        <p className={owner.trial_status === 'active' ? 'font-medium text-amber-700' : undefined}>{trialLabels[owner.trial_status]}</p>
                        {owner.trial_end && <p className="mt-0.5 text-xs text-gray-500">Berakhir {billingDate(owner.trial_end)}</p>}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span className={owner.subscription_status === 'active' ? 'font-medium text-green-700'
                          : owner.subscription_status === 'past_due' ? 'font-medium text-red-700' : undefined}>
                          {subscriptionLabels[owner.subscription_status]}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">{owner.plan_name || '—'}</td>
                      <td className="whitespace-nowrap px-4 py-3">{owner.period_end
                        ? `${billingDate(owner.period_start)} – ${billingDate(owner.period_end)}` : '—'}</td>
                      <td className="whitespace-nowrap px-4 py-3">{billingDate(owner.next_billing_at ?? owner.period_end)}</td>
                    </tr>
                  ))}
                  {!overview.owners.length && <tr><td colSpan={6} className="p-8 text-center text-gray-500">Tidak ada Owner pada hasil ini.</td></tr>}
                </tbody>
              </table>
            </div>
            {(overview.page > 1 || overview.hasNext) && (
              <nav aria-label="Halaman subscription" className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 p-4 text-sm text-gray-600">
                <span>Halaman {overview.page}</span>
                <div className="flex gap-2">
                  {overview.page > 1 && <Link prefetch={false} href={paging(overview.page - 1, overview.search, overview.status)} className={pageButton}>Sebelumnya</Link>}
                  {overview.hasNext && <Link prefetch={false} href={paging(overview.page + 1, overview.search, overview.status)} className={pageButton}>Berikutnya</Link>}
                </div>
              </nav>
            )}
          </DataPanel>
        </>
      ) : <p role="alert" className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
          {billingUnavailableMessage}
      </p>}
    </div>
  )
}
