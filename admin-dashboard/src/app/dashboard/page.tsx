import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import { dayKey } from '@/lib/format'
import { pickBusinessId } from '@/lib/business-filter'
import DashboardClient from './DashboardClient'

type TxRow = {
  grand_total: number
  created_at: string
  status: string
  payment_type: string | null
  debt_status: string | null
  items: { quantity?: number; product?: { name?: string } }[] | null
}

const DAYS = 7

/** Rentang waktu laporan, dihitung per request (di luar render agar lolos lint purity). */
function reportRange() {
  const now = Date.now()
  const since = new Date(now - (DAYS - 1) * 86400000)
  since.setUTCHours(-7, 0, 0, 0) // 00:00 WIB (UTC+7) pada hari pertama
  const days: string[] = []
  for (let i = DAYS - 1; i >= 0; i--) days.push(dayKey(new Date(now - i * 86400000)))
  return { since: since.toISOString(), days, today: days[days.length - 1], monthKey: days[days.length - 1].slice(0, 7) }
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ b?: string | string[] }>
}) {
  const businessId = pickBusinessId((await searchParams).b)
  const supabase = await createClient()

  const { data: businesses } = await supabase.from('businesses').select('id, name').order('created_at')

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

  const { since, days, today, monthKey } = reportRange()

  let txQuery = supabase
    .from('transactions')
    .select('grand_total, created_at, status, payment_type, debt_status, items')
    .gte('created_at', since)
    .limit(10000)
  let debtQuery = supabase
    .from('transactions')
    .select('grand_total')
    .eq('payment_type', 'hutang')
    .eq('debt_status', 'unpaid')
    .eq('status', 'completed')
  let expQuery = supabase.from('expenses').select('amount').like('date', `${monthKey}%`)
  if (businessId) {
    txQuery = txQuery.eq('business_id', businessId)
    debtQuery = debtQuery.eq('business_id', businessId)
    expQuery = expQuery.eq('business_id', businessId)
  }

  const [{ data: txData }, { data: debts }, { data: expenses }] = await Promise.all([txQuery, debtQuery, expQuery])
  const transactions = ((txData ?? []) as TxRow[]).filter((t) => t.status === 'completed')

  const byDay = new Map<string, number>(days.map((d) => [d, 0]))

  const productCount = new Map<string, number>()
  let todayRevenue = 0
  let todayCount = 0
  let weekRevenue = 0
  for (const t of transactions) {
    const key = dayKey(t.created_at)
    const amount = Number(t.grand_total) || 0
    if (byDay.has(key)) byDay.set(key, (byDay.get(key) ?? 0) + amount)
    weekRevenue += amount
    if (key === today) {
      todayRevenue += amount
      todayCount++
    }
    for (const item of t.items ?? []) {
      const name = item.product?.name ?? 'Lainnya'
      productCount.set(name, (productCount.get(name) ?? 0) + (Number(item.quantity) || 0))
    }
  }

  const dayFmt = new Intl.DateTimeFormat('id-ID', { weekday: 'short', day: 'numeric', timeZone: 'UTC' })
  const chartData = [...byDay.entries()].map(([key, sales]) => ({
    name: key === today ? 'Hari ini' : dayFmt.format(new Date(key + 'T00:00:00Z')),
    sales,
  }))
  const topProducts = [...productCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, qty]) => ({ name, qty }))

  return (
    <DashboardClient
      businesses={businesses}
      todayRevenue={todayRevenue}
      todayCount={todayCount}
      weekRevenue={weekRevenue}
      weekCount={transactions.length}
      unpaidDebt={(debts ?? []).reduce((s, d) => s + (Number(d.grand_total) || 0), 0)}
      monthExpenses={(expenses ?? []).reduce((s, e) => s + (Number(e.amount) || 0), 0)}
      chartData={chartData}
      topProducts={topProducts}
    />
  )
}
