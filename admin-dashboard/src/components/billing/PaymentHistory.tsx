import { rupiah } from '@/lib/format'
import { billingDate, billingPeriod } from '@/app/platform/subscriptions/display'
import type { BillingOwnerDetail } from '@/app/platform/subscriptions/types'

const panel = 'overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm'
const tableHead = 'whitespace-nowrap px-4 py-3'
const tableCell = 'whitespace-nowrap px-4 py-3 text-gray-600'

const checkoutLabels: Record<string, string> = {
  creating: 'Dibuat', open: 'Menunggu pembayaran', completed: 'Selesai',
  expired: 'Kedaluwarsa', cancelled: 'Dibatalkan', failed: 'Gagal',
}
const cycleLabels: Record<string, string> = {
  scheduled: 'Terjadwal', pending: 'Dalam proses', retrying: 'Dicoba ulang',
  failed: 'Gagal', succeeded: 'Dibayar', cancelled: 'Dibatalkan',
}

export default function PaymentHistory({ cycles, checkouts, title = 'Riwayat Pembayaran' }: Pick<BillingOwnerDetail, 'cycles' | 'checkouts'> & { title?: string }) {
  return (
    <>
      <section className={panel} aria-labelledby="billing-cycles">
        <h2 id="billing-cycles" className="border-b border-gray-100 px-5 py-4 font-semibold text-gray-900">{title} <span className="ml-2 text-xs font-normal text-gray-500">25 terbaru</span></h2>
        <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-700">
                <tr>{['Paket', 'Periode yang dibayar', 'Nominal', 'Status', 'Dibayar', 'Referensi pembayaran'].map(label => <th key={label} scope="col" className={tableHead}>{label}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {cycles.map(cycle => <tr key={cycle.id}>
                  <th scope="row" className={`${tableCell} font-medium text-gray-900`}>{cycle.plan_name}</th>
                  <td className={tableCell}>{billingPeriod(cycle.period_start, cycle.period_end)}
                    {!cycle.period_end && cycle.scheduled_at && <p className="text-xs">Jadwal {billingDate(cycle.scheduled_at)}</p>}
                  </td>
                  <td className={tableCell}>{rupiah(cycle.amount)}</td>
                  <td className={tableCell}>{cycleLabels[cycle.status] || cycle.status}</td>
                  <td className={tableCell}>{billingDate(cycle.paid_at, true)}</td>
                  <td className={tableCell}>{cycle.xendit_payment_id || '—'}</td>
                </tr>)}
                {!cycles.length && <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-500">Belum ada riwayat pembayaran.</td></tr>}
              </tbody>
            </table>
        </div>
      </section>

      <section className={panel} aria-labelledby="billing-checkouts">
        <h2 id="billing-checkouts" className="border-b border-gray-100 px-5 py-4 font-semibold text-gray-900">Sesi checkout <span className="ml-2 text-xs font-normal text-gray-500">25 terbaru</span></h2>
        <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-700">
                <tr>{['Referensi', 'Paket', 'Nominal', 'Status', 'Dibuat', 'Kedaluwarsa'].map(label => <th key={label} scope="col" className={tableHead}>{label}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {checkouts.map(checkout => <tr key={checkout.id}>
                  <th scope="row" className={`${tableCell} font-medium text-gray-900`}>{checkout.reference_id}</th>
                  <td className={tableCell}>{checkout.plan_name}</td>
                  <td className={tableCell}>{rupiah(checkout.amount)}</td>
                  <td className={tableCell}>{checkoutLabels[checkout.status] || checkout.status}</td>
                  <td className={tableCell}>{billingDate(checkout.created_at)}</td>
                  <td className={tableCell}>{billingDate(checkout.expires_at)}</td>
                </tr>)}
                {!checkouts.length && <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-500">Belum ada sesi checkout.</td></tr>}
              </tbody>
            </table>
        </div>
      </section>
    </>
  )
}
