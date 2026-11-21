import DataPanel from '@/components/DataPanel'
import Link from 'next/link'
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import InfoTip from '@/components/InfoTip'
import { Badge, Notice, PageHeader, Panel, StatCard, ui } from '@/components/ui'
import { getBusinessContext, EMPTY_BUSINESS_ID } from '@/lib/business-context'
import { rupiah, dayKey, PAYMENT_LABELS } from '@/lib/format'
import { anchorDate, formatRange } from '@/lib/book-period'
import { resolvePeriod, nextDay, daysBetween, fetchAll } from '@/lib/report-period'
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
  items: { quantity?: number; totalPrice?: number; product?: { id?: string; name?: string; costPrice?: number; costVerified?: boolean } }[] | null
}
type Exp = { scope: string; date: string; category: string | null; amount: number | string; from_drawer: boolean }
type Manual = { period: string; date: string; sales: number | string; expenses: number | string; overpay: number | string | null }

const n = (v: unknown) => Number(v) || 0
const dayFmt = new Intl.DateTimeFormat('id-ID', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })

export default async function RecapPage({ searchParams }: { searchParams: Promise<{ b?: string | string[]; p?: string }> }) {
  const sp = await searchParams
  const { supabase, businessId, businesses: ownedBusinesses } = await getBusinessContext()
  const businesses = ownedBusinesses.filter(b => b.id === businessId)
  const scopedBusinessId = businessId ?? EMPTY_BUSINESS_ID
  const period = await resolvePeriod(supabase, scopedBusinessId, businesses, sp.p)
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
      q = q.eq('business_id', scopedBusinessId)
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
      q = q.eq('business_id', scopedBusinessId)
      return q
    }),
    fetchAll<Manual>((from, to) => {
      let q = supabase
        .from('manual_summaries')
        .select('period, date, sales, expenses, overpay')
        .gte('date', start.slice(0, 7))
        .lte('date', end)
        .range(from, to)
      q = q.eq('business_id', scopedBusinessId)
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
    const k = e.category?.trim() || 'Lain-lain'
    byCategory.set(k, (byCategory.get(k) ?? 0) + n(e.amount))
  }
  const expManual = manual.reduce((s, m) => s + n(m.expenses), 0)
  if (expManual > 0) byCategory.set('Data lama (manual)', expManual)
  const categories = [...byCategory].sort((a, b) => b[1] - a[1])
  const totalExpenses = categories.reduce((s, [, v]) => s + v, 0)
  const profit = income - totalExpenses

  // Laba kotor: HPP snapshot stored on each sold item. Only items whose HPP was
  // checked at the time of sale count; the rest are reported separately.
  // Nota discounts are shared across items by value; tax is not income.
  let grossSales = 0, grossCost = 0, uncheckedSales = 0
  const unchecked = new Map<string, { name: string; qty: number; total: number }>()
  for (const t of done) {
    const items = t.items ?? []
    const itemsTotal = items.reduce((s, i) => s + n(i.totalPrice), 0)
    const factor = itemsTotal > 0 ? Math.max(0, itemsTotal - n(t.discount_amount)) / itemsTotal : 1
    for (const i of items) {
      const net = n(i.totalPrice) * factor, qty = i.quantity ?? 1, cost = i.product?.costPrice
      if (i.product?.costVerified === true && typeof cost === 'number' && Number.isFinite(cost) && cost >= 0) {
        grossSales += net; grossCost += cost * qty
      } else {
        uncheckedSales += net
        const key = i.product?.id ?? i.product?.name ?? '?'
        const cur = unchecked.get(key) ?? { name: i.product?.name ?? '?', qty: 0, total: 0 }
        unchecked.set(key, { name: cur.name, qty: cur.qty + qty, total: cur.total + net })
      }
    }
  }
  const grossProfit = grossSales - grossCost
  const grossMargin = grossSales > 0 ? Math.round((grossProfit / grossSales) * 100) : null
  const coverage = grossSales + uncheckedSales > 0 ? Math.round((grossSales / (grossSales + uncheckedSales)) * 100) : null
  const uncheckedList = [...unchecked.values()].sort((a, b) => b.total - a.total)

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
  // Grouped by product ID so a renamed product stays one row (latest name shown).
  const products = new Map<string, { name: string; qty: number; total: number }>()
  for (const t of done)
    for (const i of t.items ?? []) {
      const k = i.product?.id ?? i.product?.name ?? '?'
      const cur = products.get(k) ?? { name: i.product?.name ?? '?', qty: 0, total: 0 }
      products.set(k, { name: i.product?.name ?? cur.name, qty: cur.qty + (i.quantity ?? 1), total: cur.total + n(i.totalPrice) })
    }
  const topProducts = [...products.values()].sort((a, b) => b.qty - a.qty).slice(0, 10)

  const bizName = businesses[0]?.name ?? 'Belum ada cabang'
  const withPeriod = (path: string) => `${path}?${new URLSearchParams({ p: `${start}_${end}` })}`

  const cancelledTotal = cancelled.reduce((s, t) => s + n(t.grand_total), 0)
  const td = 'px-5 py-2.5 text-right whitespace-nowrap tabular-nums'

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Penjualan & Keuangan" title="Rekap Keuangan"
        description={<><span className="font-medium text-gray-700">{bizName}</span> · {formatRange(start, end)}</>}
        actions={<><PeriodSelect options={period.options} value={`${start}_${end}`} /><PrintButton /></>} />

      {loadError && <Notice tone="error">{loadError}</Notice>}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard icon={ArrowDownLeft} tone="green" label="Total Pemasukan" value={rupiah(income)}
          hint={`${done.length.toLocaleString('id-ID')} transaksi · ${activeDays} hari buka`}
          info="Penjualan kasir + kelebihan bayar + data lama (input manual) pada periode ini. Termasuk bon yang belum dibayar." />
        <StatCard icon={ArrowUpRight} tone="red" label="Total Pengeluaran" value={rupiah(totalExpenses)} valueClassName="text-red-600"
          hint={`${expenses.length.toLocaleString('id-ID')} catatan`}
          info="Semua pengeluaran harian dan bulanan, termasuk data lama manual." />
        <DataPanel compact className="relative overflow-hidden rounded-2xl bg-espresso-900 p-5 text-white shadow-lg">
          <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-champagne/20 blur-3xl" />
          <div className="relative">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[13px] font-medium text-gray-300">Selisih Pemasukan − Pengeluaran</p>
              <InfoTip tone="dark" label="Selisih" text="Total pemasukan dikurangi total pengeluaran pada periode ini. Ini bukan laba: belanja stok yang belum terjual ikut dihitung sebagai pengeluaran. Lihat Laba Kotor untuk laba dari penjualan." />
            </div>
            <p className={`mt-3 truncate font-display text-[28px] font-semibold tabular-nums ${profit >= 0 ? 'text-champagne' : 'text-red-300'}`}>{rupiah(profit)}</p>
            <p className="mt-1 text-xs text-gray-400">{profit >= 0 ? 'Pemasukan lebih besar dari pengeluaran' : 'Pengeluaran lebih besar dari pemasukan'}</p>
          </div>
        </DataPanel>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Panel data className="lg:col-span-3" title="Arus Kas: Pemasukan & Pengeluaran" description={formatRange(start, end)}
          info="Semua uang masuk dan keluar yang tercatat pada periode ini, apa adanya. Belanja stok dihitung saat dibeli, bukan saat terjual.">
          <Group title="Pemasukan">
            <Line label={`Penjualan kasir (${done.length} transaksi)`} value={salesPos} />
            {overpayPos > 0 && <Line label="Kelebihan bayar (kembalian tidak diambil)" value={overpayPos} />}
            {salesManual + overpayManual > 0 && <Line label="Data lama (input manual)" value={salesManual + overpayManual} />}
            <Total label="Total Pemasukan" value={income} />
            {unpaidDebt > 0 && <p className="mt-1 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Termasuk bon belum dibayar {rupiah(unpaidDebt)}: uangnya belum diterima.</p>}
          </Group>

          <Group title="Pengeluaran">
            {categories.length === 0 ? (
              <p className="py-1 pl-3 text-sm text-gray-400">Tidak ada pengeluaran.</p>
            ) : (
              categories.map(([k, v]) => <Line key={k} label={k} value={v} />)
            )}
            <Total label="Total Pengeluaran" value={totalExpenses} />
          </Group>

          <div className={'mt-2 flex items-center justify-between rounded-xl px-5 py-4 ring-1 ' + (profit >= 0 ? 'bg-emerald-50 text-emerald-800 ring-emerald-100' : 'bg-red-50 text-red-700 ring-red-100')}>
            <span className="text-xs font-bold uppercase tracking-[0.14em]">Selisih</span>
            <span className="font-display text-xl font-semibold tabular-nums">{rupiah(profit)}</span>
          </div>

          {(discounts > 0 || cancelled.length > 0) && (
            <dl className="mt-5 grid gap-2 sm:grid-cols-3">
              {discounts > 0 && <Note label="Diskon diberikan" value={rupiah(discounts)} />}
              {cancelled.length > 0 && <Note label={`${cancelled.length} transaksi batal (tidak dihitung)`} value={rupiah(cancelledTotal)} />}
            </dl>
          )}
        </Panel>

        <div className="space-y-4 lg:col-span-2">
          <Panel data title="Penjualan per Metode Bayar" info="Porsi setiap metode pembayaran terhadap penjualan kasir.">
            {payments.length === 0 ? (
              <p className="text-sm text-gray-400">Belum ada penjualan.</p>
            ) : (
              <ul className="space-y-4">
                {payments.map(([k, v]) => (
                  <Bar key={k} label={`${PAYMENT_LABELS[k] ?? k} · ${v.count} trx`} value={v.total} total={salesPos} color="bg-linear-to-r from-blue-600 to-blue-400" />
                ))}
              </ul>
            )}
          </Panel>

          <Panel data title="Pengeluaran per Kategori"
            actions={<Link href={withPeriod('/dashboard/expenses')} className={ui.link}>Rincian <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" /></Link>}>
            {categories.length === 0 ? (
              <p className="text-sm text-gray-400">Tidak ada pengeluaran.</p>
            ) : (
              <ul className="space-y-4">
                {categories.map(([k, v]) => (
                  <Bar key={k} label={k} value={v} total={totalExpenses} color="bg-red-400" />
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      <Panel data title="Laba Kotor (berdasarkan HPP)" description={formatRange(start, end)}
        info="Penjualan bersih dikurangi HPP barang yang terjual. Memakai HPP yang tersimpan saat transaksi terjadi. Diskon nota dibagi ke item sesuai nilainya; pajak tidak dihitung. Biaya operasional (sewa, gaji, dll.) belum dikurangi.">
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <Group title="Produk dengan HPP sudah dicek">
              <Line label="Penjualan bersih" value={grossSales} />
              <Line label="HPP barang terjual" value={grossCost} />
              <Total label="Laba Kotor" value={grossProfit} />
            </Group>
            <p className="text-xs text-gray-500">{grossMargin === null ? 'Belum ada penjualan produk dengan HPP sudah dicek.' : `Margin laba kotor ${grossMargin}% dari penjualan bersih.`}
              {coverage !== null && ` Mencakup ${coverage}% dari nilai penjualan periode ini.`}</p>
          </div>
          <div>
            <Group title="Belum dihitung: HPP belum dicek">
              <Line label="Penjualan bersih" value={uncheckedSales} />
            </Group>
            {uncheckedList.length === 0 ? <p className="text-sm text-gray-400">Semua penjualan sudah memakai HPP yang dicek.</p> : <>
              <p className="mb-2 text-xs text-gray-500">Penjualan ini tidak masuk Laba Kotor karena HPP produknya belum dicek saat transaksi. Periksa HPP di menu Produk agar penjualan berikutnya ikut dihitung.</p>
              <ul className="space-y-1.5 text-sm">{uncheckedList.slice(0, 10).map((v, i) => <li key={`${v.name}-${i}`} className="flex justify-between gap-3"><span className="truncate text-gray-700" title={v.name}>{v.name} <span className="text-xs text-gray-400">{v.qty}×</span></span><span className="whitespace-nowrap tabular-nums">{rupiah(v.total)}</span></li>)}</ul>
              {uncheckedList.length > 10 && <p className="mt-2 text-xs text-gray-400">+{uncheckedList.length - 10} produk lainnya</p>}
              <Link href="/dashboard/products" className={`${ui.link} mt-3`}>Cek HPP di Produk <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" /></Link>
            </>}
          </div>
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Panel data className="overflow-hidden lg:col-span-3" title="Rincian per Hari" description="Hari terbaru di atas" bodyClassName="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className={ui.thead}>
              <tr>
                <th className={ui.th}>Tanggal</th>
                <th className={`${ui.th} text-right`}>Trx</th>
                <th className={`${ui.th} text-right`}>Pemasukan</th>
                <th className={`${ui.th} text-right`}>Pengeluaran</th>
                <th className={`${ui.th} text-right`}>Selisih</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {dailyRows.map(([d, r]) => {
                const diff = r.sales - r.expenses
                const empty = !r.count && !r.sales && !r.expenses
                return (
                  <tr key={d} className={empty ? 'text-gray-300' : 'text-gray-700 hover:bg-gray-50/60'}>
                    <td className="whitespace-nowrap px-5 py-2.5">
                      {dayFmt.format(new Date(d + 'T00:00:00Z'))}
                      {d === today && <Badge tone="gold" className="ml-2">hari ini</Badge>}
                    </td>
                    <td className={td}>{r.count || '-'}</td>
                    <td className={td}>{r.sales ? rupiah(r.sales) : '-'}</td>
                    <td className={`${td} text-red-600`}>{r.expenses ? rupiah(r.expenses) : '-'}</td>
                    <td className={`${td} font-medium ${empty ? '' : diff < 0 ? 'text-red-600' : 'text-gray-900'}`}>{empty ? '-' : rupiah(diff)}</td>
                  </tr>
                )
              })}
              {(monthlyExpenses > 0 || monthlyManual.sales > 0 || monthlyManual.expenses > 0) && (
                <tr className="bg-amber-50/50 text-gray-700">
                  <td className="px-5 py-2.5" colSpan={2}>
                    Bulanan / tidak per hari
                    <p className="text-xs text-gray-400">Biaya tetap (sewa, gaji, dll.) &amp; data lama bulanan</p>
                  </td>
                  <td className={td}>{monthlyManual.sales ? rupiah(monthlyManual.sales) : '-'}</td>
                  <td className={`${td} text-red-600`}>{rupiah(monthlyExpenses + monthlyManual.expenses)}</td>
                  <td className={`${td} font-medium`}>{rupiah(monthlyManual.sales - monthlyExpenses - monthlyManual.expenses)}</td>
                </tr>
              )}
            </tbody>
            <tfoot className="border-t border-gray-200 bg-gray-50/80 font-semibold text-gray-900">
              <tr>
                <td className="px-5 py-3">Total</td>
                <td className={td}>{done.length}</td>
                <td className={td}>{rupiah(income)}</td>
                <td className={`${td} text-red-600`}>{rupiah(totalExpenses)}</td>
                <td className={`${td} ${profit < 0 ? 'text-red-600' : 'text-gray-900'}`}>{rupiah(profit)}</td>
              </tr>
            </tfoot>
          </table>
        </Panel>

        <Panel data className="self-start lg:col-span-2" title="Produk Terlaris" description="Berdasarkan jumlah terjual · nilai sebelum diskon nota">
          {topProducts.length === 0 ? (
            <p className="text-sm text-gray-400">Belum ada data.</p>
          ) : (
            <ol className="space-y-3">
              {topProducts.map((v, i) => (
                <li key={`${v.name}-${i}`} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${i < 3 ? 'bg-espresso-900 text-champagne' : 'bg-gray-100 text-gray-500'}`}>{i + 1}</span>
                    <span className="truncate font-medium text-gray-800" title={v.name}>{v.name}</span>
                  </span>
                  <span className="whitespace-nowrap text-right tabular-nums">
                    <span className="font-semibold text-gray-900">{v.qty}×</span>
                    <span className="block text-xs text-gray-400">{rupiah(v.total)}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>
    </div>
  )
}

function Note({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-gray-50 px-3.5 py-2.5 ring-1 ring-gray-100">
      <dt className="text-[11px] text-gray-500">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold tabular-nums text-gray-900">{value}</dd>
    </div>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400">{title}</p>
      <div className="space-y-0.5">{children}</div>
    </div>
  )
}

function Line({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between gap-4 border-b border-dashed border-gray-100 py-1.5 pl-3 text-sm text-gray-700">
      <span className="min-w-0">{label}</span>
      <span className="whitespace-nowrap tabular-nums">{rupiah(value)}</span>
    </div>
  )
}

function Total({ label, value }: { label: string; value: number }) {
  return (
    <div className="mt-1 flex justify-between gap-4 pt-2 text-sm font-semibold text-gray-900">
      <span>{label}</span>
      <span className="whitespace-nowrap tabular-nums">{rupiah(value)}</span>
    </div>
  )
}

function Bar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0
  return (
    <li>
      <div className="flex justify-between gap-3 text-sm">
        <span className="truncate text-gray-700">{label}</span>
        <span className="whitespace-nowrap font-medium tabular-nums text-gray-900">
          {rupiah(value)} <span className="text-xs font-normal text-gray-400">{pct}%</span>
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(pct, 2)}%` }} />
      </div>
    </li>
  )
}
