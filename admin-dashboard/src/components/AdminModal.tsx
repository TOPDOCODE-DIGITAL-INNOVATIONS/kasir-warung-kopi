'use client'

import { useEffect, useId, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

export default function AdminModal({ title, description, pending, onClose, children, wide = false }: {
  title: string; description: string; pending: boolean; onClose: () => void; children: ReactNode; wide?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null), id = useId()
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close() }, [])
  return <dialog ref={ref} aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}
    onCancel={event => { event.preventDefault(); if (!pending) onClose() }}
    className={`m-auto w-[calc(100%_-_2rem)] ${wide ? 'max-w-5xl' : 'max-w-xl'} max-h-[90dvh] overflow-hidden rounded-xl border border-gray-100 bg-white p-0 text-gray-900 shadow-xl backdrop:bg-black/40`}>
    <div className="flex max-h-[90dvh] flex-col">
      <div className="flex shrink-0 items-start justify-between gap-4 border-b border-gray-100 p-5">
        <div><h2 id={`${id}-title`} className="text-lg font-semibold">{title}</h2><p id={`${id}-description`} className="mt-1 text-sm text-gray-500">{description}</p></div>
        <button type="button" aria-label="Tutup dialog" disabled={pending} onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 disabled:opacity-50"><X className="h-5 w-5" /></button>
      </div>
      <div className="min-h-0 overflow-y-auto">{children}</div>
    </div>
  </dialog>
}
