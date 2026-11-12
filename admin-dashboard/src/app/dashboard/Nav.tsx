'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Receipt, RefreshCw, Building2, Package, Wallet, History, DatabaseBackup, Users } from 'lucide-react'

const LINKS = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/dashboard/transactions', label: 'Transaksi', icon: Receipt },
  { href: '/dashboard/recap', label: 'Rekap Keuangan', icon: FileBarChart },
  { href: '/dashboard/expenses', label: 'Pengeluaran', icon: Wallet },
  { href: '/dashboard/history', label: 'Data Lama & Tutup Buku', icon: History },
  { href: '/dashboard/products', label: 'Produk', icon: Package },
  { href: '/dashboard/users', label: 'Kelola User', icon: Users },
  { href: '/dashboard/businesses', label: 'Cabang & Token', icon: Building2 },
  { href: '/dashboard/sync', label: 'Sinkronisasi', icon: RefreshCw },
  { href: '/dashboard/backup', label: 'Backup', icon: DatabaseBackup },
]

export default function Nav({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname()
  return (
    <nav className={mobile ? 'flex gap-1 overflow-x-auto px-4 pb-3' : 'flex-1 overflow-y-auto p-4 space-y-1'}>
      {LINKS.map(({ href, label, icon: Icon }) => {
        const active = href === '/dashboard' ? pathname === href : pathname.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            className={
              (mobile ? 'shrink-0 px-3 py-2 text-sm ' : 'px-4 py-3 ') +
              'flex items-center rounded-lg transition-colors ' +
              (active ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-600 hover:bg-gray-100')
            }
          >
            <Icon className={(mobile ? 'w-4 h-4 mr-2' : 'w-5 h-5 mr-3') + (active ? ' text-blue-600' : '')} />
            <span>{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
