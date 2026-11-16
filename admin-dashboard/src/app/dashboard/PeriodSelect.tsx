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
      className="bg-white border border-gray-300 text-gray-900 text-sm rounded-lg block p-2.5 shadow-sm"
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
