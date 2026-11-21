'use client'

import { useState } from 'react'
import Link from '@/components/LoadingLink'
import InfoTip from '@/components/InfoTip'
import FilterForm, { FilterSubmit } from '@/components/FilterForm'
import { maxOverviewEnd, overviewRangeError, type OverviewRange } from './overview-domain'

const input = 'w-full rounded-xl border border-gray-200 bg-gray-50/60 px-3 py-2.5 text-sm text-gray-900 transition-colors hover:border-gray-300 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100'

export default function OverviewFilters({ businesses, businessId, range, notice }: {
  businesses: { id: string; name: string }[]; businessId: string | null; range: OverviewRange; notice: string | null
}) {
  const [start, setStart] = useState(range.start), [end, setEnd] = useState(range.end)
  const [error, setError] = useState<string | null>(null)
  return (
    <section aria-labelledby="overview-filter-title" className="rounded-2xl border border-gray-200/70 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-1.5">
        <h2 id="overview-filter-title" className="text-sm font-semibold text-gray-900">Filter periode &amp; cabang</h2>
        <InfoTip label="Filter" text="Default 7 hari terakhir. Pilih rentang maksimal 3 bulan. Cabang di sini terpisah dari cabang aktif di header." />
      </div>
      <p className="mt-0.5 text-xs text-gray-500">Maksimal 3 bulan · terpisah dari cabang aktif di header.</p>
      <FilterForm action="/dashboard" onSubmit={event => {
        const message = overviewRangeError(start, end)
        setError(message)
        if (message) event.preventDefault()
      }} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_auto] items-end">
        <label className="space-y-1 text-xs font-medium text-gray-500"><span>Cabang</span>
          <select name="b" defaultValue={businessId ?? 'all'} className={input}>
            <option value="all">Semua Cabang</option>
            {businesses.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-xs font-medium text-gray-500"><span>Tanggal mulai</span>
          <input name="from" type="date" required value={start} onChange={event => { setStart(event.target.value); setError(null) }} className={input} />
        </label>
        <label className="space-y-1 text-xs font-medium text-gray-500"><span>Tanggal akhir</span>
          <input name="to" type="date" required min={start} max={maxOverviewEnd(start) || undefined} value={end} onChange={event => { setEnd(event.target.value); setError(null) }} className={input} />
        </label>
        <div className="flex items-center gap-2">
          <FilterSubmit className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700">Terapkan</FilterSubmit>
          <Link href="/dashboard" className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50">Reset</Link>
        </div>
      </FilterForm>
      {(error || notice) && <p role="alert" className="mt-3 text-sm text-amber-700">{error || notice}</p>}
    </section>
  )
}
