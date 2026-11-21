import type { Metadata } from 'next'
import Link from 'next/link'
import { BarChart3, Boxes, CheckCircle2, Printer, Store, Users, WifiOff, Wallet } from 'lucide-react'
import PublicShell from '@/components/PublicShell'
import { createAdminClient } from '@/utils/supabase/admin'
import { FALLBACK_PLANS, PRODUCT_NAME } from '@/lib/legal'
import { rupiah } from '@/lib/format'
import { GRACE_DAYS, TRIAL_DAYS } from '../../../shared/billing-access'

export const metadata: Metadata = {
  title: `${PRODUCT_NAME} · Aplikasi Kasir & Laporan Usaha`,
  description: `Kasir offline, laporan penjualan, stok, dan pengeluaran untuk banyak cabang. Coba gratis ${TRIAL_DAYS} hari.`,
}

// Harga dibaca ulang paling lama tiap 5 menit agar perubahan harga oleh Super Admin tampil.
export const revalidate = 300

type Plan = { code: string; name: string; amount: number; interval_months: number }

async function plans(): Promise<Plan[]> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return [...FALLBACK_PLANS]
  try {
    const { data, error } = await createAdminClient().rpc('public_billing_plans')
    return !error && Array.isArray(data) && data.length ? (data as Plan[]) : [...FALLBACK_PLANS]
  } catch {
    return [...FALLBACK_PLANS]
  }
}

const FEATURES = [
  { icon: WifiOff, title: 'Tetap jalan saat offline', text: 'Kasir bisa dipasang di HP/tablet dan mencatat transaksi tanpa internet. Data terkirim otomatis begitu online.' },
  { icon: Store, title: 'Banyak cabang, satu akun', text: 'Pantau semua cabang dari satu dashboard. Tambah cabang dan perangkat kasir tanpa biaya tambahan.' },
  { icon: BarChart3, title: 'Laporan siap pakai', text: 'Omzet harian, produk terlaris, metode bayar, rekap keuangan, sampai hitungan balik modal.' },
  { icon: Boxes, title: 'Stok & pembelian', text: 'Stok berkurang otomatis saat terjual, catat pembelian per supplier, dan stock opname.' },
  { icon: Wallet, title: 'Shift & kas laci', text: 'Buka-tutup shift dengan modal awal, pengeluaran dari laci, dan selisih kas yang jelas.' },
  { icon: Users, title: 'Hak akses kasir', text: 'Kasir, Supervisor, dan Owner dengan PIN masing-masing. Pembatalan & koreksi tercatat.' },
  { icon: Printer, title: 'Struk thermal', text: 'Cetak ke printer Bluetooth 58/80mm, bon/hutang pelanggan, QRIS, transfer, dan e-wallet.' },
]

const FAQ = [
  { q: 'Apakah perlu kartu kredit untuk mencoba?', a: `Tidak. Daftar dengan email atau Google, masa coba ${TRIAL_DAYS} hari langsung aktif.` },
  { q: 'Apa yang terjadi bila langganan berakhir?', a: `Anda punya ${GRACE_DAYS} hari toleransi. Setelah itu dashboard hanya-baca dan kasir tidak bisa membuat transaksi baru. Data tidak dihapus dan langsung bisa dipakai lagi setelah membayar.` },
  { q: 'Apakah harga dihitung per cabang?', a: 'Tidak. Satu langganan berlaku untuk semua cabang dan perangkat kasir milik Anda.' },
  { q: 'Bagaimana cara berhenti berlangganan?', a: 'Hentikan perpanjangan otomatis dari menu Langganan kapan saja. Akses tetap berlaku sampai akhir periode yang sudah dibayar.' },
]

