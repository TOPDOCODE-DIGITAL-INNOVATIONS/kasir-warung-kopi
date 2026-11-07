'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'

export default function BusinessSelect({ businesses }: { businesses: { id: string; name: string }[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const value = params.get('b') ?? 'all'

  if (businesses.length < 2) return null

  return (
    <select
      value={value}
      onChange={(e) => {
        const next = new URLSearchParams(params)
        if (e.target.value === 'all') next.delete('b')
        else next.set('b', e.target.value)
        const qs = next.toString()
        router.push(qs ? `${pathname}?${qs}` : pathname)
      }}
      className="bg-white border border-gray-300 text-gray-900 text-sm rounded-lg block p-2.5 shadow-sm"
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
