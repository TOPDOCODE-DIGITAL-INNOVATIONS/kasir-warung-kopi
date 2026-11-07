/**
 * Periode buku (tutup buku). Logika ini sama dengan fungsi SQL public.book_period
 * di supabase/schema.sql — ubah keduanya bersamaan.
 */
export type BookRule = { start_day: number; effective_from: string } // effective_from: YYYY-MM-DD

/** Aturan yang berlaku sejak awal disimpan dengan tanggal ini. */
export const SINCE_BEGINNING = '2000-01-01'

const iso = (d: Date) => d.toISOString().slice(0, 10)
const utc = (s: string) => new Date(s + 'T00:00:00Z')
const dayOfMonth = (y: number, m: number, day: number) => new Date(Date.UTC(y, m, day))

/** 'YYYY-MM' => tanggal 1 bulan itu; 'YYYY-MM-DD' apa adanya. */
export function anchorDate(s: string): string {
  return /^\d{4}-\d{2}$/.test(s) ? s + '-01' : s
}

export function bookPeriod(rules: BookRule[], date: string): { start: string; end: string } {
  const sorted = [...rules].sort((a, b) => a.effective_from.localeCompare(b.effective_from))
  const cur = [...sorted].reverse().find((r) => r.effective_from <= date)
  const next = sorted.find((r) => r.effective_from > date)
  const sd = cur?.start_day ?? 1

  const d = utc(date)
  let start = dayOfMonth(d.getUTCFullYear(), d.getUTCMonth(), sd)
  if (d < start) start = dayOfMonth(d.getUTCFullYear(), d.getUTCMonth() - 1, sd)
  if (cur && utc(cur.effective_from) > start) start = utc(cur.effective_from)

  let nextStart = dayOfMonth(start.getUTCFullYear(), start.getUTCMonth(), sd)
  if (nextStart <= start) nextStart = dayOfMonth(start.getUTCFullYear(), start.getUTCMonth() + 1, sd)
  if (next && utc(next.effective_from) < nextStart) nextStart = utc(next.effective_from)

  const end = new Date(nextStart.getTime() - 86_400_000)
  return { start: iso(start), end: iso(end) }
}

const fmtDM = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const fmtDMY = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

/** "26 Okt – 25 Nov 2026" */
export function formatRange(start: string, end: string): string {
  const s = utc(start)
  const e = utc(end)
  const left = s.getUTCFullYear() === e.getUTCFullYear() ? fmtDM.format(s) : fmtDMY.format(s)
  return `${left} – ${fmtDMY.format(e)}`
}

/** "Tutup buku tgl 25, buka buku tgl 26" */
export function describeRule(startDay: number): string {
  return startDay === 1
    ? 'Per bulan kalender (tgl 1 – akhir bulan)'
    : `Tutup buku tgl ${startDay - 1}, buka buku baru tgl ${startDay}`
}
