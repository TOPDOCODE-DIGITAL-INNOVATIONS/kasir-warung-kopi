import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import { pickBusinessId } from '@/lib/business-filter'
import { rupiah, dayKey, PAYMENT_LABELS } from '@/lib/format'
import { anchorDate, formatRange } from '@/lib/book-period'
import { resolvePeriod, nextDay, daysBetween, fetchAll } from '@/lib/report-period'
import BusinessSelect from '../BusinessSelect'
import PeriodSelect from '../PeriodSelect'
import PrintButton from './PrintButton'

type Tx = {
  created_at: string
  grand_total: number | string
  overpay_amount: number | string | null
  discount_amount: number | string
  payment_type: string | null
  debt_status: string | null
  status: string
  items: { quantity?: number; totalPrice?: number; product?: { name?: string } }[] | null
}
type Exp = { scope: string; date: string; category: string | null; amount: number | string; from_drawer: boolean }
type Manual = { period: string; date: string; sales: number | string; expenses: number | string; overpay: number | string | null }

const n = (v: unknown) => Number(v) || 0
const dayFmt = new Intl.DateTimeFormat('id-ID', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })

export default async function RecapPage({ searchParams }: { searchParams: Promise<{ b?: string | string[]; p?: string }> }) {
  const sp = await searchParams
  const businessId = pickBusinessId(sp.b)
  const supabase = await createClient()
  const { data: businesses } = await supabase.from('businesses').select('id, name').order('created_at')
  const period = await resolvePeriod(supabase, businessId, businesses ?? [], sp.p)
  const { start, end } = period
  const inRange = (d: string) => {
    const a = anchorDate(d)
    return a >= start && a <= end
  }

  const [txRes, expRes, manRes] = await Promise.all([
    fetchAll<Tx>((from, to) => {
      let q = supabase
        .from('transactions')
        .select('created_at, grand_total, overpay_amount, discount_amount, payment_type, debt_status, status, items')
        .gte('created_at', `${start}T00:00:00+07:00`)
        .lt('created_at', `${nextDay(end)}T00:00:00+07:00`)
        .order('created_at')
        .range(from, to)
      if (businessId) q = q.eq('business_id', businessId)
      return q
    }),
    fetchAll<Exp>((from, to) => {
      let q = supabase
        .from('expenses')
        .select('scope, date, category, amount, from_drawer')
        .gte('date', start.slice(0, 7))
        .lte('date', end)
        .order('date')
        .range(from, to)
      if (businessId) q = q.eq('business_id', businessId)
      return q
    }),
    fetchAll<Manual>((from, to) => {
      let q = supabase
        .from('manual_summaries')
        .select('period, date, sales, expenses, overpay')
        .gte('date', start.slice(0, 7))
        .lte('date', end)
        .range(from, to)
      if (businessId) q = q.eq('business_id', businessId)
      return q
    }),
  ])
  const loadError = txRes.error ?? expRes.error ?? manRes.error

  const all = txRes.data
  const done = all.filter((t) => t.status !== 'cancelled')
  const cancelled = all.filter((t) => t.status === 'cancelled')
  const expenses = expRes.data.filter((e) => inRange(e.date))
  const manual = manRes.data.filter((m) => inRange(m.date))

  // Pemasukan
  const salesPos = done.reduce((s, t) => s + n(t.grand_total), 0)
  const overpayPos = done.reduce((s, t) => s + n(t.overpay_amount), 0)
  const salesManual = manual.reduce((s, m) => s + n(m.sales), 0)
  const overpayManual = manual.reduce((s, m) => s + n(m.overpay), 0)
  const income = salesPos + overpayPos + salesManual + overpayManual
  const unpaidDebt = done.filter((t) => t.payment_type === 'hutang' && t.debt_status !== 'paid').reduce((s, t) => s + n(t.grand_total), 0)
  const discounts = done.reduce((s, t) => s + n(t.discount_amount), 0)

  // Pengeluaran per kategori
  const byCategory = new Map<string, number>()
  for (const e of expenses) {
    const k = e.category?.trim() || 'Lainnya'
    byCategory.set(k, (byCategory.get(k) ?? 0) + n(e.amount))
  }
  const expManual = manual.reduce((s, m) => s + n(m.expenses), 0)
  if (expManual > 0) byCategory.set('Data lama (manual)', expManual)
  const categories = [...byCategory].sort((a, b) => b[1] - a[1])
  const totalExpenses = categories.reduce((s, [, v]) => s + v, 0)
  const profit = income - totalExpenses

  // Per metode bayar
  const byPay = new Map<string, { total: number; count: number }>()
  for (const t of done) {
    const k = t.payment_type ?? '-'
    const cur = byPay.get(k) ?? { total: 0, count: 0 }
    byPay.set(k, { total: cur.total + n(t.grand_total), count: cur.count + 1 })
  }
  const payments = [...byPay].sort((a, b) => b[1].total - a[1].total)

  // Harian
  const today = dayKey(new Date())
  const daily = new Map(daysBetween(start, end).map((d) => [d, { count: 0, sales: 0, expenses: 0 }]))
  for (const t of done) {
    const row = daily.get(dayKey(t.created_at))
    if (row) {
      row.count++
      row.sales += n(t.grand_total) + n(t.overpay_amount)
    }
  }
  let monthlyExpenses = 0
  for (const e of expenses) {
    const row = e.scope === 'monthly' ? null : daily.get(e.date)
    if (row) row.expenses += n(e.amount)
    else monthlyExpenses += n(e.amount)
  }
  let monthlyManual = { sales: 0, expenses: 0 }
  for (const m of manual) {
    const row = m.period === 'day' ? daily.get(m.date) : null
    if (row) {
      row.sales += n(m.sales) + n(m.overpay)
      row.expenses += n(m.expenses)
    } else monthlyManual = { sales: monthlyManual.sales + n(m.sales) + n(m.overpay), expenses: monthlyManual.expenses + n(m.expenses) }
  }
  const dailyRows = [...daily].filter(([d, r]) => d <= today || r.count || r.sales || r.expenses).reverse()
  const activeDays = dailyRows.filter(([, r]) => r.count > 0).length

  // Produk terlaris
  const products = new Map<string, { qty: number; total: number }>()
  for (const t of done)
    for (const i of t.items ?? []) {
      const k = i.product?.name ?? '?'
      const cur = products.get(k) ?? { qty: 0, total: 0 }
      products.set(k, { qty: cur.qty + (i.quantity ?? 1), total: cur.total + n(i.totalPrice) })
    }
  const topProducts = [...products].sort((a, b) => b[1].qty - a[1].qty).slice(0, 10)

  const bizName = businessId ? businesses?.find((b) => b.id === businessId)?.name : 'Semua cabang'
  const withB = (path: string) => `${path}?${new URLSearchParams({ ...(businessId ? { b: businessId } : {}), p: `${start}_${end}` })}`

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Rekap Keuangan</h1>
          <p className="text-gray-500 text-sm mt-1">
            {bizName} · {formatRange(start, end)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <BusinessSelect businesses={businesses ?? []} />
          <PeriodSelect options={period.options} value={`${start}_${end}`} />
          <PrintButton />
        </div>
      </div>

      {loadError && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{loadError}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Big label="Total Pemasukan" value={rupiah(income)} hint={`${done.length} transaksi · ${activeDays} hari buka`} tone="text-gray-900" />
        <Big label="Total Pengeluaran" value={rupiah(totalExpenses)} hint={`${expenses.length} catatan`} tone="text-red-600" />
        <Big
          label={profit >= 0 ? 'Laba Bersih' : 'Rugi'}
          value={rupiah(profit)}
          hint={income > 0 ? `Margin ${Math.round((profit / income) * 100)}%` : 'Belum ada pemasukan'}
          tone={profit >= 0 ? 'text-green-700' : 'text-red-600'}
          highlight
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Laporan laba rugi */}
        <section className="lg:col-span-3 bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-bold text-gray-900 mb-4">Laporan Laba Rugi</h2>

          <Group title="Pemasukan">
            <Line label={`Penjualan kasir (${done.length} transaksi)`} value={salesPos} />
            {overpayPos > 0 && <Line label="Kelebihan bayar (kembalian tidak diambil)" value={overpayPos} />}
            {salesManual + overpayManual > 0 && <Line label="Data lama (input manual)" value={salesManual + overpayManual} />}
            <Total label="Total Pemasukan" value={income} />
          </Group>

          <Group title="Pengeluaran">
            {categories.length === 0 ? (
              <p className="text-sm text-gray-400 py-1">Tidak ada pengeluaran.</p>
            ) : (
              categories.map(([k, v]) => <Line key={k} label={k} value={v} />)
            )}
            <Total label="Total Pengeluaran" value={totalExpenses} />
          </Group>

          <div
            className={
              'flex justify-between items-center rounded-lg px-4 py-3 mt-2 font-bold text-lg ' +
              (profit >= 0 ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700')
            }
          >
            <span>{profit >= 0 ? 'LABA BERSIH' : 'RUGI'}</span>
            <span>{rupiah(profit)}</span>
          </div>

          {(unpaidDebt > 0 || discounts > 0 || cancelled.length > 0) && (
            <ul className="mt-4 space-y-1 text-xs text-gray-500">
              {unpaidDebt > 0 && <li>• Termasuk bon yang belum dibayar: {rupiah(unpaidDebt)}</li>}
              {discounts > 0 && <li>• Diskon yang diberikan: {rupiah(discounts)}</li>}
              {cancelled.length > 0 && (
                <li>
                  • {cancelled.length} transaksi dibatalkan ({rupiah(cancelled.reduce((s, t) => s + n(t.grand_total), 0))}), tidak
                  dihitung
                </li>
              )}
            </ul>
          )}
        </section>

        <div className="lg:col-span-2 space-y-4">
          <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h2 className="font-bold text-gray-900 mb-3">Penjualan per Metode Bayar</h2>
            {payments.length === 0 ? (
              <p className="text-sm text-gray-400">Belum ada penjualan.</p>
            ) : (
              <ul className="space-y-3">
                {payments.map(([k, v]) => (
                  <Bar key={k} label={`${PAYMENT_LABELS[k] ?? k} · ${v.count} trx`} value={v.total} total={salesPos} color="bg-blue-500" />
                ))}
              </ul>
            )}
          </section>

          <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <div className="flex justify-between items-center mb-3">
              <h2 className="font-bold text-gray-900">Pengeluaran per Kategori</h2>
              <Link href={withB('/dashboard/expenses')} className="text-xs text-blue-600 hover:underline print:hidden">
                Rincian
              </Link>
            </div>
            {categories.length === 0 ? (
              <p className="text-sm text-gray-400">Tidak ada pengeluaran.</p>
            ) : (
              <ul className="space-y-3">
                {categories.map(([k, v]) => (
                  <Bar key={k} label={k} value={v} total={totalExpenses} color="bg-red-400" />
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <section className="lg:col-span-3 bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <h2 className="font-bold text-gray-900 px-5 pt-5 pb-3">Rincian per Hari</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">Tanggal</th>
                  <th className="px-4 py-2.5 text-right font-medium">Trx</th>
                  <th className="px-4 py-2.5 text-right font-medium">Pemasukan</th>
                  <th className="px-4 py-2.5 text-right font-medium">Pengeluaran</th>
                  <th className="px-4 py-2.5 text-right font-medium">Selisih</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {dailyRows.map(([d, r]) => {
                  const diff = r.sales - r.expenses
                  const empty = !r.count && !r.sales && !r.expenses
                  return (
                    <tr key={d} className={empty ? 'text-gray-300' : 'text-gray-700'}>
                      <td className="px-4 py-2 whitespace-nowrap">
                        {dayFmt.format(new Date(d + 'T00:00:00Z'))}
                        {d === today && <span className="ml-1.5 text-xs text-blue-600">hari ini</span>}
                      </td>
                      <td className="px-4 py-2 text-right">{r.count || '-'}</td>
                      <td className="px-4 py-2 text-right whitespace-nowrap">{r.sales ? rupiah(r.sales) : '-'}</td>
                      <td className="px-4 py-2 text-right whitespace-nowrap text-red-600">{r.expenses ? rupiah(r.expenses) : '-'}</td>
                      <td className={'px-4 py-2 text-right whitespace-nowrap font-medium ' + (empty ? '' : diff < 0 ? 'text-red-600' : 'text-gray-900')}>
                        {empty ? '-' : rupiah(diff)}
                      </td>
                    </tr>
                  )
                })}
                {(monthlyExpenses > 0 || monthlyManual.sales > 0 || monthlyManual.expenses > 0) && (
                  <tr className="text-gray-700 bg-amber-50/50">
                    <td className="px-4 py-2" colSpan={2}>
                      Bulanan / tidak per hari
                      <p className="text-xs text-gray-400">Biaya tetap (sewa, gaji, dll.) & data lama bulanan</p>
                    </td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">{monthlyManual.sales ? rupiah(monthlyManual.sales) : '-'}</td>
                    <td className="px-4 py-2 text-right whitespace-nowrap text-red-600">
                      {rupiah(monthlyExpenses + monthlyManual.expenses)}
                    </td>
                    <td className="px-4 py-2 text-right whitespace-nowrap font-medium">
                      {rupiah(monthlyManual.sales - monthlyExpenses - monthlyManual.expenses)}
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot className="bg-gray-50 font-semibold text-gray-900">
                <tr>
                  <td className="px-4 py-2.5">Total</td>
                  <td className="px-4 py-2.5 text-right">{done.length}</td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">{rupiah(income)}</td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap text-red-600">{rupiah(totalExpenses)}</td>
                  <td className={'px-4 py-2.5 text-right whitespace-nowrap ' + (profit < 0 ? 'text-red-600' : 'text-green-700')}>{rupiah(profit)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        <section className="lg:col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm p-5 self-start">
          <h2 className="font-bold text-gray-900 mb-3">Produk Terlaris</h2>
          {topProducts.length === 0 ? (
            <p className="text-sm text-gray-400">Belum ada data.</p>
          ) : (
            <ol className="divide-y divide-gray-100">
              {topProducts.map(([name, v], i) => (
                <li key={name} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="truncate">
                    <span className="text-gray-400 w-5 inline-block">{i + 1}.</span>
                    {name}
                  </span>
                  <span className="text-right whitespace-nowrap">
                    <span className="font-semibold">{v.qty}×</span>
                    <span className="block text-xs text-gray-400">{rupiah(v.total)}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  )
}

function Big({ label, value, hint, tone, highlight }: { label: string; value: string; hint: string; tone: string; highlight?: boolean }) {
  return (
    <div className={'rounded-xl border shadow-sm p-5 ' + (highlight ? 'bg-white border-green-200 ring-1 ring-green-100' : 'bg-white border-gray-100')}>
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <p className={`text-2xl font-bold mt-1 truncate ${tone}`}>{value}</p>
      <p className="text-xs text-gray-400 mt-1">{hint}</p>
    </div>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">{title}</p>
      <div className="space-y-0.5">{children}</div>
    </div>
  )
}

function Line({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between gap-4 text-sm text-gray-700 py-1 pl-3">
      <span className="min-w-0">{label}</span>
      <span className="whitespace-nowrap">{rupiah(value)}</span>
    </div>
  )
}

function Total({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between gap-4 text-sm font-semibold text-gray-900 border-t border-gray-200 pt-2 mt-1">
      <span>{label}</span>
      <span className="whitespace-nowrap">{rupiah(value)}</span>
    </div>
  )
}

function Bar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0
  return (
    <li>
      <div className="flex justify-between gap-3 text-sm">
        <span className="text-gray-700 truncate">{label}</span>
        <span className="font-medium text-gray-900 whitespace-nowrap">
          {rupiah(value)} <span className="text-xs text-gray-400 font-normal">{pct}%</span>
        </span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full mt-1.5 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(pct, 2)}%` }} />
      </div>
    </li>
  )
}
