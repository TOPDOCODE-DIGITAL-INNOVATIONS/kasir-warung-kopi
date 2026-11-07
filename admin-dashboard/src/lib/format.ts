export const TZ = 'Asia/Jakarta'

export function rupiah(value: number | string | null | undefined): string {
  return 'Rp ' + Math.round(Number(value) || 0).toLocaleString('id-ID')
}

/** YYYY-MM-DD dalam zona waktu WIB */
export function dayKey(date: Date | string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(date))
}

export function formatDateTime(date: string | null | undefined): string {
  if (!date) return '-'
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: TZ }).format(
    new Date(date)
  )
}

export const PAYMENT_LABELS: Record<string, string> = {
  tunai: 'Tunai',
  qris: 'QRIS',
  transfer: 'Transfer',
  ewallet: 'E-Wallet',
  debit: 'Debit',
  hutang: 'Bon',
}
