import Link from 'next/link'
import { unstable_rethrow } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import PaymentHistory from '@/components/billing/PaymentHistory'
import { getOwnerBillingDetail } from '../actions'

export default async function OwnerPaymentHistoryPage() {
  let detail
  try {
    detail = await getOwnerBillingDetail()
  } catch (error) {
    unstable_rethrow(error)
  }

  return <div className="space-y-6">
    <div>
      <Link href="/dashboard/subscription" className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:underline">
        <ArrowLeft aria-hidden="true" className="h-4 w-4" /> Langganan &amp; Pembayaran
      </Link>
      <h1 className="text-2xl font-bold text-gray-900">Riwayat Pembayaran</h1>
    </div>
    {detail ? <PaymentHistory cycles={detail.cycles} checkouts={detail.checkouts} title="Pembayaran tercatat" />
      : <p role="alert" className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">Riwayat pembayaran belum berhasil dimuat. Muat ulang halaman untuk mencoba lagi.</p>}
  </div>
}
