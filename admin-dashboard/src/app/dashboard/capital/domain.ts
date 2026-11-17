/** Perhitungan modal & balik modal. Modul murni (tanpa I/O) supaya mudah dites. */

export type RecapPeriod = {
  start_date: string
  end_date: string
  sales_pos: number | string | null
  sales_manual: number | string | null
  expenses_pos: number | string | null
  expenses_manual: number | string | null
  overpay_pos: number | string | null
  overpay_manual: number | string | null
  tx_count: number | string | null
}

export type CapitalKind = 'initial' | 'additional'
export type CapitalEntry = { id: string; date: string; kind: CapitalKind; amount: number | string; note: string | null }

export type MonthRow = {
  start: string
  end: string
  /** Bulan buku (YYYY-MM): bulan yang memuat titik tengah periode. */
  month: string
  running: boolean
  txCount: number
  salesPos: number
  overpay: number
  salesManual: number
  income: number
  expenses: number
  profit: number
  capitalIn: number
  cumCapital: number
  cumIncome: number
  cumProfit: number
  /** Laba kumulatif ÷ modal kumulatif, null bila belum ada modal. */
  payback: number | null
}

export type Totals = {
  months: number
  txCount: number
  salesPos: number
  overpay: number
  salesManual: number
  income: number
  expenses: number
  profit: number
  capitalIn: number
}

export type CapitalSummary = {
  rows: MonthRow[]
  capital: number
  totals: Totals
  payback: number | null
  /** Sisa yang harus ditutup laba; 0 bila sudah balik modal. */
  remaining: number
  /** Laba di atas modal; 0 bila belum balik modal. */
  surplus: number
  /** Periode pertama saat laba kumulatif menutup modal kumulatif. */
  paybackRow: MonthRow | null
  /** Rata-rata laba per bulan dari maksimal 3 periode selesai terakhir. */
  avgRecentProfit: number | null
  recentMonths: number
  /** Perkiraan jumlah bulan lagi sampai balik modal. */
  monthsToPayback: number | null
  bestMonth: MonthRow | null
  worstMonth: MonthRow | null
  firstDate: string | null
}

const num = (v: unknown) => Number(v) || 0
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/

export const isMonth = (value: unknown): value is string => typeof value === 'string' && MONTH_RE.test(value)

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function bookMonth(start: string, end: string): string {
  const days = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000)
  return addDays(start, Math.floor(Math.max(days, 0) / 2)).slice(0, 7)
}

const monthFmt = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' })
export const monthLabel = (month: string) => monthFmt.format(new Date(`${month}-01T00:00:00Z`))

export function emptyTotals(): Totals {
  return { months: 0, txCount: 0, salesPos: 0, overpay: 0, salesManual: 0, income: 0, expenses: 0, profit: 0, capitalIn: 0 }
}

export function sumRows(rows: MonthRow[]): Totals {
  const t = emptyTotals()
  for (const r of rows) {
    t.months++
    t.txCount += r.txCount
    t.salesPos += r.salesPos
    t.overpay += r.overpay
    t.salesManual += r.salesManual
    t.income += r.income
    t.expenses += r.expenses
    t.profit += r.profit
    t.capitalIn += r.capitalIn
  }
  return t
}

