import { dayKey } from '@/lib/format'
import { overviewRangeError, shiftDay } from '../overview-domain'
import type { HistoryRequest, PurchaseHistoryRow } from './types'

export const HISTORY_LIMIT = 1000
export const HISTORY_PAGE_SIZE = 20

/** Inclusive rolling month, clamped at the end of shorter months. */
export function defaultHistoryRange(today = dayKey(new Date())) {
  const date = new Date(`${today}T00:00:00Z`), day = date.getUTCDate()
  date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() - 1)
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()
  date.setUTCDate(Math.min(day, last))
  return { start: shiftDay(date.toISOString().slice(0, 10), 1), end: today }
}

export function validateHistoryRequest(request: HistoryRequest) {
  if (!request || !['purchases', 'adjustments', 'events'].includes(request.tab)) throw new Error('Jenis riwayat tidak valid.')
  if (typeof request.start !== 'string' || typeof request.end !== 'string') throw new Error('Tanggal riwayat tidak valid.')
  const error = overviewRangeError(request.start, request.end)
  if (error) throw new Error(error)
  return request
}

export function historyBounds(start: string, end: string) {
  return { from: `${start}T00:00:00+07:00`, until: `${shiftDay(end, 1)}T00:00:00+07:00` }
}

// Monthly expenses belong to the first of the month, like the financial recap.
export function historyExpenseFilter(start: string, end: string) {
  const nextMonth = shiftDay(`${start.slice(0, 7)}-01`, 32).slice(0, 7)
  const month = start.endsWith('-01') ? start.slice(0, 7) : nextMonth
  const daily = `and(scope.eq.daily,date.gte.${start},date.lte.${end})`
  return month > end.slice(0, 7) ? daily : `${daily},and(scope.eq.monthly,date.gte.${month},date.lte.${end.slice(0, 7)})`
}

const newest = (a: PurchaseHistoryRow, b: PurchaseHistoryRow) => Date.parse(b.date) - Date.parse(a.date) || a.id.localeCompare(b.id)
const cheapest = (a: PurchaseHistoryRow, b: PurchaseHistoryRow) => {
  if (a.unitPrice == null) return b.unitPrice == null ? newest(a, b) : 1
  if (b.unitPrice == null) return -1
  return a.unitPrice - b.unitPrice || newest(a, b)
}

/** Group by supplier ID, never by display name; unknown suppliers remain separate. */
export function visiblePurchases(rows: PurchaseHistoryRow[], sort: 'newest' | 'cheapest', distinct: boolean) {
  const sorted = [...rows].sort(cheapest)
  const suppliers = new Set<string>()
  const selected = distinct ? sorted.filter(row => {
    if (!row.supplierId) return true
    if (suppliers.has(row.supplierId)) return false
    suppliers.add(row.supplierId)
    return true
  }) : sorted
  return selected.sort(sort === 'newest' ? newest : cheapest)
}
