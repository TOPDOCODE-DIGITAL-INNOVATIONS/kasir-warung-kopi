import { Ban, Calculator, HandCoins, Search, TrendingUp } from 'lucide-react'
import { PageHeader, Panel, StatCard, Notice, filterBar, ui } from '@/components/ui'
import { formatRange } from '@/lib/book-period'
import { getBusinessContext, EMPTY_BUSINESS_ID } from '@/lib/business-context'
import Link from '@/components/LoadingLink'
import FilterForm, { FilterSubmit } from '@/components/FilterForm'
import { rupiah, dayKey, PAYMENT_LABELS } from '@/lib/format'
import TransactionList from './TransactionList'
import { TX_COLUMNS, type TxRow } from './types'

type Params = { b?: string | string[]; from?: string; to?: string; status?: string; pay?: string; q?: string }

const LIMIT = 300
const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s)

function nextDay(d: string) {
  const dt = new Date(d + 'T00:00:00Z')
  dt.setUTCDate(dt.getUTCDate() + 1)
  return dt.toISOString().slice(0, 10)
}

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams
  const { supabase, businessId } = await getBusinessContext()
  const today = dayKey(new Date())
  const from = isDate(sp.from) ? sp.from! : today
  const to = isDate(sp.to) ? sp.to! : from
  const status = sp.status ?? ''
  const pay = sp.pay ?? ''
  const q = (sp.q ?? '').trim()

  const build = (columns: string) => {
    let query = supabase
      .from('transactions')
      .select(columns)
      .gte('created_at', `${from}T00:00:00+07:00`)
      .lt('created_at', `${nextDay(to)}T00:00:00+07:00`)
      .order('created_at', { ascending: false })
      .limit(LIMIT)
    query = query.eq('business_id', businessId ?? EMPTY_BUSINESS_ID)
    if (status === 'completed' || status === 'cancelled') query = query.eq('status', status)
    if (status === 'unpaid') query = query.eq('payment_type', 'hutang').eq('debt_status', 'unpaid').eq('status', 'completed')
    if (pay && PAYMENT_LABELS[pay]) query = query.eq('payment_type', pay)
    if (q) {
      const safe = q.replace(/[,()*%]/g, ' ')
      query = query.or(`id.ilike.%${safe}%,customer_name.ilike.%${safe}%,cashier_name.ilike.%${safe}%`)
    }
    return query
  }

  const firstTry = await build(TX_COLUMNS + ', edit_history')
  // Kolom edit_history mungkin belum ada jika migration terbaru belum dijalankan.
  const result = firstTry.error ? await build(TX_COLUMNS) : firstTry
  const transactions = (result.data ?? []) as unknown as TxRow[]
  const error = result.error

  const done = transactions.filter((t) => t.status !== 'cancelled')
  const sales = done.reduce((s, t) => s + Number(t.grand_total), 0)
  const cancelledCount = transactions.length - done.length
  const unpaid = done
    .filter((t) => t.payment_type === 'hutang' && t.debt_status !== 'paid')
    .reduce((s, t) => s + Number(t.grand_total), 0)
  const byPayment = Object.entries(
    done.reduce<Record<string, number>>((acc, t) => {
      const k = t.payment_type ?? '-'
      acc[k] = (acc[k] ?? 0) + Number(t.grand_total)
      return acc
    }, {})
  ).sort((a, b) => b[1] - a[1])

  const quick = (label: string, f: string, t: string) => {
    const params = new URLSearchParams()
    params.set('from', f)
    params.set('to', t)
    const active = f === from && t === to && !status && !pay && !q
    return (
      <Link key={label} href={`/dashboard/transactions?${params}`} aria-current={active ? 'true' : undefined} className={ui.chip(active)}>
        {label}
      </Link>
    )
  }
  const shift = (days: number) => {
    const d = new Date(today + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() + days)
    return d.toISOString().slice(0, 10)
  }
  const average = done.length ? sales / done.length : 0

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Penjualan & Keuangan" title="Transaksi"
        description={<>Periode <span className="font-medium text-gray-700">{formatRange(from, to)}</span> · klik transaksi untuk melihat detail pesanan.</>} />

      <section aria-label="Filter transaksi" className={filterBar}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-medium text-gray-500">Cepat:</span>
          {quick('Hari ini', today, today)}
          {quick('Kemarin', shift(-1), shift(-1))}
          {quick('7 hari', shift(-6), today)}
          {quick('30 hari', shift(-29), today)}
        </div>
        <FilterForm action="/dashboard/transactions" className="mt-4 grid grid-cols-2 items-end gap-3 border-t border-gray-100 pt-4 md:grid-cols-3 xl:grid-cols-[repeat(4,minmax(0,1fr))_minmax(0,1.5fr)_auto]">
          <label className={ui.label}>Dari
            <input type="date" name="from" defaultValue={from} className={ui.input} />
          </label>
          <label className={ui.label}>Sampai
            <input type="date" name="to" defaultValue={to} className={ui.input} />
          </label>
          <label className={ui.label}>Status
            <select name="status" defaultValue={status} className={ui.input}>
              <option value="">Semua status</option>
              <option value="completed">Selesai</option>
              <option value="cancelled">Batal</option>
              <option value="unpaid">Bon belum lunas</option>
            </select>
          </label>
          <label className={ui.label}>Pembayaran
            <select name="pay" defaultValue={pay} className={ui.input}>
              <option value="">Semua metode</option>
              {Object.entries(PAYMENT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className={`${ui.label} col-span-2 md:col-span-1`}>Cari
            <span className="relative block">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 mt-0.75 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input type="search" name="q" defaultValue={q} placeholder="No. nota, pelanggan, kasir" className={`${ui.input} pl-9`} />
            </span>
          </label>
          <FilterSubmit className={`${ui.btnPrimary} col-span-2 md:col-span-1`}>Terapkan</FilterSubmit>
        </FilterForm>
      </section>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={TrendingUp} label="Total Penjualan" value={rupiah(sales)} hint={`${done.length.toLocaleString('id-ID')} transaksi selesai`}
          info="Jumlah grand total transaksi yang tidak dibatalkan pada hasil filter ini." />
        <StatCard icon={Calculator} tone="sky" label="Rata-rata / Transaksi" value={rupiah(average)} hint="Tidak termasuk batal"
          info="Total penjualan dibagi jumlah transaksi selesai." />
        <StatCard icon={HandCoins} tone="amber" label="Bon Belum Lunas" value={rupiah(unpaid)} hint="Pada rentang ini" valueClassName="text-amber-700"
          info="Total transaksi bon (hutang) yang belum dilunasi pelanggan." />
        <StatCard icon={Ban} tone="red" label="Dibatalkan" value={cancelledCount.toLocaleString('id-ID')} hint="transaksi" valueClassName="text-red-600"
          info="Jumlah transaksi yang dibatalkan kasir pada rentang ini." />
      </div>

      {error && <Notice tone="error">{error.message}</Notice>}
      {transactions.length >= LIMIT && (
        <Notice tone="warning">Menampilkan {LIMIT} transaksi terbaru saja. Persempit rentang tanggal agar ringkasan akurat.</Notice>
      )}

      <Panel title="Daftar Transaksi" bodyClassName=""
        description={`${transactions.length.toLocaleString('id-ID')} transaksi ditemukan`}
        actions={byPayment.length > 0 && (
          <ul aria-label="Total per metode pembayaran" className="flex flex-wrap gap-1.5">
            {byPayment.map(([k, v]) => (
              <li key={k} className="rounded-full bg-gray-50 px-3 py-1 text-xs text-gray-600 ring-1 ring-gray-100">
                {PAYMENT_LABELS[k] ?? k} <span className="ml-1 font-semibold tabular-nums text-gray-900">{rupiah(v)}</span>
              </li>
            ))}
          </ul>
        )}>
        <TransactionList transactions={transactions} showBusiness={false} />
      </Panel>
    </div>
  )
}
