'use client'

import { useId } from 'react'
import { ChevronsUpDown, Server } from 'lucide-react'
import type { BillingEnvironment } from '@/lib/platform-billing/config'

const options = [
  { value: 'test', label: 'Test' },
  { value: 'live', label: 'Live' },
] as const

export default function PlatformModeSelect({ mode, otherDashboard }: {
  mode: BillingEnvironment
  otherDashboard: string | null
}) {
  const id = useId()

  return <div className="relative w-28 min-w-0 sm:w-52">
    <label htmlFor={id} className="sr-only">Mode platform</label>
    <Server aria-hidden="true" className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
    <select id={id} value={mode}
      onChange={event => {
        if (otherDashboard && event.target.value !== mode) window.location.assign(otherDashboard)
      }}
      className="h-9 w-full min-w-0 appearance-none truncate rounded-lg border border-gray-200 bg-white pl-9 pr-8 text-sm font-medium text-gray-700 transition-colors hover:border-gray-300 hover:bg-gray-50 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100">
      {options.map(option => {
        const unavailable = option.value !== mode && !otherDashboard
        return <option key={option.value} value={option.value} disabled={unavailable}>
          {unavailable ? `${option.label} (URL belum diatur)` : option.label}
        </option>
      })}
    </select>
    <ChevronsUpDown aria-hidden="true" className="pointer-events-none absolute right-2.5 top-2.5 h-4 w-4 text-gray-400" />
  </div>
}
