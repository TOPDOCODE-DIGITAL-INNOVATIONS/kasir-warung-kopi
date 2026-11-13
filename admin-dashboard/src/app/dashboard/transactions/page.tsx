import { getBusinessContext, EMPTY_BUSINESS_ID } from '@/lib/business-context'
import Link from 'next/link'
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
      <Link
        key={label}
        href={`/dashboard/transactions?${params}`}
        className={
          'px-3 py-1.5 text-sm rounded-lg border ' +
          (active ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50')
        }
      >
        {label}
      </Link>
    )
  }
  const shift = (days: number) => {
    const d = new Date(today + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() + days)
    return d.toISOString().slice(0, 10)
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Transaksi</h1>
          <p className="text-gray-500 text-sm mt-1">Klik salah satu transaksi untuk melihat detail pesanannya.</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {quick('Hari ini', today, today)}
        {quick('Kemarin', shift(-1), shift(-1))}
        {quick('7 hari', shift(-6), today)}
        {quick('30 hari', shift(-29), today)}
      </div>

      <form method="get" className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
        <label className="text-xs text-gray-500 space-y-1">
          <span>Dari</span>
          <input type="date" name="from" defaultValue={from} className="w-full border border-gray-300 rounded-lg p-2 text-sm text-gray-900" />
        </label>
        <label className="text-xs text-gray-500 space-y-1">
          <span>Sampai</span>
          <input type="date" name="to" defaultValue={to} className="w-full border border-gray-300 rounded-lg p-2 text-sm text-gray-900" />
        </label>
        <label className="text-xs text-gray-500 space-y-1">
          <span>Status</span>
          <select name="status" defaultValue={status} className="w-full border border-gray-300 rounded-lg p-2 text-sm text-gray-900 bg-white">
            <option value="">Semua</option>
            <option value="completed">Selesai</option>
            <option value="cancelled">Batal</option>
            <option value="unpaid">Bon belum lunas</option>
          </select>
        </label>
        <label className="text-xs text-gray-500 space-y-1">
          <span>Pembayaran</span>
          <select name="pay" defaultValue={pay} className="w-full border border-gray-300 rounded-lg p-2 text-sm text-gray-900 bg-white">
            <option value="">Semua</option>
            {Object.entries(PAYMENT_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-500 space-y-1 col-span-2 md:col-span-1">
          <span>Cari</span>
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="No. nota, pelanggan, kasir"
            className="w-full border border-gray-300 rounded-lg p-2 text-sm text-gray-900"
          />
        </label>
        <button className="col-span-2 md:col-span-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg py-2">
          Terapkan
        </button>
      </form>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Total Penjualan" value={rupiah(sales)} hint={`${done.length} transaksi selesai`} />
        <Stat label="Rata-rata / Transaksi" value={rupiah(done.length ? sales / done.length : 0)} hint="Tidak termasuk batal" />
        <Stat label="Bon Belum Lunas" value={rupiah(unpaid)} hint="Pada rentang ini" tone="text-amber-600" />
        <Stat label="Dibatalkan" value={String(cancelledCount)} hint="transaksi" tone="text-red-600" />
      </div>

      {byPayment.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          {byPayment.map(([k, v]) => (
            <span key={k} className="bg-white border border-gray-200 rounded-full px-3 py-1 text-gray-600">
              {PAYMENT_LABELS[k] ?? k}: <span className="font-semibold text-gray-900">{rupiah(v)}</span>
            </span>
          ))}
        </div>
      )}

      {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{error.message}</p>}
      {transactions.length >= LIMIT && (
        <p className="text-xs text-amber-700 bg-amber-50 p-3 rounded-lg">
          Menampilkan {LIMIT} transaksi terbaru saja. Persempit rentang tanggal agar ringkasan akurat.
        </p>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <TransactionList transactions={transactions} showBusiness={false} />
      </div>
    </div>
  )
}

function Stat({ label, value, hint, tone = 'text-gray-900' }: { label: string; value: string; hint: string; tone?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 min-w-0">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className={`text-lg font-bold truncate ${tone}`}>{value}</p>
      <p className="text-xs text-gray-400">{hint}</p>
    </div>
  )
}
