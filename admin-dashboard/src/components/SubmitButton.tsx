'use client'

import { useFormStatus } from 'react-dom'
import type { ComponentProps, ReactNode } from 'react'
import LoadingSpinner from './LoadingSpinner'

export default function SubmitButton({ pending = false, pendingLabel, children, disabled, className = '', ...props }: ComponentProps<'button'> & { pending?: boolean; pendingLabel?: ReactNode }) {
  const status = useFormStatus(), busy = pending || status.pending
  return <button {...props} type="submit" disabled={disabled || busy} aria-busy={busy} className={`inline-flex items-center justify-center gap-2 disabled:opacity-50 ${className}`}>
    {busy && <LoadingSpinner label="Memproses permintaan..." />}{busy && pendingLabel ? pendingLabel : children}
  </button>
}
