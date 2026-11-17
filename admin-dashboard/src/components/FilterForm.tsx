'use client'

import { createContext, useContext, type ComponentProps } from 'react'
import { useRouter } from 'next/navigation'
import LoadingSpinner from './LoadingSpinner'
import { useDataTransition } from './DataLoadingContext'

const FilterPending = createContext(false)

export default function FilterForm({ action, children, onSubmit, ...props }: Omit<ComponentProps<'form'>, 'action'> & { action: string }) {
  const router = useRouter(), { pending, startTransition } = useDataTransition()
  return <form {...props} action={action} method="get" aria-busy={pending} onSubmit={event => {
    onSubmit?.(event)
    if (event.defaultPrevented) return
    event.preventDefault()
    const query = new URLSearchParams()
    new FormData(event.currentTarget).forEach((value, key) => { if (typeof value === 'string') query.append(key, value) })
    startTransition(() => router.push(`${action}?${query}`, { scroll: false }))
  }}><FilterPending.Provider value={pending}>{children}</FilterPending.Provider></form>
}

export function FilterSubmit({ children, disabled, className = '', ...props }: ComponentProps<'button'>) {
  const pending = useContext(FilterPending)
  return <button {...props} type="submit" disabled={disabled || pending} aria-busy={pending} className={`inline-flex items-center justify-center gap-2 disabled:opacity-50 ${className}`}>
    {pending && <LoadingSpinner label="Memuat hasil filter..." />}{children}
  </button>
}
