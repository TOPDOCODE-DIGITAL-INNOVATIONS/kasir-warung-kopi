import Link from 'next/link'
import { getBusinessContext } from '@/lib/business-context'
import { pickBusinessId } from '@/lib/business-filter'
import DashboardClient from './DashboardClient'
import { formatRange } from '@/lib/book-period'

type Summary = {
  today: string
  daily: { day: string; sales: number; count: number }[]
  top_products: { name: string; qty: number }[]
  unpaid_debt: number
  month_expenses: number
  period_sales: number
  period_overpay: number
  period_start: string | null
  period_end: string | null
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ b?: string | string[] }>
}) {
  const businessId = pickBusinessId((await searchParams).b)
  const { supabase, businesses } = await getBusinessContext()
  // Overview deliberately uses its own optional filter, independent of the sidebar.
  const { data, error } = await supabase.rpc('dashboard_summary', { p_business: businessId, p_days: 7 })

  if (!businesses || businesses.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 p-8 text-center space-y-3">
        <h1 className="text-xl font-bold">Selamat datang!</h1>
        <p className="text-gray-500">Belum ada cabang usaha. Buat cabang dulu untuk mendapatkan token sync kasir.</p>
        <Link href="/dashboard/businesses" className="inline-block bg-blue-600 text-white px-4 py-2 rounded-lg">
          Buat Cabang
        </Link>
      </div>
    )
  }

  if (error || !data) {
    return (
      <p className="text-sm text-red-600 bg-red-50 p-4 rounded-lg">
        Gagal memuat ringkasan: {error?.message ?? 'tidak ada data'}. Pastikan <code>supabase/schema.sql</code> versi
        terbaru sudah dijalankan.
      </p>
    )
  }

  const summary = data as Summary
  const dayFmt = new Intl.DateTimeFormat('id-ID', { weekday: 'short', day: 'numeric', timeZone: 'UTC' })
  const daily = summary.daily.map((d) => ({ ...d, sales: Number(d.sales), count: Number(d.count) }))
  const todayRow = daily.find((d) => d.day === summary.today)

  return (
    <DashboardClient
      businesses={businesses}
      todayRevenue={todayRow?.sales ?? 0}
      todayCount={todayRow?.count ?? 0}
      weekRevenue={daily.reduce((s, d) => s + d.sales, 0)}
      weekCount={daily.reduce((s, d) => s + d.count, 0)}
      unpaidDebt={Number(summary.unpaid_debt)}
      periodExpenses={Number(summary.month_expenses)}
      periodSales={Number(summary.period_sales)}
      periodOverpay={Number(summary.period_overpay ?? 0)}
      periodLabel={
        summary.period_start && summary.period_end
          ? formatRange(summary.period_start, summary.period_end)
          : 'Periode buku tiap cabang'
      }
      chartData={daily.map((d) => ({
        name: d.day === summary.today ? 'Hari ini' : dayFmt.format(new Date(d.day + 'T00:00:00Z')),
        sales: d.sales,
      }))}
      topProducts={summary.top_products.map((p) => ({ name: p.name, qty: Number(p.qty) }))}
    />
  )
}
