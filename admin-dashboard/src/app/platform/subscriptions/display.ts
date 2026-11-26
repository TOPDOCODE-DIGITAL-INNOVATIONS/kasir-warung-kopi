import type { SubscriptionStatus, TesterStatus, TrialStatus } from './types'

export const trialLabels: Record<TrialStatus, string> = {
  none: 'Belum mulai', scheduled: 'Terjadwal', active: 'Aktif', expired: 'Berakhir',
}

export const subscriptionLabels: Record<SubscriptionStatus, string> = {
  none: 'Belum berlangganan', pending: 'Menunggu pembayaran',
  active: 'Aktif', past_due: 'Perlu pembayaran', expired: 'Berakhir',
}

export const testerLabels: Record<TesterStatus, string> = {
  none: 'Bukan penguji', active: 'Penguji aktif', expired: 'Akses penguji berakhir',
}

/** Label aksi di billing_audit_events. */
export const billingActionLabels: Record<string, string> = {
  trial_started: 'Trial dimulai oleh Super Admin',
  trial_auto_started: 'Trial otomatis dimulai',
  trial_ended_by_admin: 'Trial dihentikan oleh Super Admin',
  tester_granted: 'Akses penguji diberikan',
  tester_revoked: 'Akses penguji dicabut',
  checkout_created: 'Checkout dibuat',
  checkout_failed: 'Checkout gagal',
  checkout_cancelled: 'Checkout dibatalkan',
  payment_succeeded: 'Pembayaran berhasil',
  payment_failed: 'Pembayaran gagal',
  payment_retrying: 'Pembayaran dicoba ulang',
  payment_cancelled: 'Pembayaran dibatalkan',
  renewal_stopped: 'Perpanjangan otomatis dihentikan',
  xendit_reconciled: 'Status Xendit disinkronkan',
}

export const billingActionLabel = (action: string) => billingActionLabels[action] ?? action.replaceAll('_', ' ')

const displayDate = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeZone: 'Asia/Makassar' })
const displayTime = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Makassar' })

export function billingDate(value: string | null, time = false) {
  return value ? (time ? displayTime.format(new Date(value)) + ' WITA' : displayDate.format(new Date(value))) : '—'
}
