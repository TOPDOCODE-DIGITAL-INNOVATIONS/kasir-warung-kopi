'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useDataTransition } from '@/components/DataLoadingContext'
import type { PeriodOption } from '@/lib/report-period'

export default function PeriodSelect({ options, value }: { options: PeriodOption[]; value: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const { pending, startTransition } = useDataTransition()

  return (
    <select aria-busy={pending}
      value={value}
      disabled={pending}
      onChange={(e) => {
        const next = new URLSearchParams(params)
        next.set('p', e.target.value)
        startTransition(() => router.push(`${pathname}?${next}`, { scroll: false }))
      }}
      className="block rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 pr-9 text-sm font-medium text-gray-800 shadow-sm transition-colors hover:border-gray-300 focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-100"
      aria-label="Periode buku"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}
