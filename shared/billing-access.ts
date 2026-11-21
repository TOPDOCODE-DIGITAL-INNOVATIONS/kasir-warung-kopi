/**
 * Aturan hak akses langganan KasirKu (dipakai dashboard Owner, API sync, dan aplikasi kasir).
 *
 * - trial       : masa coba berjalan.
 * - active      : periode berbayar berjalan.
 * - grace       : trial/periode sudah lewat, masih dalam toleransi GRACE_DAYS hari.
 * - expired     : lewat toleransi -> dashboard read-only, kasir tidak bisa membuat transaksi baru.
 * - none        : belum ada trial maupun periode berbayar (mis. email belum terverifikasi).
 *
 * File ini tidak boleh mengimpor apa pun agar bisa dipakai di Next.js, Vite, dan test.
 */

export const GRACE_DAYS = 3
export const TRIAL_DAYS = 14
/** Banner pengingat muncul bila sisa akses <= hari ini dan tidak ada perpanjangan otomatis. */
export const REMINDER_DAYS = 3

const DAY_MS = 24 * 60 * 60 * 1000

export type AccessState = 'trial' | 'active' | 'grace' | 'expired' | 'none'

export type BillingSnapshot = {
  trial_ends_at?: string | null
  subscription?: {
    status?: string | null
    period_end?: string | null
    renewal_enabled?: boolean | null
  } | null
}

export type Access = {
  state: AccessState
  /** Akhir trial / periode berbayar (tanpa toleransi). */
  endsAt: string | null
  /** Batas akhir toleransi; setelah ini akses dibatasi. */
  graceEndsAt: string | null
  /** Sisa hari (dibulatkan ke atas) sampai endsAt, atau sampai graceEndsAt saat grace. */
  daysLeft: number
  readOnly: boolean
  /** Tagihan perpanjangan gagal di Xendit. */
  paymentIssue: boolean
  /** Tampilkan banner pengingat di dashboard. */
  showReminder: boolean
}

function time(value: string | null | undefined): number | null {
  if (!value) return null
  const t = Date.parse(value)
  return Number.isNaN(t) ? null : t
}

export function computeAccess(billing: BillingSnapshot | null | undefined, now: Date = new Date()): Access {
  const nowMs = now.getTime()
  const trialEnd = time(billing?.trial_ends_at)
  const sub = billing?.subscription
  // Subscription 'pending' belum dibayar; periode hanya berlaku bila tercatat.
  const paidEnd = sub && sub.status !== 'pending' ? time(sub.period_end) : null
  const renewing = !!sub?.renewal_enabled && (sub.status === 'active' || sub.status === 'past_due')
  const paymentIssue = sub?.status === 'past_due'

  const ends = [trialEnd, paidEnd].filter((t): t is number => t !== null)
  if (!ends.length) {
    return { state: 'none', endsAt: null, graceEndsAt: null, daysLeft: 0, readOnly: false, paymentIssue, showReminder: false }
  }
  const end = Math.max(...ends)
  const graceEnd = end + GRACE_DAYS * DAY_MS
  const base = { endsAt: new Date(end).toISOString(), graceEndsAt: new Date(graceEnd).toISOString(), paymentIssue }
  const daysUntil = (t: number) => Math.max(0, Math.ceil((t - nowMs) / DAY_MS))

  if (nowMs < end) {
    const state: AccessState = paidEnd !== null && nowMs < paidEnd ? 'active' : 'trial'
    const daysLeft = daysUntil(end)
    const showReminder = paymentIssue || (!(state === 'active' && renewing) && daysLeft <= REMINDER_DAYS)
    return { ...base, state, daysLeft, readOnly: false, showReminder }
  }
  if (nowMs < graceEnd) {
    return { ...base, state: 'grace', daysLeft: daysUntil(graceEnd), readOnly: false, showReminder: true }
  }
  return { ...base, state: 'expired', daysLeft: 0, readOnly: true, showReminder: true }
}

/** Teks singkat status untuk banner/halaman langganan. */
export function accessMessage(access: Access): string {
  switch (access.state) {
    case 'trial':
      return `Masa coba gratis tersisa ${access.daysLeft} hari.`
    case 'active':
      return access.paymentIssue
        ? 'Pembayaran perpanjangan gagal. Perbarui pembayaran agar langganan tidak terhenti.'
        : `Langganan aktif, tersisa ${access.daysLeft} hari.`
    case 'grace':
      return `Masa aktif sudah berakhir. Anda masih punya ${access.daysLeft} hari toleransi sebelum data menjadi hanya-baca dan kasir berhenti menerima transaksi baru.`
    case 'expired':
      return 'Langganan berakhir. Dashboard hanya-baca dan kasir tidak dapat membuat transaksi baru. Data Anda tetap aman, silakan berlangganan untuk melanjutkan.'
    default:
      return 'Masa coba belum dimulai. Pastikan email akun sudah terverifikasi.'
  }
}

/**
 * Info akses yang dikirim ke perangkat kasir lewat API sync. Perangkat memakai jam sendiri
 * terhadap graceEndsAt agar tetap berlaku saat offline.
 */
export type DeviceAccess = { state: AccessState; graceEndsAt: string | null; checkedAt: string }

export function toDeviceAccess(access: Access, now: Date = new Date()): DeviceAccess {
  return { state: access.state, graceEndsAt: access.graceEndsAt, checkedAt: now.toISOString() }
}

/**
 * Apakah perangkat kasir boleh membuat transaksi baru.
 * - Belum pernah menerima info akses (kasir belum tersambung) -> boleh.
 * - 'none' -> boleh (server belum bisa memulai trial; jangan hentikan usaha karena hal itu).
 * - Selain itu dibatasi bila server menyatakan expired ATAU jam perangkat melewati graceEndsAt.
 *   Jam perangkat yang mundur dibatasi oleh checkedAt: waktu efektif tidak pernah < checkedAt.
 */
export function deviceCanSell(device: DeviceAccess | null | undefined, now: Date = new Date()): boolean {
  if (!device || device.state === 'none') return true
  if (device.state === 'expired') return false
  const grace = time(device.graceEndsAt)
  if (grace === null) return true
  const checked = time(device.checkedAt) ?? 0
  return Math.max(now.getTime(), checked) < grace
}
