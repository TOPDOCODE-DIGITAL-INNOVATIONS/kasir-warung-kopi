'use client'

import { useEffect, useRef } from 'react'
import { LogOut } from 'lucide-react'

export default function UserMenu({ name, email }: { name: string; email: string }) {
  const ref = useRef<HTMLDetailsElement>(null)
  const trigger = useRef<HTMLElement>(null)
  const initials = name.split(/\s+/).slice(0, 2).map(part => Array.from(part)[0]).join('').toLocaleUpperCase('id-ID')
  const avatar = 'flex shrink-0 items-center justify-center rounded-full bg-linear-to-br from-indigo-500 to-blue-500 font-bold tracking-wide text-white'

  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) ref.current.open = false
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && ref.current?.open) {
        ref.current.open = false
        trigger.current?.focus()
      }
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [])

  return <details ref={ref} className="relative shrink-0" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false
  }}>
    <summary ref={trigger} aria-label={`Menu akun ${name}`} title={name}
      className={`${avatar} h-9 w-9 cursor-pointer list-none text-xs transition-shadow hover:ring-2 hover:ring-blue-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 [&::-webkit-details-marker]:hidden`}>
      {initials}
    </summary>
    <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-64 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
      <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-3">
        <span aria-hidden="true" className={`${avatar} h-10 w-10 text-sm`}>{initials}</span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-800" title={name}>{name}</p>
          <p className="truncate text-xs text-gray-400" title={email}>{email}</p>
          <p className="mt-1 text-xs text-gray-500">Owner</p>
        </div>
      </div>
      <form action="/auth/signout" method="post" className="p-1.5">
        <button type="submit" className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-blue-600">
          <LogOut aria-hidden="true" className="h-[18px] w-[18px]" /> Keluar
        </button>
      </form>
    </div>
  </details>
}
