'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { Menu, Store, X } from 'lucide-react'
import Nav from './Nav'
import BusinessContextSelect from './BusinessContextSelect'
import UserMenu from './UserMenu'

function Brand() {
  return <div className="flex h-16 shrink-0 items-center gap-3 border-b border-gray-100 px-5">
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-linear-to-br from-indigo-500 to-blue-500 text-white">
      <Store aria-hidden="true" className="h-5 w-5" />
    </span>
    <span className="text-lg font-bold tracking-tight text-gray-900">KasirKu Admin</span>
  </div>
}

export default function DashboardShell({ businesses, businessId, name, email, children }: {
  businesses: { id: string; name: string }[]; businessId: string | null
  name: string; email: string; children: ReactNode
}) {
  const drawer = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 768px)')
    const closeOnDesktop = () => { if (desktop.matches) drawer.current?.close() }
    desktop.addEventListener('change', closeOnDesktop)
    return () => desktop.removeEventListener('change', closeOnDesktop)
  }, [])

  return <div className="flex h-dvh w-full overflow-hidden bg-gray-50">
    <aside aria-label="Sidebar" className="hidden h-full w-64 shrink-0 flex-col overflow-hidden border-r border-gray-200 bg-linear-to-b from-white to-[#f8f9ff] md:flex">
      <Brand />
      <Nav />
    </aside>

    <dialog ref={drawer} aria-label="Menu navigasi" onClick={event => { if (event.target === event.currentTarget) drawer.current?.close() }}
      className="m-0 h-dvh max-h-none w-64 max-w-[calc(100vw-2rem)] border-0 border-r border-gray-200 bg-white p-0 text-gray-900 shadow-xl backdrop:bg-black/40 md:hidden">
      <div className="flex h-full flex-col bg-linear-to-b from-white to-[#f8f9ff]">
        <Brand />
        <div className="flex justify-end px-3 pt-3">
          <button type="button" aria-label="Tutup navigasi" onClick={() => drawer.current?.close()}
            className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>
        <Nav onNavigate={() => drawer.current?.close()} />
      </div>
    </dialog>

    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <header className="relative z-20 flex h-16 shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-4 md:px-8">
        <button type="button" aria-label="Buka navigasi" aria-haspopup="dialog" onClick={() => drawer.current?.showModal()}
          className="shrink-0 rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 md:hidden">
          <Menu aria-hidden="true" className="h-5 w-5" />
        </button>
        <div className="ml-auto flex min-w-0 items-center gap-3">
          <div className="w-40 min-w-0 sm:w-52"><BusinessContextSelect businesses={businesses} businessId={businessId} /></div>
          <UserMenu name={name} email={email} />
        </div>
      </header>
      {children}
    </div>
  </div>
}
