'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'

export default function BusinessSelect({ businesses }: { businesses: { id: string; name: string }[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const value = params.get('b') ?? 'all'

  return (
    <select
      aria-label="Pilih cabang"
      value={value}
      onChange={(e) => {
        const next = new URLSearchParams(params)
        if (e.target.value === 'all') next.delete('b')
        else next.set('b', e.target.value)
        const qs = next.toString()
        router.push(qs ? `${pathname}?${qs}` : pathname)
      }}
      className="w-full bg-white border border-gray-300 text-gray-900 text-sm rounded-lg block p-2.5 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
