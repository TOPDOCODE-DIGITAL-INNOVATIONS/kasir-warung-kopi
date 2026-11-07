import Link from 'next/link'
import { Coffee, LayoutDashboard, MonitorSmartphone } from 'lucide-react'

export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 text-center">
        <div className="mx-auto mb-6 w-16 h-16 bg-[#3E2723] rounded-2xl flex items-center justify-center">
          <Coffee className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-2xl font-bold mb-1">RUAS KOPI BALI</h1>
        <p className="text-gray-500 mb-8">Setiap Langkah, Satu Rasa — Pilih aplikasi yang ingin dibuka.</p>
        <div className="space-y-3">
          {/* <a> biasa: /kasir/ adalah PWA statis, bukan route Next.js */}
          <a
            href="/kasir/"
            className="flex items-center justify-center gap-2 w-full py-3 rounded-lg bg-[#3E2723] text-white font-semibold hover:bg-[#2C1B18]"
          >
            <MonitorSmartphone className="w-5 h-5" /> Buka Aplikasi Kasir
          </a>
          <Link
            href="/dashboard"
            className="flex items-center justify-center gap-2 w-full py-3 rounded-lg border border-gray-300 font-semibold hover:bg-gray-50"
          >
            <LayoutDashboard className="w-5 h-5" /> Dashboard Owner
          </Link>
        </div>
      </div>
    </main>
  )
}
