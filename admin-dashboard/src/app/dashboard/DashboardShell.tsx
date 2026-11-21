'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronRight, Coffee, Info, Menu, PanelLeftClose, PanelLeftOpen, ShieldCheck, X } from 'lucide-react'
import Nav from './Nav'
import BusinessContextSelect from './BusinessContextSelect'
import UserMenu from './UserMenu'
import Tooltip from '@/components/Tooltip'
import { DataLoadingProvider } from '@/components/DataLoadingContext'
import { OWNER_NAV, PLATFORM_NAV, SIDEBAR_COOKIE, findCurrent } from './nav-config'
import type { Access } from '../../../../shared/billing-access'

function Brand({ platform, collapsed = false }: { platform: boolean; collapsed?: boolean }) {
  const Icon = platform ? ShieldCheck : Coffee
  return <Link href={platform ? '/platform' : '/dashboard'} aria-label="KasirKu, ke Overview"
    className={`flex h-[72px] shrink-0 items-center gap-3 focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-champagne ${collapsed ? 'justify-center px-2' : 'px-5'}`}>
    <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-[#e6cf9c] via-champagne to-[#a88340] text-espresso-900 shadow-[0_6px_18px_-6px_rgb(217_191_136/0.55)]">
      <Icon aria-hidden="true" className="h-5 w-5" strokeWidth={2.2} />
    </span>
    {!collapsed && <span className="min-w-0 leading-tight">
      <span className="block font-display text-[19px] font-semibold tracking-tight text-white">KasirKu</span>
      <span className="block text-[10.5px] font-semibold uppercase tracking-[0.18em] text-champagne/80">{platform ? 'Platform Admin' : 'Owner Suite'}</span>
    </span>}
  </Link>
}

function accessBadge(access: Access) {
  if (access.readOnly) return { urgent: true, label: 'Hanya-baca', dot: 'bg-red-400', detail: 'Langganan berakhir. Data hanya bisa dilihat sampai Anda berlangganan lagi.' }
  if (access.paymentIssue) return { urgent: true, label: 'Perlu pembayaran', dot: 'bg-amber-400', detail: 'Tagihan perpanjangan gagal. Perbarui pembayaran di menu Langganan.' }
  if (access.state === 'grace') return { urgent: true, label: `Tenggang · ${access.daysLeft} hari`, dot: 'bg-amber-400', detail: 'Masa aktif sudah lewat. Perpanjang sebelum masa tenggang habis.' }
  if (access.state === 'trial') return { label: `Masa coba · ${access.daysLeft} hari`, dot: 'bg-sky-400', detail: 'Sisa masa coba gratis sebelum perlu berlangganan.' }
  if (access.state === 'none') return { label: 'Belum aktif', dot: 'bg-gray-400', detail: 'Belum ada masa coba atau langganan aktif.' }
  return { label: access.endsAt ? `Aktif · ${access.daysLeft} hari` : 'Aktif', dot: 'bg-emerald-400', detail: access.endsAt ? 'Sisa hari periode langganan berjalan.' : 'Akses akun aktif.' }
}

function SidebarFooter({ platform, access, collapsed, onToggle }: {
  platform: boolean; access?: Access; collapsed: boolean; onToggle?: () => void
}) {
  const badge = access ? accessBadge(access) : null
  const endDate = access?.endsAt ? new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(new Date(access.endsAt)) : null
  return <div className={`shrink-0 space-y-2 border-t border-white/6 ${collapsed ? 'p-2.5' : 'p-3'}`}>
    {platform
      ? <Tooltip side="right" className="block" content="Anda masuk sebagai Super Admin. Perubahan berlaku untuk seluruh platform.">
          <div className={`flex items-center gap-2.5 rounded-xl bg-white/4 text-xs text-gray-300 ring-1 ring-white/6 ${collapsed ? 'h-11 justify-center' : 'px-3 py-2.5'}`}>
            <ShieldCheck aria-hidden="true" className="h-4 w-4 shrink-0 text-champagne" />
            <span className={collapsed ? 'sr-only' : 'font-medium'}>Mode Super Admin</span>
          </div>
        </Tooltip>
      : badge && <Tooltip side="right" className="block" content={<><span className="block font-semibold text-white">{badge.label}</span><span className="mt-0.5 block">{badge.detail}{endDate && ` Berakhir ${endDate}.`}</span></>}>
          <Link href="/dashboard/billing" className={`flex items-center gap-2.5 rounded-xl bg-white/4 text-xs text-gray-300 ring-1 ring-white/6 transition-colors hover:bg-white/8 focus-visible:outline-2 focus-visible:outline-champagne ${collapsed ? 'h-11 justify-center' : 'px-3 py-2.5'}`}>
            <span aria-hidden="true" className="relative flex h-2 w-2 shrink-0">{'urgent' in badge && <span className={`absolute inset-0 animate-ping rounded-full opacity-50 ${badge.dot}`} />}<span className={`relative h-2 w-2 rounded-full ${badge.dot}`} /></span>
            <span className={collapsed ? 'sr-only' : 'min-w-0'}>
              <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-500">Langganan</span>
              <span className="block truncate font-medium text-gray-100">{badge.label}</span>
            </span>
          </Link>
        </Tooltip>}
    {onToggle && <Tooltip side="right" className="block" content={collapsed ? 'Lebarkan sidebar' : 'Ciutkan sidebar menjadi ikon'}>
      <button type="button" onClick={onToggle} aria-label={collapsed ? 'Lebarkan sidebar' : 'Ciutkan sidebar'}
        className={`flex w-full items-center gap-2.5 rounded-xl text-xs font-medium text-gray-500 transition-colors hover:bg-white/5 hover:text-gray-200 focus-visible:outline-2 focus-visible:outline-champagne ${collapsed ? 'h-10 justify-center' : 'px-3 py-2'}`}>
        {collapsed ? <PanelLeftOpen aria-hidden="true" className="h-[18px] w-[18px]" /> : <PanelLeftClose aria-hidden="true" className="h-[18px] w-[18px]" />}
        {!collapsed && <span>Ciutkan menu</span>}
      </button>
    </Tooltip>}
  </div>
}

function PageTrail({ platform }: { platform: boolean }) {
  const pathname = usePathname()
  const current = findCurrent(platform ? PLATFORM_NAV : OWNER_NAV, pathname)
  if (!current) return <span className="truncate text-sm font-semibold text-gray-900">KasirKu</span>
  const { group, item } = current
  const Icon = item.icon
  return <div className="flex min-w-0 items-center gap-2.5">
    <span aria-hidden="true" className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 ring-1 ring-blue-100 sm:flex"><Icon className="h-[18px] w-[18px]" /></span>
    <div className="min-w-0 leading-tight">
      <p className="hidden items-center gap-1 text-[11px] font-medium uppercase tracking-[0.12em] text-gray-400 sm:flex">
        {group.label}<ChevronRight aria-hidden="true" className="h-3 w-3" />
      </p>
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="truncate text-sm font-semibold text-gray-900 sm:text-[15px]">{item.label}</span>
        <Tooltip side="bottom" content={item.description}>
          <button type="button" aria-label={`Tentang halaman ${item.label}: ${item.description}`}
            className="flex h-6 w-6 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-2 focus-visible:outline-blue-600">
            <Info aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        </Tooltip>
      </div>
    </div>
  </div>
}

type DashboardShellProps = {
  name: string; email: string; roleLabel: string; children: ReactNode; initialCollapsed?: boolean
} & ({ platform: true } | { platform?: false; businesses: { id: string; name: string }[]; businessId: string | null; access: Access })

export default function DashboardShell(props: DashboardShellProps) {
  const { name, email, roleLabel, children, platform = false, initialCollapsed = false } = props
  const access = props.platform ? undefined : props.access
  const drawer = useRef<HTMLDialogElement>(null)
  const [collapsed, setCollapsed] = useState(initialCollapsed)

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 768px)')
    const closeOnDesktop = () => { if (desktop.matches) drawer.current?.close() }
    desktop.addEventListener('change', closeOnDesktop)
    return () => desktop.removeEventListener('change', closeOnDesktop)
  }, [])

  function toggleSidebar() {
    setCollapsed(value => {
      const next = !value
      document.cookie = `${SIDEBAR_COOKIE}=${next ? 'collapsed' : 'expanded'}; path=/; max-age=31536000; samesite=lax`
      return next
    })
  }

  // Keep focus/keyboard scroll inside the content on mobile. Unlike hidden,
  // clip does not let these shell containers scroll the header out of view.
  return <DataLoadingProvider><div className="fixed inset-0 flex min-h-0 w-full overflow-clip bg-canvas md:relative md:inset-auto md:h-dvh print:static print:block print:h-auto print:overflow-visible print:bg-white">
    <aside aria-label="Sidebar" className={`relative hidden h-full shrink-0 flex-col overflow-hidden bg-espresso-900 transition-[width] duration-300 ease-out md:flex print:hidden ${collapsed ? 'w-[76px]' : 'w-[264px]'}`}>
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-[radial-gradient(120%_80%_at_0%_0%,rgb(217_191_136/0.14),transparent_70%)]" />
      <Brand platform={platform} collapsed={collapsed} />
      <Nav platform={platform} collapsed={collapsed} />
      <SidebarFooter platform={platform} access={access} collapsed={collapsed} onToggle={toggleSidebar} />
    </aside>

    <dialog ref={drawer} aria-label="Menu navigasi" onClick={event => { if (event.target === event.currentTarget) drawer.current?.close() }}
      className="m-0 h-dvh max-h-none w-[280px] max-w-[calc(100vw-2rem)] border-0 bg-espresso-900 p-0 text-gray-100 shadow-xl backdrop:bg-espresso-900/50 md:hidden print:hidden">
      <div className="relative flex h-full flex-col">
        <div className="flex items-center justify-between pr-3">
          <Brand platform={platform} />
          <button type="button" aria-label="Tutup navigasi" onClick={() => drawer.current?.close()}
            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-2 focus-visible:outline-champagne">
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>
        <Nav platform={platform} onNavigate={() => drawer.current?.close()} />
        <SidebarFooter platform={platform} access={access} collapsed={false} />
      </div>
    </dialog>

    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-clip print:block print:overflow-visible">
      <header className="sticky top-0 z-30 flex h-[72px] shrink-0 items-center gap-3 border-b border-gray-200/70 bg-canvas/85 px-4 backdrop-blur-md md:px-8 print:hidden">
        <button type="button" aria-label="Buka navigasi" aria-haspopup="dialog" onClick={() => drawer.current?.showModal()}
          className="shrink-0 rounded-lg p-2 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 md:hidden">
          <Menu aria-hidden="true" className="h-5 w-5" />
        </button>
        <PageTrail platform={platform} />
        <div className="ml-auto flex min-w-0 items-center gap-3">
          {!props.platform && <Tooltip side="bottom" className="block w-36 min-w-0 sm:w-56" content="Cabang aktif menentukan data yang tampil dan diubah di sebagian besar halaman.">
            <BusinessContextSelect businesses={props.businesses} businessId={props.businessId} />
          </Tooltip>}
          <UserMenu name={name} email={email} roleLabel={roleLabel} />
        </div>
      </header>
      {children}
    </div>
  </div></DataLoadingProvider>
}
