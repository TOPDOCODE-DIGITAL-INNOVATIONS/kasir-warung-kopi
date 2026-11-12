import { getBusinessContext, EMPTY_BUSINESS_ID } from '@/lib/business-context'
import { dayKey, rupiah } from '@/lib/format'
import { formatRange } from '@/lib/book-period'
import HistoryClient from './HistoryClient'
import BookRulesClient, { type Rule } from './BookRulesClient'

type Recap = {
  start_date: string
  end_date: string
  sales_pos: number
  sales_manual: number
  expenses_pos: number
  expenses_manual: number
  overpay_pos: number
  overpay_manual: number
  tx_count: number
}

export default async function HistoryPage() {
  const { supabase, businesses: ownedBusinesses, businessId } = await getBusinessContext()
  const businesses = ownedBusinesses.filter(b => b.id === businessId)

  const entriesQuery = supabase
    .from('manual_summaries')
    .select('id, business_id, period, date, sales, expenses, overpay, note, businesses(name)')
    .order('date', { ascending: false })
    .limit(500)
    .eq('business_id', businessId ?? EMPTY_BUSINESS_ID)

  const [{ data: entries, error }, { data: recap, error: recapError }, { data: rules }] =
    await Promise.all([
      entriesQuery,
      businessId ? supabase.rpc('book_recap', { p_business: businessId, p_limit: 36 }) : Promise.resolve({ data: [], error: null }),
      supabase.from('book_period_rules').select('id, business_id, start_day, effective_from').eq('business_id', businessId ?? EMPTY_BUSINESS_ID),
    ])
  const allRules = (rules ?? []) as Rule[]

  const rows = ((recap ?? []) as Recap[]).map((r) => {
    const sales = Number(r.sales_pos) + Number(r.overpay_pos) + Number(r.sales_manual)
    const expenses = Number(r.expenses_pos) + Number(r.expenses_manual)
    const overpay = Number(r.overpay_pos) + Number(r.overpay_manual)
    return { ...r, sales, expenses, overpay, profit: sales - expenses }
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Data Lama & Rekap</h1>
          <p className="text-gray-500 text-sm mt-1">
            Masukkan total penjualan & pengeluaran dari periode sebelum memakai aplikasi kasir.
          </p>
        </div>
      </div>

      {(error || recapError) && (
        <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">
          {(error ?? recapError)?.message}. Pastikan <code>supabase/schema.sql</code> versi terbaru sudah dijalankan.
        </p>
      )}

      <BookRulesClient key={`book-rules-${businessId ?? 'none'}`} businesses={businesses} rules={allRules} today={dayKey(new Date())} />

      <HistoryClient
        key={`history-${businessId ?? 'none'}`}
        rules={allRules}
        businesses={businesses}
        defaultBusinessId={businessId ?? ''}
        entries={(entries ?? []).map((e) => ({
          id: e.id,
          business_id: e.business_id,
          period: e.period as 'day' | 'month',
          date: e.date,
          sales: Number(e.sales),
          expenses: Number(e.expenses),
          overpay: Number(e.overpay ?? 0),
          note: e.note,
          businessName: (e.businesses as unknown as { name: string } | null)?.name ?? '-',
        }))}
      />

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 md:p-6 border-b border-gray-100">
          <h2 className="font-semibold text-lg text-gray-900">Rekap per Periode Buku</h2>
          <p className="text-xs text-gray-500 mt-1">
            Gabungan transaksi kasir, pengeluaran kasir, dan data lama (manual), sesuai aturan tutup buku.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-600">
            <thead className="bg-gray-50 text-xs uppercase text-gray-700">
              <tr>
                <th className="px-4 py-3 font-medium">Periode</th>
                <th className="px-4 py-3 font-medium text-right">Penjualan</th>
                <th className="px-4 py-3 font-medium text-right">Kelebihan</th>
                <th className="px-4 py-3 font-medium text-right">Pengeluaran</th>
                <th className="px-4 py-3 font-medium text-right">Laba</th>
                <th className="px-4 py-3 font-medium">Sumber</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    Belum ada data.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.start_date + r.end_date} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3 whitespace-nowrap font-medium text-gray-900">
                      {formatRange(r.start_date, r.end_date)}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">{rupiah(r.sales)}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap text-green-700">{rupiah(r.overpay)}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">{rupiah(r.expenses)}</td>
                    <td
                      className={
                        'px-4 py-3 text-right whitespace-nowrap font-semibold ' +
                        (r.profit < 0 ? 'text-red-600' : 'text-green-700')
                      }
                    >
                      {rupiah(r.profit)}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {[
                        Number(r.tx_count) > 0 || Number(r.expenses_pos) > 0 ? `Kasir (${r.tx_count} trx)` : null,
                        Number(r.sales_manual) > 0 || Number(r.expenses_manual) > 0 || Number(r.overpay_manual) > 0
                          ? 'Manual'
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' + ')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