export default async function Home() {
  const list = await plans()
  const monthly = list.find(p => p.interval_months === 1)
  return (
    <PublicShell>
      <section className="bg-gradient-to-b from-blue-50 to-white">
        <div className="mx-auto max-w-6xl px-4 py-16 text-center sm:py-24">
          <p className="mx-auto inline-flex rounded-full bg-white px-3 py-1 text-xs font-semibold text-blue-700 ring-1 ring-blue-200">Gratis {TRIAL_DAYS} hari · tanpa kartu kredit</p>
          <h1 className="mx-auto mt-5 max-w-3xl text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl">Kasir dan laporan usaha dalam satu aplikasi</h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-gray-600">Catat setiap transaksi, modal, pengeluaran, dan stok di semua cabang. Tetap jalan meski internet putus.</p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/register" className="rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white shadow-sm hover:bg-blue-700">Mulai Gratis</Link>
            <Link href="/login" className="rounded-xl border border-gray-300 bg-white px-6 py-3 font-semibold text-gray-800 hover:bg-gray-50">Masuk ke Dashboard</Link>
          </div>
          {monthly && <p className="mt-4 text-sm text-gray-500">Setelah trial mulai {rupiah(monthly.amount)} per bulan untuk semua cabang.</p>}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16" aria-labelledby="fitur">
        <h2 id="fitur" className="text-center text-2xl font-bold text-gray-900 sm:text-3xl">Semua yang dibutuhkan usaha Anda</h2>
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-2xl border border-gray-100 p-5 shadow-sm">
              <Icon className="h-6 w-6 text-blue-600" aria-hidden="true" />
              <h3 className="mt-3 font-semibold text-gray-900">{title}</h3>
              <p className="mt-1 text-sm text-gray-600">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="harga" className="bg-gray-50" aria-labelledby="harga-title">
        <div className="mx-auto max-w-4xl px-4 py-16">
          <h2 id="harga-title" className="text-center text-2xl font-bold text-gray-900 sm:text-3xl">Harga sederhana</h2>
          <p className="mt-2 text-center text-gray-600">Satu harga untuk semua cabang. Hentikan kapan saja.</p>
          <div className="mt-10 grid gap-6 sm:grid-cols-2">
            {list.map(plan => {
              const saving = monthly && plan.interval_months > 1 ? monthly.amount * plan.interval_months - plan.amount : 0
              return (
                <div key={plan.code} className={`rounded-2xl bg-white p-6 shadow-sm ring-1 ${saving > 0 ? 'ring-blue-500' : 'ring-gray-200'}`}>
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">{plan.name}</h3>
                    {saving > 0 && <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">Hemat {rupiah(saving)}</span>}
                  </div>
                  <p className="mt-4 text-4xl font-extrabold">{rupiah(plan.amount)}<span className="text-base font-normal text-gray-500"> / {plan.interval_months === 1 ? 'bulan' : 'tahun'}</span></p>
                  <ul className="mt-6 space-y-2 text-sm text-gray-600">
                    {['Cabang & perangkat kasir tanpa batas', 'Semua fitur kasir & laporan', 'Backup data kapan saja', `Coba gratis ${TRIAL_DAYS} hari dulu`].map(f => (
                      <li key={f} className="flex gap-2"><CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" aria-hidden="true" />{f}</li>
                    ))}
                  </ul>
                  <Link href="/register" className="mt-6 block rounded-xl bg-blue-600 px-4 py-3 text-center font-semibold text-white hover:bg-blue-700">Coba Gratis</Link>
                </div>
              )
            })}
          </div>
          <p className="mt-4 text-center text-xs text-gray-500">Harga dalam Rupiah. Pembayaran aman melalui Xendit.</p>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-16" aria-labelledby="faq">
        <h2 id="faq" className="text-center text-2xl font-bold text-gray-900">Pertanyaan umum</h2>
        <dl className="mt-8 space-y-4">
          {FAQ.map(({ q, a }) => (
            <div key={q} className="rounded-xl border border-gray-100 p-5">
              <dt className="font-semibold text-gray-900">{q}</dt>
              <dd className="mt-1 text-sm text-gray-600">{a}</dd>
            </div>
          ))}
        </dl>
      </section>
    </PublicShell>
  )
}
