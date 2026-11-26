/** Logika murni Gaji Pegawai: tanpa dependensi agar mudah dites. */

export type Employee = {
  id: string; name: string; job_title: string | null; base_salary: number | string
  pay_cycle: string; is_active: boolean; note: string | null
}

export type SalaryPayment = {
  id: string; employee_id: string; employee_name: string; period: string
  amount: number | string; paid_date: string; note: string | null; created_by: string | null
}

export type PayrollRow = { employee: Employee; payment: SalaryPayment | null }

export const MAX_AMOUNT = 999_999_999
const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/

export function isPeriod(value: unknown): value is string {
  return typeof value === 'string' && PERIOD_RE.test(value)
}

/** Bulan dari query string; jatuh ke bulan berjalan jika tidak valid. */
export function resolvePeriod(value: unknown, today: string): string {
  const raw = Array.isArray(value) ? value[0] : value
  return isPeriod(raw) ? raw : today.slice(0, 7)
}

export function shiftPeriod(period: string, delta: number): string {
  const [y, m] = period.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return d.toISOString().slice(0, 7)
}

const monthFmt = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' })
export function periodLabel(period: string): string {
  return monthFmt.format(new Date(`${period}-01T00:00:00Z`))
}

export function validDate(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(`${s}T00:00:00Z`))
    && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s
}

export function validAmount(n: number, { allowZero = false } = {}) {
  return Number.isFinite(n) && (allowZero ? n >= 0 : n > 0) && n <= MAX_AMOUNT && Math.abs(n * 100 - Math.round(n * 100)) < 1e-6
}

/** Validasi isian pegawai; melempar pesan yang siap ditampilkan. */
export function validateEmployee(input: { name: unknown; job_title: unknown; base_salary: number; note: unknown }) {
  const name = String(input.name ?? '').trim(), job_title = String(input.job_title ?? '').trim(), note = String(input.note ?? '').trim()
  if (!name || name.length > 100) throw new Error('Nama pegawai wajib diisi, maksimal 100 karakter.')
  if (job_title.length > 100) throw new Error('Jabatan maksimal 100 karakter.')
  if (note.length > 500) throw new Error('Catatan maksimal 500 karakter.')
  if (!validAmount(input.base_salary, { allowZero: true })) throw new Error('Gaji pokok harus 0 sampai Rp 999.999.999.')
  return { name, job_title: job_title || null, base_salary: input.base_salary, note: note || null }
}

/**
 * Baris pembayaran untuk satu periode: semua pegawai aktif, ditambah pegawai nonaktif
 * yang sudah dibayar pada periode itu (agar riwayat tetap terlihat).
 */
export function payrollRows(employees: Employee[], payments: SalaryPayment[]): PayrollRow[] {
  const byEmployee = new Map(payments.map(p => [p.employee_id, p]))
  return employees
    .filter(e => e.is_active || byEmployee.has(e.id))
    .map(employee => ({ employee, payment: byEmployee.get(employee.id) ?? null }))
    .sort((a, b) => Number(!!a.payment) - Number(!!b.payment) || a.employee.name.localeCompare(b.employee.name, 'id'))
}

export function summarize(rows: PayrollRow[]) {
  let paid = 0, paidCount = 0, estimate = 0, unpaidCount = 0
  for (const { employee, payment } of rows) {
    if (payment) { paid += Number(payment.amount); paidCount++ }
    else if (employee.is_active) { estimate += Number(employee.base_salary); unpaidCount++ }
  }
  return { paid, paidCount, unpaidCount, estimate }
}
