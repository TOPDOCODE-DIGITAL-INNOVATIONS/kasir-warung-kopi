import type { BranchCoverage, SubscriptionStatus, TrialStatus } from './types'

export const branchCoverageLabels: Record<BranchCoverage, string> = {
  free: 'Dalam cakupan gratis', covered: 'Cabang tambahan tercakup',
  pending: 'Menunggu pembayaran paket', uncovered: 'Cabang tambahan tanpa paket',
}

export const trialLabels: Record<TrialStatus, string> = {
  none: 'Belum mulai', scheduled: 'Terjadwal', active: 'Aktif', expired: 'Berakhir',
}

export const subscriptionLabels: Record<SubscriptionStatus, string> = {
  none: 'Belum berlangganan', pending: 'Menunggu pembayaran',
  active: 'Aktif', past_due: 'Perlu pembayaran', expired: 'Berakhir',
}

const displayDate = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeZone: 'Asia/Makassar' })
const displayTime = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Makassar' })

export function billingDate(value: string | null, time = false) {
  return value ? (time ? displayTime.format(new Date(value)) + ' WITA' : displayDate.format(new Date(value))) : '—'
}

export function billingPeriod(start: string | null, end: string | null) {
  return start && end ? `${billingDate(start)} – ${billingDate(end)}` : '—'
}
