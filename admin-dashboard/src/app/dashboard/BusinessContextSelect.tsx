'use client'

import Link from 'next/link'
import { useId, useState, useTransition } from 'react'
import { Building2, Loader2 } from 'lucide-react'
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

  return <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3" aria-busy={pending}>
    <label htmlFor={id} className="mb-2 flex items-center gap-2 text-xs font-semibold text-gray-600">
      <Building2 className="h-4 w-4 text-blue-600" /> Cabang aktif
      {pending && <Loader2 aria-label="Mengganti cabang" className="ml-auto h-3.5 w-3.5 animate-spin" />}
    </label>
    {businesses.length ? <select id={id} value={businessId ?? ''} disabled={pending}
      onChange={event => change(event.target.value)}
      className="w-full rounded-lg border border-gray-300 bg-white p-2 text-sm font-medium text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50">
      {businesses.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
    </select> : <Link href="/dashboard/businesses" className="text-sm font-semibold text-blue-600 hover:underline">Buat cabang pertama</Link>}
    {error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
  </div>
}
