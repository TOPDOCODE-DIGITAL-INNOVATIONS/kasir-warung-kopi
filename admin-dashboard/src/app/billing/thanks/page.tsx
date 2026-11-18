import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Pembayaran Langganan · KasirKu',
  robots: { index: false, follow: false },
}

// Halaman publik tujuan kembali dari checkout Xendit. Tidak menyatakan lunas:
// status pembayaran hanya diverifikasi server dari webhook / rekonsiliasi Xendit.
export default async function BillingThanksPage({ searchParams }: {
  searchParams: Promise<{ status?: string }>
}) {
  const cancelled = (await searchParams).status === 'cancelled'

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-gray-100 bg-white p-8 text-center shadow-sm">
        <div className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full ${cancelled ? 'bg-amber-50 text-amber-600' : 'bg-green-50 text-green-600'}`}>
          <span aria-hidden="true" className="text-2xl">{cancelled ? '!' : '✓'}</span>
        </div>
        <h1 className="mt-5 text-xl font-bold text-gray-900">
          {cancelled ? 'Pembayaran belum selesai' : 'Terima kasih!'}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">
          {cancelled
            ? 'Anda keluar dari halaman pembayaran sebelum selesai. Tidak ada tagihan yang diproses. Hubungi admin KasirKu bila ingin mendapatkan tautan pembayaran lagi.'
            : 'Pembayaran langganan KasirKu Anda sedang kami verifikasi bersama Xendit. Status langganan diperbarui otomatis dalam beberapa menit. Halaman ini boleh ditutup.'}
        </p>
      </div>
    </main>
  )
}
