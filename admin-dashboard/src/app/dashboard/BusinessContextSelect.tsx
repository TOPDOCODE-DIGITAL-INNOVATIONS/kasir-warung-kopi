'use client'

import Link from 'next/link'
import { useId, useState, useTransition } from 'react'
import { Building2, ChevronsUpDown, Loader2 } from 'lucide-react'
import { changeBusinessContext } from './context-actions'

export default function BusinessContextSelect({ businesses, businessId }: {
  businesses: { id: string; name: string }[]; businessId: string | null
}) {
  const id = useId()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')

  function change(value: string) {
    setError('')
    startTransition(async () => {
      try {
        const result = await changeBusinessContext(value)
        if (!result.success) setError(result.message)
      } catch { setError('Cabang belum berhasil diganti. Silakan coba lagi.') }
    })
  }

  return <div className="relative min-w-0" aria-busy={pending}>
    <label htmlFor={id} className="sr-only">Cabang aktif</label>
    <Building2 aria-hidden="true" className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
    {businesses.length ? <select id={id} value={businessId ?? ''} disabled={pending}
      title={businesses.find(b => b.id === businessId)?.name}
      aria-describedby={error ? `${id}-error` : undefined}
      onChange={event => change(event.target.value)}
      className="h-9 w-full min-w-0 appearance-none truncate rounded-lg border border-gray-200 bg-white pl-9 pr-8 text-sm font-medium text-gray-700 transition-colors hover:border-gray-300 hover:bg-gray-50 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:opacity-50">
      {businesses.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
    </select> : <Link href="/dashboard/businesses" className="flex h-9 items-center rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-sm font-medium text-blue-600 hover:bg-gray-50">Buat cabang</Link>}
    {businesses.length > 0 && (pending
      ? <Loader2 aria-label="Mengganti cabang" className="pointer-events-none absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-blue-600" />
      : <ChevronsUpDown aria-hidden="true" className="pointer-events-none absolute right-2.5 top-2.5 h-4 w-4 text-gray-400" />)}
    {error && <p id={`${id}-error`} role="alert" className="absolute right-0 top-[calc(100%+8px)] z-50 w-64 max-w-[calc(100vw-2rem)] rounded-lg border border-red-100 bg-white p-3 text-xs text-red-600 shadow-lg">{error}</p>}
  </div>
}
