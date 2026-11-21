import { formatRange } from '@/lib/book-period'
import { EMPTY_BUSINESS_ID, getBusinessContext } from '@/lib/business-context'
import { dayKey, rupiah } from '@/lib/format'
import Link from 'next/link'
import BookRulesClient, { type Rule } from './BookRulesClient'
import HistoryClient from './HistoryClient'
import { Notice, PageHeader, Panel } from '@/components/ui'

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
      <PageHeader eyebrow="Penjualan & Keuangan" title="Data Lama & Tutup Buku"
        description="Masukkan total penjualan & pengeluaran dari periode sebelum memakai aplikasi kasir, dan atur tanggal tutup buku." />

      {(error || recapError) && (
        <Notice tone="error">
          {(error ?? recapError)?.message}. Pastikan <code>supabase/schema.sql</code> versi terbaru sudah dijalankan.
        </Notice>
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

      <Panel className="overflow-hidden" bodyClassName="" title="Rekap per Periode Buku"
        info="Gabungan transaksi kasir, pengeluaran kasir, dan data lama (manual), sesuai aturan tutup buku."
        description="Klik periode untuk melihat rekap lengkapnya.">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-600">
            <thead className="bg-gray-50/70 text-[11px] uppercase text-gray-500 tracking-[0.08em] border-b border-gray-100">
              <tr>
                <th className="px-5 py-3 font-semibold">Periode</th>
                <th className="px-5 py-3 font-semibold text-right">Penjualan</th>
                <th className="px-5 py-3 font-semibold text-right">Kelebihan</th>
                <th className="px-5 py-3 font-semibold text-right">Pengeluaran</th>
                <th className="px-5 py-3 font-semibold text-right">Laba</th>
                <th className="px-5 py-3 font-semibold">Sumber</th>
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
                  <tr key={r.start_date + r.end_date} className="transition-colors hover:bg-blue-50/30">
                    <td className="px-5 py-3.5 whitespace-nowrap font-medium text-gray-900">
                      <Link
                        href={`/dashboard/recap?${new URLSearchParams({ ...(businessId ? { b: businessId } : {}), p: `${r.start_date}_${r.end_date}` })}`}
                        className="text-blue-700 hover:underline"
                      >
                        {formatRange(r.start_date, r.end_date)}
                      </Link>
                    </td>
                    <td className="px-5 py-3.5 text-right whitespace-nowrap">{rupiah(r.sales)}</td>
                    <td className="px-5 py-3.5 text-right whitespace-nowrap text-green-700">{rupiah(r.overpay)}</td>
                    <td className="px-5 py-3.5 text-right whitespace-nowrap">{rupiah(r.expenses)}</td>
                    <td
                      className={
                        'px-4 py-3 text-right whitespace-nowrap font-semibold ' +
                        (r.profit < 0 ? 'text-red-600' : 'text-green-700')
                      }
                    >
                      {rupiah(r.profit)}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-gray-500 whitespace-nowrap">
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
      </Panel>
    </div>
  )
}
