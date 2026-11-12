'use client'

import { useState } from 'react'
import Link from 'next/link'
import { maxOverviewEnd, overviewRangeError, type OverviewRange } from './overview-domain'

const input = 'w-full rounded-lg border border-gray-300 bg-white p-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500'

export default function OverviewFilters({ businesses, businessId, range, notice }: {
  businesses: { id: string; name: string }[]; businessId: string | null; range: OverviewRange; notice: string | null
}) {
  const [start, setStart] = useState(range.start), [end, setEnd] = useState(range.end)
  const [error, setError] = useState<string | null>(null)
  return (
    <section aria-labelledby="overview-filter-title" className="bg-white rounded-xl shadow-sm p-5 border border-gray-100">
      <h2 id="overview-filter-title" className="text-sm font-semibold text-gray-900">Filter</h2>
      <p className="mt-1 text-sm text-gray-500">Default 7 hari terakhir. Pilih rentang maksimal 3 bulan. Cabang di sini terpisah dari cabang aktif di header.</p>
      <form method="get" action="/dashboard" onSubmit={event => {
        const message = overviewRangeError(start, end)
        setError(message)
        if (message) event.preventDefault()
      }} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_auto] items-end">
        <label className="space-y-1 text-xs text-gray-500"><span>Cabang</span>
          <select name="b" defaultValue={businessId ?? 'all'} className={input}>
            <option value="all">Semua Cabang</option>
            {businesses.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-xs text-gray-500"><span>Tanggal mulai</span>
          <input name="from" type="date" required value={start} onChange={event => { setStart(event.target.value); setError(null) }} className={input} />
        </label>
        <label className="space-y-1 text-xs text-gray-500"><span>Tanggal akhir</span>
          <input name="to" type="date" required min={start} max={maxOverviewEnd(start) || undefined} value={end} onChange={event => { setEnd(event.target.value); setError(null) }} className={input} />
        </label>
        <div className="flex items-center gap-2">
          <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700">Terapkan</button>
          <Link href="/dashboard" className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50">Reset</Link>
        </div>
      </form>
      {(error || notice) && <p role="alert" className="mt-3 text-sm text-amber-700">{error || notice}</p>}
    </section>
  )
}
