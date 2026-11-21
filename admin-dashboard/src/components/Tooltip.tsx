'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

type Side = 'right' | 'top' | 'bottom'
type Position = { left: number; top: number; transform: string }

const HALF_WIDTH = 136 // setengah max-w-64 + jarak tepi layar

/**
 * Tooltip ringan berposisi `fixed` agar tidak terpotong container yang scroll/overflow.
 * Muncul saat hover atau fokus keyboard. Isinya bersifat tambahan: teks penting tetap
 * harus tersedia untuk pembaca layar di elemen pemicunya (label / sr-only).
 */
export default function Tooltip({ content, side = 'top', delay = 120, disabled = false, className = '', children }: {
  content: ReactNode; side?: Side; delay?: number; disabled?: boolean; className?: string; children: ReactNode
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [position, setPosition] = useState<Position | null>(null)

  const clear = () => { if (timer.current) clearTimeout(timer.current); timer.current = null }
  const hide = () => { clear(); setPosition(null) }
  const show = () => {
    if (disabled) return
    clear()
    timer.current = setTimeout(() => {
      const box = ref.current?.getBoundingClientRect()
      if (!box) return
      const width = window.innerWidth
      const centerX = Math.min(Math.max(box.left + box.width / 2, HALF_WIDTH), width - HALF_WIDTH)
      if (side === 'right' && box.right + 280 < width) {
        setPosition({ left: box.right + 12, top: box.top + box.height / 2, transform: 'translateY(-50%)' })
      } else if (side === 'bottom' || box.top < 80) {
        setPosition({ left: centerX, top: box.bottom + 8, transform: 'translateX(-50%)' })
      } else {
        setPosition({ left: centerX, top: box.top - 8, transform: 'translate(-50%, -100%)' })
      }
    }, delay)
  }

  useEffect(() => {
    if (!position) return
    const close = () => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = null
      setPosition(null)
    }
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => { window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close) }
  }, [position])
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  return <span ref={ref} className={className} onPointerEnter={show} onPointerLeave={hide} onFocus={show} onBlur={hide}
    onKeyDown={event => { if (event.key === 'Escape') hide() }} onPointerDown={hide}>
    {children}
    {position && <span aria-hidden="true" style={{ position: 'fixed', ...position }}
      className="pointer-events-none z-[1000] block w-max max-w-64">
      <span className="block animate-tooltip-in rounded-xl border border-white/10 bg-espresso-900/95 px-3 py-2 text-left text-xs leading-relaxed font-normal text-gray-200 shadow-xl backdrop-blur">
        {content}
      </span>
    </span>}
  </span>
}
