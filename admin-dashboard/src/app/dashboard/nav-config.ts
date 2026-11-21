import {
  LayoutDashboard, Receipt, RefreshCw, Building2, Package, Wallet, History, DatabaseBackup, Users,
  FileBarChart, PiggyBank, Truck, CreditCard, BadgeCheck, type LucideIcon,
} from 'lucide-react'

export type NavItem = { href: string; label: string; description: string; icon: LucideIcon }
export type NavGroup = { id: string; label: string; items: NavItem[] }

export const OWNER_NAV: NavGroup[] = [
  { id: 'ringkasan', label: 'Ringkasan', items: [
    { href: '/dashboard', label: 'Overview', icon: LayoutDashboard, description: 'Ringkasan penjualan, pemasukan, pengeluaran, dan produk terlaris.' },
  ] },
  { id: 'keuangan', label: 'Penjualan & Keuangan', items: [
    { href: '/dashboard/transactions', label: 'Transaksi', icon: Receipt, description: 'Daftar transaksi kasir yang sudah tersinkron. Klik untuk melihat detail pesanan.' },
    { href: '/dashboard/recap', label: 'Rekap Keuangan', icon: FileBarChart, description: 'Laporan pemasukan dan pengeluaran per periode, siap dicetak.' },
    { href: '/dashboard/expenses', label: 'Pengeluaran', icon: Wallet, description: 'Catat belanja bahan dan biaya operasional dari admin maupun kasir.' },
    { href: '/dashboard/capital', label: 'Modal & Balik Modal', icon: PiggyBank, description: 'Pantau modal yang ditanam dan perkembangan balik modal.' },
    { href: '/dashboard/history', label: 'Data Lama & Tutup Buku', icon: History, description: 'Masukkan rekap periode sebelum memakai kasir dan atur aturan tutup buku.' },
  ] },
  { id: 'inventori', label: 'Produk & Inventori', items: [
    { href: '/dashboard/products', label: 'Produk', icon: Package, description: 'Kelola barang jual, bahan beli, harga, dan stok setiap cabang.' },
    { href: '/dashboard/suppliers', label: 'Supplier', icon: Truck, description: 'Data supplier dan riwayat pembelian dari semua cabang.' },
  ] },
  { id: 'usaha', label: 'Usaha & Tim', items: [
    { href: '/dashboard/businesses', label: 'Cabang & Token', icon: Building2, description: 'Kelola cabang usaha dan token sync untuk aplikasi kasir.' },
    { href: '/dashboard/users', label: 'Kelola User', icon: Users, description: 'Profil dan hak akses kasir pada setiap cabang.' },
  ] },
  { id: 'sistem', label: 'Sistem & Akun', items: [
    { href: '/dashboard/sync', label: 'Sinkronisasi', icon: RefreshCw, description: 'Status koneksi aplikasi kasir offline dengan database.' },
    { href: '/dashboard/backup', label: 'Backup', icon: DatabaseBackup, description: 'Unduh data cabang aktif untuk arsip.' },
    { href: '/dashboard/billing', label: 'Langganan', icon: BadgeCheck, description: 'Status paket, masa aktif, dan pembayaran langganan KasirKu.' },
  ] },
]

export const PLATFORM_NAV: NavGroup[] = [
  { id: 'ringkasan', label: 'Ringkasan', items: [
    { href: '/platform', label: 'Overview', icon: LayoutDashboard, description: 'Ringkasan akun Owner, cabang, dan status langganan platform.' },
  ] },
  { id: 'pelanggan', label: 'Pelanggan', items: [
    { href: '/platform/owners', label: 'Kelola Owner', icon: Users, description: 'Lihat akun Owner dan atur status administrasinya.' },
  ] },
  { id: 'monetisasi', label: 'Monetisasi', items: [
    { href: '/platform/subscriptions', label: 'Subscription & Trial', icon: CreditCard, description: 'Pantau trial, paket, harga, dan periode penagihan Owner.' },
  ] },
]

export const SIDEBAR_COOKIE = 'kasirku_sidebar'

const ROOTS = new Set(['/dashboard', '/platform'])

export function isActive(pathname: string, href: string) {
  return pathname === href || (!ROOTS.has(href) && pathname.startsWith(href + '/'))
}

export function findCurrent(groups: NavGroup[], pathname: string) {
  for (const group of groups) {
    const item = group.items.find(entry => isActive(pathname, entry.href))
    if (item) return { group, item }
  }
  return null
}
