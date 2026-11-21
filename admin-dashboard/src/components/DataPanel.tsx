'use client'

import type { ReactNode } from 'react'
import { useDataLoading } from './DataLoadingContext'
import LoadingSpinner from './LoadingSpinner'

/** Loading belongs to this panel; its height and existing data stay in place. */
export default function DataPanel({ children, className = '', loading, label = 'Memuat data...', compact = false }: {
  children: ReactNode; className?: string; loading?: boolean; label?: string; compact?: boolean
}) {
  const routePending = useDataLoading(), pending = loading ?? routePending
  return <div className={`relative ${className}`} aria-busy={pending} data-loading-panel="">
    <div inert={pending || undefined} className={pending ? 'pointer-events-none' : undefined}>{children}</div>
    {pending && <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[inherit] bg-white/60 p-3 text-sm text-blue-700 backdrop-blur-[1px] print:hidden">
      <LoadingSpinner label={label} showLabel={!compact} />
    </div>}
  </div>
}