/** Baris per periode buku (urut lama → baru) dengan nilai kumulatif sejak awal. */
export function buildRows(periods: RecapPeriod[], capital: CapitalEntry[], today: string): MonthRow[] {
  const sorted = [...periods].sort((a, b) => a.start_date.localeCompare(b.start_date))
  const entries = [...capital].sort((a, b) => a.date.localeCompare(b.date))
  let cumIncome = 0
  let cumProfit = 0
  return sorted.map((p, i) => {
    const salesPos = num(p.sales_pos)
    const overpay = num(p.overpay_pos) + num(p.overpay_manual)
    const salesManual = num(p.sales_manual)
    const income = salesPos + overpay + salesManual
    const expenses = num(p.expenses_pos) + num(p.expenses_manual)
    const profit = income - expenses
    // Modal sebelum periode pertama ikut dihitung di periode pertama.
    const prevEnd = i === 0 ? '' : sorted[i - 1].end_date
    const capitalIn = entries.filter((e) => e.date > prevEnd && e.date <= p.end_date).reduce((s, e) => s + num(e.amount), 0)
    const cumCapital = entries.filter((e) => e.date <= p.end_date).reduce((s, e) => s + num(e.amount), 0)
    cumIncome += income
    cumProfit += profit
    return {
      start: p.start_date,
      end: p.end_date,
      month: bookMonth(p.start_date, p.end_date),
      running: p.start_date <= today && today <= p.end_date,
      txCount: num(p.tx_count),
      salesPos,
      overpay,
      salesManual,
      income,
      expenses,
      profit,
      capitalIn,
      cumCapital,
      cumIncome,
      cumProfit,
      payback: cumCapital > 0 ? cumProfit / cumCapital : null,
    }
  })
}

export function summarizeCapital(periods: RecapPeriod[], capital: CapitalEntry[], today: string): CapitalSummary {
  const rows = buildRows(periods, capital, today)
  const totals = sumRows(rows)
  const capitalTotal = capital.reduce((s, e) => s + num(e.amount), 0)
  const profit = totals.profit
  const remaining = Math.max(capitalTotal - profit, 0)
  const surplus = capitalTotal > 0 ? Math.max(profit - capitalTotal, 0) : 0

  // Titik balik modal: laba kumulatif ≥ modal yang sudah disetor sampai periode itu, dan tetap
  // ≥ total modal saat ini (tambahan modal belakangan bisa membuat posisi turun lagi).
  const paybackRow =
    capitalTotal > 0 && profit >= capitalTotal
      ? rows.find((r, i) => r.cumCapital > 0 && r.cumProfit >= r.cumCapital && rows.slice(i).every((x) => x.cumProfit >= x.cumCapital)) ?? null
      : null

  const finished = rows.filter((r) => !r.running && r.end < today)
  const recent = finished.slice(-3)
  const avgRecentProfit = recent.length ? recent.reduce((s, r) => s + r.profit, 0) / recent.length : null
  const monthsToPayback = remaining > 0 && avgRecentProfit !== null && avgRecentProfit > 0 ? Math.ceil(remaining / avgRecentProfit) : null

  const finishedOrAll = finished.length ? finished : rows
  const bestMonth = finishedOrAll.reduce<MonthRow | null>((best, r) => (!best || r.profit > best.profit ? r : best), null)
  const worstMonth = finishedOrAll.reduce<MonthRow | null>((worst, r) => (!worst || r.profit < worst.profit ? r : worst), null)

  const firstDates = [rows[0]?.start, ...capital.map((e) => e.date)].filter(Boolean) as string[]

  return {
    rows,
    capital: capitalTotal,
    totals,
    payback: capitalTotal > 0 ? profit / capitalTotal : null,
    remaining: capitalTotal > 0 ? remaining : 0,
    surplus,
    paybackRow,
    avgRecentProfit,
    recentMonths: recent.length,
    monthsToPayback,
    bestMonth,
    worstMonth,
    firstDate: firstDates.length ? firstDates.sort()[0] : null,
  }
}

/** Filter bulan (inklusif). Nilai kosong/tidak valid = tanpa batas; from > to ditukar. */
export function resolveMonthFilter(from: unknown, to: unknown): { from: string; to: string } {
  let f = isMonth(from) ? from : ''
  let t = isMonth(to) ? to : ''
  if (f && t && f > t) [f, t] = [t, f]
  return { from: f, to: t }
}

export function filterRows(rows: MonthRow[], filter: { from: string; to: string }): MonthRow[] {
  return rows.filter((r) => (!filter.from || r.month >= filter.from) && (!filter.to || r.month <= filter.to))
}

/** Tambahkan n bulan ke YYYY-MM. */
export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return d.toISOString().slice(0, 7)
}
