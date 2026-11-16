import type { SupabaseClient } from '@supabase/supabase-js'
import { bookPeriod, formatRange, type BookRule } from './book-period'
import { dayKey } from './format'

export type PeriodOption = { value: string; label: string }
export type ResolvedPeriod = { start: string; end: string; options: PeriodOption[] }

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s)

/**
 * Pilihan periode buku untuk halaman laporan: periode berjalan + periode yang punya data
 * (dari RPC book_recap). Nilai ?p= berbentuk "YYYY-MM-DD_YYYY-MM-DD".
 */
export async function resolvePeriod(
  supabase: SupabaseClient,
  businessId: string | null,
  businesses: { id: string }[],
  p: string | undefined
): Promise<ResolvedPeriod> {
  let rulesQuery = supabase.from('book_period_rules').select('business_id, start_day, effective_from')
  if (businessId) rulesQuery = rulesQuery.eq('business_id', businessId)
  const [{ data: rules }, { data: recap }] = await Promise.all([
    rulesQuery,
    supabase.rpc('book_recap', { p_business: businessId, p_limit: 36 }),
  ])
  const ruleBiz = businessId ?? businesses[0]?.id
  const myRules = ((rules ?? []) as (BookRule & { business_id: string })[]).filter((r) => r.business_id === ruleBiz)
  const current = bookPeriod(myRules, dayKey(new Date()))

  const seen = new Set<string>()
  const options: PeriodOption[] = []
  const add = (start: string, end: string, suffix = '') => {
    const value = `${start}_${end}`
    if (seen.has(value)) return
    seen.add(value)
    options.push({ value, label: formatRange(start, end) + suffix })
  }
  add(current.start, current.end, ' (berjalan)')
  for (const r of (recap ?? []) as { start_date: string; end_date: string }[]) add(r.start_date, r.end_date)
  options.sort((a, b) => b.value.localeCompare(a.value))

  const [s, e] = (p ?? '').split('_')
  if (s && e && isDate(s) && isDate(e) && s <= e) {
    if (!seen.has(`${s}_${e}`)) options.unshift({ value: `${s}_${e}`, label: formatRange(s, e) })
    return { start: s, end: e, options }
  }
  return { start: current.start, end: current.end, options }
}

export function nextDay(d: string): string {
  const dt = new Date(d + 'T00:00:00Z')
  dt.setUTCDate(dt.getUTCDate() + 1)
  return dt.toISOString().slice(0, 10)
}

/** Daftar tanggal YYYY-MM-DD dari start sampai end (inklusif). */
export function daysBetween(start: string, end: string): string[] {
  const out: string[] = []
  for (let d = start; d <= end && out.length < 400; d = nextDay(d)) out.push(d)
  return out
}

/** Ambil semua baris (melewati batas 1000 baris PostgREST). */
export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
  size = 1000,
  max = 20000
): Promise<{ data: T[]; error: string | null }> {
  const out: T[] = []
  for (let from = 0; from < max; from += size) {
    const { data, error } = await page(from, from + size - 1)
    if (error) return { data: out, error: error.message }
    out.push(...((data ?? []) as T[]))
    if (!data || data.length < size) break
  }
  return { data: out, error: null }
}
