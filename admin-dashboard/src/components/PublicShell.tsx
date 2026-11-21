import type { ReactNode } from 'react'
import Link from 'next/link'
import { Coffee } from 'lucide-react'
import { companyInfo, PRODUCT_NAME } from '@/lib/legal'

/** Header & footer halaman publik (landing, syarat, privasi). */
export default function PublicShell({ children }: { children: ReactNode }) {
  const company = companyInfo()
  return (
    <div className="flex min-h-screen flex-col bg-white text-gray-900">
      <header className="sticky top-0 z-10 border-b border-gray-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/" className="flex items-center gap-2 font-bold">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white"><Coffee className="h-5 w-5" aria-hidden="true" /></span>
            {PRODUCT_NAME}
          </Link>
          <nav aria-label="Navigasi publik" className="flex items-center gap-1 text-sm sm:gap-3">
            <Link href="/#harga" className="hidden rounded-lg px-3 py-2 text-gray-600 hover:text-gray-900 sm:inline">Harga</Link>
            <a href="/kasir/" className="hidden rounded-lg px-3 py-2 text-gray-600 hover:text-gray-900 sm:inline">Aplikasi Kasir</a>
            <Link href="/login" className="rounded-lg px-3 py-2 font-medium text-gray-700 hover:bg-gray-50">Masuk</Link>
            <Link href="/register" className="rounded-lg bg-blue-600 px-3 py-2 font-semibold text-white hover:bg-blue-700">Coba Gratis</Link>
          </nav>
        </div>
      </header>
      <div className="flex-1">{children}</div>
      <footer className="border-t border-gray-100 bg-gray-50">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 text-sm text-gray-600 sm:grid-cols-3">
          <div>
            <p className="font-semibold text-gray-900">{PRODUCT_NAME}</p>
            <p className="mt-2">Aplikasi kasir dan laporan usaha untuk warung kopi, kafe, dan UMKM.</p>
          </div>
          <div>
            <p className="font-semibold text-gray-900">Layanan</p>
            <ul className="mt-2 space-y-1">
              <li><Link href="/terms" className="hover:underline">Syarat &amp; Ketentuan</Link></li>
              <li><Link href="/privacy" className="hover:underline">Kebijakan Privasi</Link></li>
              <li><a href="/kasir/" className="hover:underline">Aplikasi Kasir</a></li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-gray-900">Kontak</p>
            <ul className="mt-2 space-y-1">
              <li>{company.name}</li>
              {company.address && <li>{company.address}</li>}
              {company.email && <li><a href={`mailto:${company.email}`} className="hover:underline">{company.email}</a></li>}
              {company.whatsapp && <li><a href={`https://wa.me/${company.whatsapp}`} className="hover:underline">WhatsApp +{company.whatsapp}</a></li>}
            </ul>
          </div>
        </div>
        <p className="pb-8 text-center text-xs text-gray-400">© {new Date().getFullYear()} {company.name}. Pembayaran langganan diproses oleh Xendit.</p>
      </footer>
    </div>
  )
}
