'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

export default function ProductDialog({ title, description, pending, onClose, children, footer, wide = false }: {
  title: string; description: string; pending: boolean; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean | 'history'
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => { const d = ref.current; d?.showModal(); return () => d?.close() }, [])
  return <dialog ref={ref} aria-labelledby="product-dialog-title" aria-describedby="product-dialog-description"
    onCancel={e => { e.preventDefault(); if (!pending) onClose() }}
    className={`m-auto w-[calc(100%_-_2rem)] ${wide === 'history' ? 'max-w-3xl' : wide ? 'max-w-2xl' : 'max-w-lg'} max-h-[90dvh] overflow-hidden rounded-xl border border-gray-100 bg-white p-0 text-gray-900 shadow-xl backdrop:bg-black/40`}>
    <div className="flex max-h-[calc(90dvh-2px)] flex-col overflow-hidden">
    <div className="flex shrink-0 items-start justify-between gap-4 border-b border-gray-100 p-5">
      <div><h2 id="product-dialog-title" className="text-lg font-semibold">{title}</h2><p id="product-dialog-description" className="mt-1 text-sm text-gray-500">{description}</p></div>
      <button type="button" aria-label="Tutup dialog" disabled={pending} onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 disabled:opacity-50"><X className="h-5 w-5" /></button>
    </div><div className="min-h-0 overflow-y-auto overscroll-contain rounded-b-xl">{children}</div>
    {footer && <div className="shrink-0 border-t border-gray-100 bg-white p-5">{footer}</div>}
    </div>
  </dialog>
}
