'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useDataTransition } from '@/components/DataLoadingContext'

export default function BusinessSelect({ businesses }: { businesses: { id: string; name: string }[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const value = params.get('b') ?? 'all'
  const { pending, startTransition } = useDataTransition()

  return (
    <select aria-busy={pending}
      disabled={pending}
      aria-label="Pilih cabang"
      value={value}
      onChange={(e) => {
        const next = new URLSearchParams(params)
        if (e.target.value === 'all') next.delete('b')
        else next.set('b', e.target.value)
        const qs = next.toString()
        startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false }))
      }}
      className="rounded-xl border border-gray-200 bg-gray-50/60 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition-colors hover:border-gray-300 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100 w-full block"
    >
      <option value="all">Semua Cabang</option>
      {businesses.map((b) => (
        <option key={b.id} value={b.id}>
          {b.name}
        </option>
      ))}
    </select>
  )
}
