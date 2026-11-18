'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import LoadingSpinner from '@/components/LoadingSpinner'
import { searchExpenseProducts } from './actions'
import type { ExpenseProduct, ExpenseProductSearch as SearchResult } from './types'

const input = 'w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50'
const selectionMessage = 'Pilih produk dari hasil pencarian atau pilih Lain-lain.'

export default function ExpenseProductSearch({ businessId, value, excludedIds, disabled, onSelect }: {
  businessId: string; value: ExpenseProduct | null; excludedIds: string[]; disabled: boolean
  onSelect: (product: ExpenseProduct | null, fallbackName?: string) => void
}) {
  const id = useId(), field = useRef<HTMLInputElement>(null), revision = useRef(0)
  const [text, setText] = useState(value?.name ?? ''), [committed, setCommitted] = useState(value?.name ?? '')
  const [open, setOpen] = useState(false), [active, setActive] = useState(-1)
  const [cache, setCache] = useState<Record<string, SearchResult>>({}), [attempt, setAttempt] = useState(0)
  const key = JSON.stringify([businessId, text.trim()]), result = cache[key]
  const loading = open && !disabled && !result
  const choices: (ExpenseProduct | null)[] = [null, ...(result?.products ?? [])]

  useEffect(() => {
    if (!open || disabled || result) return
    let current = true
    const version = revision.current
    const timer = setTimeout(() => {
      searchExpenseProducts(businessId, text.trim()).then(data => {
        if (current && revision.current === version) setCache(previous => ({ ...Object.fromEntries(Object.entries(previous).slice(-9)), [key]: data }))
      }).catch(() => {
        if (current && revision.current === version) setCache(previous => ({ ...previous, [key]: { products: [], hasMore: false, error: 'Produk belum berhasil dimuat. Silakan coba kembali.' } }))
      })
    }, 350)
    return () => { current = false; clearTimeout(timer) }
  }, [businessId, text, open, disabled, result, key, attempt])

  function choose(product: ExpenseProduct | null) {
    if (disabled || (product && excludedIds.includes(product.id))) return
    revision.current++
    const name = product?.name ?? 'Lain-lain'
    setText(name); setCommitted(name); field.current?.setCustomValidity('')
    const fallbackName = !product && text.trim() !== committed && text.trim().toLocaleLowerCase('id') !== 'lain-lain'
      ? text.trim() : undefined
    onSelect(product, fallbackName); field.current?.focus(); setOpen(false); setActive(-1)
  }

  function move(direction: 1 | -1) {
    setOpen(true)
    let next = active < 0 ? (direction === 1 ? -1 : 0) : active
    for (let i = 0; i < choices.length; i++) {
      next = (next + direction + choices.length) % choices.length
      if (!choices[next] || !excludedIds.includes(choices[next]!.id)) break
    }
    setActive(next)
    requestAnimationFrame(() => document.getElementById(`${id}-option-${next}`)?.scrollIntoView({ block: 'nearest' }))
  }

  return <div className="relative space-y-2" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) { revision.current++; setOpen(false); setActive(-1) }
  }}>
    <label htmlFor={id} className="text-sm text-gray-700">Produk / Lain-lain</label>
    <div className="relative">
      <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-gray-400" />
      <input ref={field} id={id} type="text" role="combobox" autoComplete="off" maxLength={200} value={text} disabled={disabled}
        aria-expanded={open} aria-controls={open ? `${id}-list` : undefined} aria-autocomplete="list" aria-activedescendant={open && active >= 0 && active < choices.length ? `${id}-option-${active}` : undefined}
        placeholder="Cari produk atau pilih Lain-lain" className={input}
        onFocus={() => setOpen(true)} onChange={event => {
          revision.current++
          const text = event.target.value
          setText(text); setActive(-1); setOpen(true)
          event.currentTarget.setCustomValidity(text === committed ? '' : selectionMessage)
        }} onKeyDown={event => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); move(event.key === 'ArrowDown' ? 1 : -1) }
          else if (event.key === 'Enter' && open) { event.preventDefault(); if (active >= 0 && active < choices.length) choose(choices[active]) }
          else if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); revision.current++; setOpen(false); setActive(-1) }
        }} />
    </div>
    {open && !disabled && <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
      <div id={`${id}-list`} role="listbox" aria-label="Pilihan produk pengeluaran" aria-busy={loading}>
        {choices.map((product, index) => {
          const blocked = !!product && excludedIds.includes(product.id)
          return <button key={product?.id ?? 'other'} id={`${id}-option-${index}`} type="button" role="option" tabIndex={-1}
            aria-selected={product ? product.id === value?.id : !value} disabled={blocked}
            onMouseDown={event => event.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => choose(product)}
            className={`block w-full px-3 py-2 text-left text-sm disabled:cursor-not-allowed disabled:text-gray-400 ${active === index ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'}`}>
            <span className="block break-words">{product?.name ?? 'Lain-lain'}</span>{blocked && <span className="block text-xs">Sudah dipilih di item lain</span>}
          </button>
        })}
      </div>
      {loading && <div role="status" className="px-3 py-2 text-xs text-gray-500"><LoadingSpinner label="Mencari produk..." showLabel /></div>}
      {result?.error && <div role="alert" className="space-y-2 px-3 py-2 text-xs text-red-600"><p>{result.error}</p><button type="button" onMouseDown={event => event.preventDefault()} onClick={() => { setCache(previous => { const next = { ...previous }; delete next[key]; return next }); setAttempt(v => v + 1) }} className="font-medium text-blue-600">Coba Lagi</button></div>}
      {result && !result.error && !result.products.length && <p role="status" className="px-3 py-2 text-xs text-gray-500">Produk tidak ditemukan. Coba nama lain atau pilih Lain-lain.</p>}
      {result?.hasMore && <p className="border-t border-gray-100 px-3 py-2 text-xs text-gray-500">Ada hasil lainnya. Ketik nama yang lebih spesifik.</p>}
    </div>}
  </div>
}
