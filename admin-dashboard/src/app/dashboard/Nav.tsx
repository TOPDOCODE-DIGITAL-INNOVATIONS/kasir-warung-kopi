'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useMemo, useSyncExternalStore } from 'react'
import { ChevronDown } from 'lucide-react'
import Tooltip from '@/components/Tooltip'
import { OWNER_NAV, PLATFORM_NAV, isActive } from './nav-config'

const STORAGE_KEY = 'kasirku.nav.closed-groups'

const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
const snapshot = () => { try { return localStorage.getItem(STORAGE_KEY) ?? '[]' } catch { return '[]' } }

function parseClosed(raw: string): string[] {
  try {
    const value: unknown = JSON.parse(raw)
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
  } catch { return [] }
}

export default function Nav({ onNavigate, platform = false, collapsed = false }: {
  onNavigate?: () => void; platform?: boolean; collapsed?: boolean
}) {
  const pathname = usePathname()
  const groups = platform ? PLATFORM_NAV : OWNER_NAV
  const raw = useSyncExternalStore(subscribe, snapshot, () => '[]')
  const closed = useMemo(() => parseClosed(raw), [raw])

  function toggle(id: string) {
    const next = closed.includes(id) ? closed.filter(v => v !== id) : [...closed, id]
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch { /* penyimpanan tidak tersedia */ }
    listeners.forEach(listener => listener())
  }

  return (
    <nav aria-label="Navigasi utama" className={`min-h-0 flex-1 overflow-y-auto overflow-x-hidden py-4 [scrollbar-width:thin] ${collapsed ? 'px-2.5' : 'px-3'}`}>
      {groups.map((group, index) => {
        const hasActive = group.items.some(item => isActive(pathname, item.href))
        const single = group.items.length === 1
        const open = collapsed || single || hasActive || !closed.includes(group.id)
        const listId = `nav-group-${group.id}`
        return (
          <section key={group.id} aria-label={group.label} className={index ? 'mt-4' : ''}>
            {collapsed
              ? index > 0 && <div aria-hidden="true" className="mx-2 mb-4 h-px bg-white/8" />
              : single
                ? <p className="mb-1.5 px-3 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-gray-500">{group.label}</p>
                : <button type="button" onClick={() => toggle(group.id)} aria-expanded={open} aria-controls={listId} disabled={hasActive}
                    className="group mb-1.5 flex w-full items-center justify-between rounded-md px-3 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-gray-500 transition-colors hover:text-gray-300 focus-visible:outline-2 focus-visible:outline-champagne disabled:cursor-default disabled:hover:text-gray-500">
                    <span>{group.label}</span>
                    {!hasActive && <ChevronDown aria-hidden="true" className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? '' : '-rotate-90'}`} />}
                  </button>}
            <ul id={listId} hidden={!open} className="space-y-0.5">
              {group.items.map(({ href, label, description, icon: Icon }) => {
                const active = isActive(pathname, href)
                return (
                  <li key={href}>
                    <Tooltip side="right" delay={collapsed ? 60 : 450} className="block" content={
                      <><span className="block font-semibold text-white">{label}</span><span className="mt-0.5 block text-gray-300">{description}</span></>
                    }>
                      <Link href={href} onClick={onNavigate} aria-current={active ? 'page' : undefined}
                        className={`relative flex items-center rounded-xl text-[13.5px] font-medium transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-champagne ${
                          collapsed ? 'h-11 justify-center' : 'gap-3 px-3 py-2.5'
                        } ${active
                          ? 'bg-linear-to-r from-champagne/18 to-champagne/4 text-white shadow-[inset_0_0_0_1px_rgb(217_191_136/0.18)]'
                          : 'text-gray-400 hover:bg-white/5 hover:text-gray-100'}`}>
                        {active && <span aria-hidden="true" className={`absolute top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-champagne ${collapsed ? '-left-2.5' : '-left-3'}`} />}
                        <Icon aria-hidden="true" strokeWidth={active ? 2.1 : 1.8} className={`h-[18px] w-[18px] shrink-0 ${active ? 'text-champagne' : ''}`} />
                        <span className={collapsed ? 'sr-only' : 'truncate'}>{label}</span>
                        <span className="sr-only">. {description}</span>
                      </Link>
                    </Tooltip>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </nav>
  )
}
