/**
 * Baca nominal uang dari teks bebas. Mendukung format Indonesia (7.419.797,28)
 * dan format buku/Excel (7,419,797.28). Pemisah terakhir yang diikuti 1–2 angka
 * dianggap desimal; selebihnya pemisah ribuan.
 */
export function parseMoney(input: string): number {
  const s = String(input ?? '').replace(/[^\d.,]/g, '')
  if (!s) return 0
  const m = /^(.*)[.,](\d{1,2})$/.exec(s)
  const intPart = (m ? m[1] : s).replace(/[.,]/g, '')
  const value = Number(`${intPart || '0'}.${m ? m[2] : '0'}`)
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : NaN
}

/** 7419797.28 => "7.419.797,28" */
export function formatMoney(n: number): string {
  return n.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

/** Format saat mengetik; koma desimal dan nol di belakangnya tetap dipertahankan. */
export function formatRupiahInput(input: string): string {
  const cleaned = input.replace(/[^\d,]/g, '')
  if (!cleaned) return ''
  const comma = cleaned.indexOf(',')
  const integer = (comma < 0 ? cleaned : cleaned.slice(0, comma)).replace(/^0+(?=\d)/, '') || '0'
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return comma < 0 ? grouped : `${grouped},${cleaned.slice(comma + 1).replace(/,/g, '').slice(0, 6)}`
}

/** Nilai formulir tanpa pemisah ribuan; tidak dibulatkan menjadi dua desimal. */
export function rupiahInputValue(formatted: string): string {
  return formatted.replace(/\./g, '').replace(',', '.').replace(/\.$/, '')
}
