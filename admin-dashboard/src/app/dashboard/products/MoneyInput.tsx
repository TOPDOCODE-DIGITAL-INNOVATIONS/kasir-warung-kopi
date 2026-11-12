'use client'

import { useLayoutEffect, useRef, useState, type ChangeEvent } from 'react'
import { formatRupiahInput, rupiahInputValue } from '@/lib/money'

export default function MoneyInput({ id, name, defaultValue, required, className, placeholder = '0' }: {
  id: string; name: string; defaultValue?: number | null; required?: boolean; className: string; placeholder?: string
}) {
  const [value, setValue] = useState(() => defaultValue == null ? '' : defaultValue.toLocaleString('id-ID', { maximumFractionDigits: 6 }))
  const ref = useRef<HTMLInputElement>(null)
  const caret = useRef<number | null>(null)
  const raw = rupiahInputValue(value)

  useLayoutEffect(() => {
    ref.current?.setCustomValidity(Number(raw) > 999_999_999 ? 'Nominal maksimal Rp 999.999.999.' : '')
    if (caret.current !== null) {
      ref.current?.setSelectionRange(caret.current, caret.current)
      caret.current = null
    }
  }, [raw, value])

  function change(event: ChangeEvent<HTMLInputElement>) {
    const node = event.currentTarget
    const next = formatRupiahInput(node.value)
    // Preserve the caret when editing a digit in the middle of a grouped amount.
    const digitsBefore = node.value.slice(0, node.selectionStart ?? node.value.length).replace(/[^\d,]/g, '').length
    let position = 0, count = 0
    while (position < next.length && count < digitsBefore) {
      if (/[\d,]/.test(next[position])) count++
      position++
    }
    if (next === value) {
      node.value = next
      node.setSelectionRange(position, position)
    } else {
      caret.current = position
      setValue(next)
    }
  }

  return <>
    <input type="hidden" name={name} value={raw} />
    <div className="relative">
      <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">Rp</span>
      <input ref={ref} id={id} type="text" inputMode="decimal" value={value} onChange={change}
        onBlur={() => { if (value.endsWith(',')) setValue(value.slice(0, -1)) }}
        required={required} placeholder={placeholder} className={`${className} pl-10`} />
    </div>
  </>
}
