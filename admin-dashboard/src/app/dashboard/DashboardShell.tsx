'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { Menu, ShieldCheck, Store, X } from 'lucide-react'
import Nav from './Nav'
import BusinessContextSelect from './BusinessContextSelect'
import UserMenu from './UserMenu'
import { DataLoadingProvider } from '@/components/DataLoadingContext'

function Brand({ platform }: { platform: boolean }) {
  const Icon = platform ? ShieldCheck : Store
  return <div className="flex h-16 shrink-0 items-center gap-3 border-b border-gray-100 px-5">
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-linear-to-br from-indigo-500 to-blue-500 text-white">
      <Icon aria-hidden="true" className="h-5 w-5" />
    </span>
    <span className="text-lg font-bold tracking-tight text-gray-900">{platform ? 'KasirKu Platform' : 'KasirKu Admin'}</span>
  </div>
}

type DashboardShellProps = {
  name: string; email: string; roleLabel: string; children: ReactNode
} & ({ platform: true } | { platform?: false; businesses: { id: string; name: string }[]; businessId: string | null })

export default function DashboardShell(props: DashboardShellProps) {
  const { name, email, roleLabel, children, platform = false } = props
  const drawer = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 768px)')
    const closeOnDesktop = () => { if (desktop.matches) drawer.current?.close() }
    desktop.addEventListener('change', closeOnDesktop)
    return () => desktop.removeEventListener('change', closeOnDesktop)
  }, [])

  // Keep focus/keyboard scroll inside the content on mobile. Unlike hidden,
  // clip does not let these shell containers scroll the header out of view.
  return <DataLoadingProvider><div className="fixed inset-0 flex min-h-0 w-full overflow-clip bg-gray-50 md:relative md:inset-auto md:h-dvh print:static print:block print:h-auto print:overflow-visible">
    <aside aria-label="Sidebar" className="print:hidden hidden h-full w-64 shrink-0 flex-col overflow-hidden border-r border-gray-200 bg-linear-to-b from-white to-[#f8f9ff] md:flex">
      <Brand platform={platform} />
      <Nav platform={platform} />
    </aside>

    <dialog ref={drawer} aria-label="Menu navigasi" onClick={event => { if (event.target === event.currentTarget) drawer.current?.close() }}
      className="m-0 h-dvh max-h-none w-64 max-w-[calc(100vw-2rem)] border-0 border-r border-gray-200 bg-white p-0 text-gray-900 shadow-xl backdrop:bg-black/40 md:hidden print:hidden">
      <div className="flex h-full flex-col bg-linear-to-b from-white to-[#f8f9ff]">
        <Brand platform={platform} />
        <div className="flex justify-end px-3 pt-3">
          <button type="button" aria-label="Tutup navigasi" onClick={() => drawer.current?.close()}
            className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>
        <Nav platform={platform} onNavigate={() => drawer.current?.close()} />
      </div>
    </dialog>

    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-clip print:block print:overflow-visible">
      <header className="print:hidden sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-4 md:px-8">
        <button type="button" aria-label="Buka navigasi" aria-haspopup="dialog" onClick={() => drawer.current?.showModal()}
          className="shrink-0 rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 md:hidden">
          <Menu aria-hidden="true" className="h-5 w-5" />
        </button>
        {platform && <span className="truncate text-sm font-semibold text-gray-900 md:hidden">KasirKu Platform</span>}
        <div className="ml-auto flex min-w-0 items-center gap-3">
          {!props.platform && <div className="w-40 min-w-0 sm:w-52"><BusinessContextSelect businesses={props.businesses} businessId={props.businessId} /></div>}
          <UserMenu name={name} email={email} roleLabel={roleLabel} />
        </div>
      </header>
      {children}
    </div>
  </div></DataLoadingProvider>
}
