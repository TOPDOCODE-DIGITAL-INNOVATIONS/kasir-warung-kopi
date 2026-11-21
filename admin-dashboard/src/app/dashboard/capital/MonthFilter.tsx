'use client'

import FilterForm, { FilterSubmit } from '@/components/FilterForm'
import LoadingLink from '@/components/LoadingLink'
import { filterBar, ui } from '@/components/ui'



export type MonthOption = { value: string; label: string }
export type Preset = { label: string; from: string; to: string }

export default function MonthFilter({ months, from, to, presets }: { months: MonthOption[]; from: string; to: string; presets: Preset[] }) {
  const href = (f: string, t: string) => `/dashboard/capital?${new URLSearchParams({ from: f, to: t })}`
  return (
    <section aria-labelledby="capital-filter-title" className={`${filterBar} print:hidden`}>
      <h2 id="capital-filter-title" className="text-[15px] font-semibold text-gray-900">Filter Bulan</h2>
      <FilterForm action="/dashboard/capital" className="mt-3 grid grid-cols-1 items-end gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <label className={ui.label}>
          Dari bulan
          <select name="from" defaultValue={from} className={ui.input}>
            <option value="">Awal usaha</option>
            {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </label>
        <label className={ui.label}>
          Sampai bulan
          <select name="to" defaultValue={to} className={ui.input}>
            <option value="">Sekarang</option>
            {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </label>
        <FilterSubmit className={ui.btnPrimary}>Terapkan</FilterSubmit>
      </FilterForm>
      <div className="mt-4 flex flex-wrap gap-2 border-t border-gray-100 pt-4">
        {presets.map((p) => {
          const active = p.from === from && p.to === to
          return (
            <LoadingLink key={p.label} href={href(p.from, p.to)}
              aria-current={active ? 'true' : undefined} className={ui.chip(active)}>
              {p.label}
            </LoadingLink>
          )
        })}
      </div>
    </section>
  )
}
