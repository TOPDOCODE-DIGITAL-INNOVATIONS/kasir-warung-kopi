import { TZ } from './format'

export const BACKUP_DATASETS = [
  { id: 'businesses', label: 'Cabang', description: 'Identitas cabang, alamat, dan informasi sinkronisasi.', dateLabel: 'Seluruh data master' },
  { id: 'pos_config', label: 'Master Kasir', description: 'Menu, kategori, daftar kasir, dan pengaturan toko.', dateLabel: 'Seluruh data master' },
  { id: 'products', label: 'Produk', description: 'Harga, modal, stok, opsi produk, dan data lengkap produk.', dateLabel: 'Seluruh data master' },
  { id: 'transactions', label: 'Transaksi', description: 'Item, pembayaran, diskon, pajak, pembatalan, dan bon.', dateLabel: 'Tanggal transaksi' },
  { id: 'expenses', label: 'Pengeluaran', description: 'Pengeluaran harian dan bulanan beserta informasi shift.', dateLabel: 'Tanggal / bulan pengeluaran' },
  { id: 'shifts', label: 'Shift', description: 'Kas awal, kas akhir, penjualan, dan riwayat shift.', dateLabel: 'Tanggal mulai shift' },
  { id: 'manual_summaries', label: 'Rekap Manual', description: 'Penjualan dan pengeluaran lama yang diinput owner.', dateLabel: 'Tanggal / bulan rekap' },
  { id: 'book_period_rules', label: 'Aturan Buku', description: 'Tanggal buka buku dan riwayat mulai berlakunya aturan.', dateLabel: 'Tanggal mulai berlaku' },
  { id: 'deleted_records', label: 'Riwayat Penghapusan', description: 'Catatan penghapusan data untuk sinkronisasi perangkat.', dateLabel: 'Tanggal penghapusan' },
] as const

export type BackupDataset = (typeof BACKUP_DATASETS)[number]['id']
export type BackupFormat = 'json' | 'csv'
export type BackupFilters = { businessId: string | null; start: string; end: string }
export type BackupRow = Record<string, unknown>
export const BACKUP_TIMEZONE = TZ

export const BACKUP_COLUMNS: Record<BackupDataset, string[]> = {
  businesses: ['id', 'owner_id', 'name', 'address', 'created_at', 'last_synced_at', 'last_device_code'],
  pos_config: ['business_id', 'pos_config', 'pos_config_updated_at'],
  products: ['business_id', 'id', 'inventory_id', 'owner_id', 'sku', 'name', 'description', 'base_unit_id', 'can_buy', 'can_sell', 'is_active', 'pos_managed', 'pos_sync_enabled', 'cost_source', 'stock_mode', 'min_stock', 'category_id', 'price', 'cost_price', 'stock', 'is_available', 'raw', 'created_at', 'updated_at', 'synced_at'],
  transactions: ['business_id', 'id', 'created_at', 'device_code', 'shift_id', 'cashier_id', 'cashier_name', 'order_type', 'customer_name', 'customer_phone', 'items', 'subtotal', 'discount_amount', 'discount_reason', 'tax_amount', 'grand_total', 'payment_type', 'payment_detail', 'amount_paid', 'change_amount', 'overpay_amount', 'status', 'cancel_reason', 'cancelled_at', 'cancelled_by', 'debt_status', 'debt_paid_at', 'debt_paid_method', 'debt_paid_shift_id', 'notes', 'synced_at'],
  expenses: ['business_id', 'id', 'scope', 'date', 'category', 'amount', 'note', 'from_drawer', 'shift_id', 'created_by', 'created_at', 'synced_at'],
  shifts: ['business_id', 'id', 'cashier_id', 'cashier_name', 'start_time', 'end_time', 'starting_cash', 'ending_cash_actual', 'expected_cash', 'total_sales_cash', 'total_sales_non_cash', 'total_sales_debt', 'expenses_cash', 'total_transactions', 'status', 'raw', 'synced_at'],
  manual_summaries: ['id', 'business_id', 'period', 'date', 'sales', 'expenses', 'overpay', 'note', 'created_at', 'updated_at'],
  book_period_rules: ['id', 'business_id', 'start_day', 'effective_from', 'created_at'],
  deleted_records: ['business_id', 'kind', 'id', 'deleted_at'],
}

export function isBackupDataset(value: string): value is BackupDataset {
  return BACKUP_DATASETS.some((dataset) => dataset.id === value)
}

export function validateBackupFilters(filters: BackupFilters): string | null {
  for (const date of [filters.start, filters.end]) {
    if (!date) continue
    const parsed = new Date(`${date}T00:00:00Z`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < '0001-01-01' || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
      return 'Tanggal harus berupa tanggal yang valid.'
    }
  }
  if (filters.start && filters.end && filters.start > filters.end) {
    return 'Tanggal mulai harus sebelum atau sama dengan tanggal akhir.'
  }
  if (filters.businessId && !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(filters.businessId)) {
    return 'Pilihan cabang tidak valid.'
  }
  return null
}

/** Awal hari dashboard dalam UTC, termasuk batas akhir eksklusif hari berikutnya. */
export function backupDayBoundary(date: string, nextDay = false): string {
  const day = new Date(`${date}T00:00:00Z`)
  if (nextDay) day.setUTCDate(day.getUTCDate() + 1)
  const offset = new Intl.DateTimeFormat('en', { timeZone: TZ, timeZoneName: 'longOffset' })
    .formatToParts(day).find((part) => part.type === 'timeZoneName')?.value ?? 'GMT'
  const match = offset.match(/GMT([+-])(\d{2}):(\d{2})/)
  const minutes = match ? (Number(match[2]) * 60 + Number(match[3])) * (match[1] === '+' ? 1 : -1) : 0
  return new Date(day.getTime() - minutes * 60_000).toISOString()
}

export function csvLine(values: unknown[]): string {
  return values.map((value) => {
    if (value === null || value === undefined) return '""'
    let text = typeof value === 'object' ? JSON.stringify(value) : String(value)
    // Excel bisa mengeksekusi teks yang menyerupai formula saat membuka CSV.
    if (typeof value === 'string' && /^[\s\uFEFF]*[=+@-]|^[\t\r\n]/.test(text)) text = `'${text}`
    return `"${text.replace(/"/g, '""')}"`
  }).join(',') + '\r\n'
}
