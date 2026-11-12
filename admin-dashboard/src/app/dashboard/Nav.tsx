'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Receipt, RefreshCw, Building2, Package, Wallet, History, DatabaseBackup, Users } from 'lucide-react'

const LINKS = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/dashboard/transactions', label: 'Transaksi', icon: Receipt },
  { href: '/dashboard/expenses', label: 'Pengeluaran', icon: Wallet },
  { href: '/dashboard/history', label: 'Data Lama & Rekap', icon: History },
  { href: '/dashboard/products', label: 'Produk', icon: Package },
  { href: '/dashboard/users', label: 'Kelola User', icon: Users },
  { href: '/dashboard/businesses', label: 'Cabang & Token', icon: Building2 },
  { href: '/dashboard/sync', label: 'Sinkronisasi', icon: RefreshCw },
  { href: '/dashboard/backup', label: 'Backup', icon: DatabaseBackup },
]

export default function Nav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()
  return (
    <nav aria-label="Navigasi utama" className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
      <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">Menu utama</p>
      <ul className="space-y-0.5">
        {LINKS.map(({ href, label, icon: Icon }) => {
          const active = href === '/dashboard' ? pathname === href : pathname.startsWith(href)
          return (
            <li key={href}>
              <Link href={href} onClick={onNavigate} aria-current={active ? 'page' : undefined}
                className={
                  'relative flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm font-medium transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-blue-600 ' +
                  (active ? "bg-blue-50 font-semibold text-blue-700 before:absolute before:left-0 before:top-1/2 before:h-5 before:w-[3px] before:-translate-y-1/2 before:rounded-r-sm before:bg-blue-600 before:content-['']" : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800')
                }>
                <Icon aria-hidden="true" className={'h-5 w-5 shrink-0 ' + (active ? 'text-blue-600' : 'text-gray-400')} />
                <span>{label}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
