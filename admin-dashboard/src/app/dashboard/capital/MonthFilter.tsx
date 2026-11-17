'use client'

import FilterForm, { FilterSubmit } from '@/components/FilterForm'
import LoadingLink from '@/components/LoadingLink'

const input = 'w-full rounded-lg border border-gray-300 bg-white p-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500'

export type MonthOption = { value: string; label: string }
export type Preset = { label: string; from: string; to: string }

export default function MonthFilter({ months, from, to, presets }: { months: MonthOption[]; from: string; to: string; presets: Preset[] }) {
  const href = (f: string, t: string) => `/dashboard/capital?${new URLSearchParams({ from: f, to: t })}`
  return (
    <section aria-labelledby="capital-filter-title" className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm print:hidden">
      <h2 id="capital-filter-title" className="text-sm font-semibold text-gray-900">Filter Bulan</h2>
      <FilterForm action="/dashboard/capital" className="mt-3 grid grid-cols-1 items-end gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <label className="space-y-1 text-xs text-gray-500">
          <span>Dari bulan</span>
          <select name="from" defaultValue={from} className={input}>
            <option value="">Awal usaha</option>
            {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-xs text-gray-500">
          <span>Sampai bulan</span>
          <select name="to" defaultValue={to} className={input}>
            <option value="">Sekarang</option>
            {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </label>
        <FilterSubmit className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700">Terapkan</FilterSubmit>
      </FilterForm>
      <div className="mt-3 flex flex-wrap gap-2">
        {presets.map((p) => {
          const active = p.from === from && p.to === to
          return (
            <LoadingLink key={p.label} href={href(p.from, p.to)}
              className={'rounded-full border px-3 py-1 text-xs font-medium ' + (active ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50')}>
              {p.label}
            </LoadingLink>
          )
        })}
      </div>
    </section>
  )
}
