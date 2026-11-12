export type OverviewRange = { start: string; end: string }
export type RankedProduct = { key: string; name: string; qty: number }
export type OverviewTx = {
  created_at: string; status: string; grand_total: number | string
  overpay_amount?: number | string | null; payment_type?: string | null; debt_status?: string | null
  items: { product?: { id?: string; name?: string }; quantity?: number | string }[] | null
}
export type OverviewExpense = { date: string; amount: number | string }
export type OverviewManual = { date: string; sales: number | string; expenses: number | string; overpay?: number | string | null }

const number = (value: unknown) => Number(value) || 0
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number(value.slice(0, 4)) >= 1000 && Number(value.slice(0, 4)) <= 9998 &&
  Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value

export function shiftDay(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/** Batas inklusif: 12 November–11 Februari. Akhir bulan diklem ke hari terakhir yang ada. */
export function maxOverviewEnd(start: string): string {
  if (!validDate(start)) return ''
  const date = new Date(`${start}T00:00:00Z`)
  const day = date.getUTCDate()
  date.setUTCDate(1)
  date.setUTCMonth(date.getUTCMonth() + 3)
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()
  date.setUTCDate(Math.min(day, lastDay))
  return shiftDay(date.toISOString().slice(0, 10), -1)
}

export function overviewRangeError(start: string, end: string): string | null {
  if (!validDate(start) || !validDate(end)) return 'Tanggal mulai dan akhir harus valid.'
  if (start > end) return 'Tanggal akhir harus sama atau setelah tanggal mulai.'
  if (end > maxOverviewEnd(start)) return 'Rentang tanggal maksimal 3 bulan.'
  return null
}

export function resolveOverviewRange(from: string | undefined, to: string | undefined, today: string) {
  const fallback = { start: shiftDay(today, -6), end: today }
  if (!from && !to) return { ...fallback, error: null }
  const error = overviewRangeError(from ?? '', to ?? '')
  return error ? { ...fallback, error: `${error} Filter dikembalikan ke 7 hari terakhir.` } : { start: from!, end: to!, error: null }
}

function localDay(timestamp: string) {
  return new Date(Date.parse(timestamp) + 7 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

// Catatan bulanan masuk pada tanggal 1, sama dengan anchor_date pada rekap keuangan.
const anchor = (date: string) => date.length === 7 ? `${date}-01` : date

export function summarizeOverview(range: OverviewRange, transactions: OverviewTx[], expenses: OverviewExpense[], manual: OverviewManual[]) {
  const daily = new Map<string, { day: string; sales: number; count: number }>()
  for (let day = range.start; day <= range.end; day = shiftDay(day, 1)) daily.set(day, { day, sales: 0, count: 0 })
  const products = new Map<string, RankedProduct>()
  let sales = 0, count = 0, unpaidDebt = 0, overpay = 0, totalExpenses = 0
  for (const tx of transactions) {
    if (tx.status !== 'completed') continue
    const row = daily.get(localDay(tx.created_at))
    if (!row) continue
    const total = number(tx.grand_total)
    sales += total
    count++
    row.sales += total
    row.count++
    overpay += number(tx.overpay_amount)
    if (tx.payment_type === 'hutang' && tx.debt_status !== 'paid') unpaidDebt += total
    for (const item of tx.items ?? []) {
      const qty = number(item.quantity)
      if (qty <= 0) continue
      const name = item.product?.name || 'Produk tanpa nama'
      const key = JSON.stringify([item.product?.id || '', name])
      const product = products.get(key) ?? { key, name, qty: 0 }
      product.qty += qty
      products.set(key, product)
    }
  }
  for (const record of manual) {
    const row = daily.get(anchor(record.date))
    if (!row) continue
    const total = number(record.sales)
    sales += total
    row.sales += total
    overpay += number(record.overpay)
    totalExpenses += number(record.expenses)
  }
  for (const expense of expenses) if (daily.has(anchor(expense.date))) totalExpenses += number(expense.amount)
  return {
    sales, count, unpaidDebt, income: sales + overpay, overpay, expenses: totalExpenses,
    daily: [...daily.values()],
    topProducts: [...products.values()].sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name, 'id') || a.key.localeCompare(b.key)),
  }
}
