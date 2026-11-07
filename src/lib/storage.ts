import {
  Product,
  Category,
  Cashier,
  Transaction,
  Shift,
  StoreSettings,
  CartItem,
} from '../types';
import {
  INITIAL_CATEGORIES,
  INITIAL_PRODUCTS,
  INITIAL_CASHIERS,
  INITIAL_STORE_SETTINGS,
} from '../data/initialData';
import { migrateCashierPins } from './security';
import { getExpectedDrawerCash, toLocalDateKey } from './reports';

const STORAGE_KEYS = {
  PRODUCTS: 'warkop_pos_products',
  CATEGORIES: 'warkop_pos_categories',
  CASHIERS: 'warkop_pos_cashiers',
  ACTIVE_CASHIER_ID: 'warkop_pos_active_cashier_id',
  SETTINGS: 'warkop_pos_settings',
  TRANSACTIONS: 'warkop_pos_transactions',
  ACTIVE_SHIFT: 'warkop_pos_active_shift',
  SHIFT_HISTORY: 'warkop_pos_shift_history',
  RECEIPT_SEQ: 'warkop_pos_receipt_seq',
  DEVICE_CODE: 'warkop_pos_device_code',
};

// Custom event name for instant reactive updates
export const POS_UPDATE_EVENT = 'warkop_pos_data_updated';

function notifyUpdate() {
  if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
    window.dispatchEvent(new CustomEvent(POS_UPDATE_EVENT));
  }
}

function readJSON<T>(key: string, fallback: T): T {
  try {
    const data = localStorage.getItem(key);
    return data ? (JSON.parse(data) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
}

// Format IDR Helper
export function formatIDR(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(amount);
}

// -------------------------------------------------------------
// RECEIPT NUMBER
// -------------------------------------------------------------

/** Kode perangkat 3 karakter, dibuat sekali, agar nomor struk antar-perangkat tidak bentrok. */
export function getDeviceCode(): string {
  let code = localStorage.getItem(STORAGE_KEYS.DEVICE_CODE);
  if (!code) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    code = Array.from({ length: 3 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    localStorage.setItem(STORAGE_KEYS.DEVICE_CODE, code);
  }
  return code;
}

/**
 * Nomor struk berurutan per hari berdasarkan tanggal LOKAL (WIB), mis. WKP-20261107-K7Q-0001.
 */
export function generateReceiptId(now: Date = new Date()): string {
  const dateKey = toLocalDateKey(now);
  const seqState = readJSON<{ date: string; seq: number }>(STORAGE_KEYS.RECEIPT_SEQ, {
    date: dateKey,
    seq: 0,
  });
  const seq = seqState.date === dateKey ? seqState.seq + 1 : 1;
  writeJSON(STORAGE_KEYS.RECEIPT_SEQ, { date: dateKey, seq });

  return `WKP-${dateKey.replace(/-/g, '')}-${getDeviceCode()}-${String(seq).padStart(4, '0')}`;
}

// -------------------------------------------------------------
// INIT & MIGRATION
// -------------------------------------------------------------

let migrationDone = false;

/** Hanya untuk unit test. */
export function __resetStorageStateForTests(): void {
  migrationDone = false;
}

function runMigrations(): void {
  if (migrationDone) return;
  migrationDone = true;

  const cashiers = readJSON<Cashier[]>(STORAGE_KEYS.CASHIERS, []);
  let changed = migrateCashierPins(cashiers);

  // Pastikan selalu ada minimal satu Owner agar menu Pengaturan/Kelola Kasir bisa diakses.
  if (cashiers.length > 0 && !cashiers.some((c) => c.role === 'Owner')) {
    const promote = cashiers.find((c) => c.role === 'Supervisor') || cashiers[0];
    promote.role = 'Owner';
    changed = true;
  }
  if (changed) writeJSON(STORAGE_KEYS.CASHIERS, cashiers);

  // Tandai transaksi bon lama yang belum punya status
  const txs = readJSON<Transaction[]>(STORAGE_KEYS.TRANSACTIONS, []);
  let txChanged = false;
  txs.forEach((t) => {
    if (t.paymentType === 'hutang' && !t.debtStatus) {
      t.debtStatus = 'unpaid';
      txChanged = true;
    }
  });
  if (txChanged) writeJSON(STORAGE_KEYS.TRANSACTIONS, txs);
}

// Initialize LocalStorage with default seeds if empty
export function initLocalStorage(): void {
  if (typeof window === 'undefined' && typeof localStorage === 'undefined') return;

  if (!localStorage.getItem(STORAGE_KEYS.PRODUCTS)) {
    writeJSON(STORAGE_KEYS.PRODUCTS, INITIAL_PRODUCTS);
  }
  if (!localStorage.getItem(STORAGE_KEYS.CATEGORIES)) {
    writeJSON(STORAGE_KEYS.CATEGORIES, INITIAL_CATEGORIES);
  }
  if (!localStorage.getItem(STORAGE_KEYS.CASHIERS)) {
    writeJSON(STORAGE_KEYS.CASHIERS, INITIAL_CASHIERS);
  }
  if (!localStorage.getItem(STORAGE_KEYS.ACTIVE_CASHIER_ID)) {
    localStorage.setItem(STORAGE_KEYS.ACTIVE_CASHIER_ID, INITIAL_CASHIERS[0].id);
  }
  if (!localStorage.getItem(STORAGE_KEYS.SETTINGS)) {
    writeJSON(STORAGE_KEYS.SETTINGS, INITIAL_STORE_SETTINGS);
  }
  if (!localStorage.getItem(STORAGE_KEYS.TRANSACTIONS)) {
    writeJSON(STORAGE_KEYS.TRANSACTIONS, []);
  }
  // Catatan: shift TIDAK dibuka otomatis. Kasir harus membuka shift & mengisi modal awal sendiri.

  runMigrations();
}

// -------------------------------------------------------------
// PRODUCTS & CATEGORIES
// -------------------------------------------------------------

export function getProducts(): Product[] {
  initLocalStorage();
  return readJSON(STORAGE_KEYS.PRODUCTS, INITIAL_PRODUCTS);
}

export function saveProducts(products: Product[]): void {
  writeJSON(STORAGE_KEYS.PRODUCTS, products);
  notifyUpdate();
}

export function getCategories(): Category[] {
  initLocalStorage();
  return readJSON(STORAGE_KEYS.CATEGORIES, INITIAL_CATEGORIES);
}

export function saveCategories(categories: Category[]): void {
  writeJSON(STORAGE_KEYS.CATEGORIES, categories);
  notifyUpdate();
}

/**
 * Cek apakah jumlah di keranjang melebihi stok. Produk dengan stok -1 dianggap tak terbatas.
 * Mengembalikan daftar pesan error (kosong jika aman).
 */
export function getStockIssues(items: Pick<CartItem, 'product' | 'quantity'>[], products: Product[]): string[] {
  const qtyByProduct = new Map<string, number>();
  items.forEach((it) => {
    qtyByProduct.set(it.product.id, (qtyByProduct.get(it.product.id) ?? 0) + it.quantity);
  });

  const issues: string[] = [];
  qtyByProduct.forEach((qty, productId) => {
    const p = products.find((x) => x.id === productId);
    if (!p) {
      issues.push(`Produk sudah tidak ada di katalog.`);
      return;
    }
    if (!p.isAvailable) {
      issues.push(`${p.name} sedang tidak tersedia.`);
      return;
    }
    if (p.stock >= 0 && qty > p.stock) {
      issues.push(`Stok ${p.name} tinggal ${p.stock}, di keranjang ${qty}.`);
    }
  });
  return issues;
}

// -------------------------------------------------------------
// CASHIERS
// -------------------------------------------------------------

export function getCashiers(): Cashier[] {
  initLocalStorage();
  return readJSON(STORAGE_KEYS.CASHIERS, INITIAL_CASHIERS);
}

export function saveCashiers(cashiers: Cashier[]): void {
  writeJSON(STORAGE_KEYS.CASHIERS, cashiers);
  notifyUpdate();
}

export function getActiveCashier(): Cashier {
  const cashiers = getCashiers();
  const activeId = localStorage.getItem(STORAGE_KEYS.ACTIVE_CASHIER_ID);
  const found = cashiers.find((c) => c.id === activeId);
  return found || cashiers[0];
}

export function setActiveCashier(cashierId: string): void {
  localStorage.setItem(STORAGE_KEYS.ACTIVE_CASHIER_ID, cashierId);

  // Shift yang sedang berjalan diserahterimakan ke kasir baru
  const shift = getActiveShift();
  const targetCashier = getCashiers().find((c) => c.id === cashierId);
  if (targetCashier && shift && shift.status === 'open' && shift.cashierId !== cashierId) {
    shift.cashierId = targetCashier.id;
    shift.cashierName = targetCashier.name;
    saveActiveShift(shift);
  }

  notifyUpdate();
}

// -------------------------------------------------------------
// SETTINGS
// -------------------------------------------------------------

export function getStoreSettings(): StoreSettings {
  initLocalStorage();
  return readJSON(STORAGE_KEYS.SETTINGS, INITIAL_STORE_SETTINGS);
}

export function saveStoreSettings(settings: StoreSettings): void {
  writeJSON(STORAGE_KEYS.SETTINGS, settings);
  notifyUpdate();
}

// -------------------------------------------------------------
// SHIFTS
// -------------------------------------------------------------

export function getActiveShift(): Shift | null {
  initLocalStorage();
  const shift = readJSON<Shift | null>(STORAGE_KEYS.ACTIVE_SHIFT, null);
  return shift && shift.status === 'open' ? shift : null;
}

export function saveActiveShift(shift: Shift): void {
  writeJSON(STORAGE_KEYS.ACTIVE_SHIFT, shift);
  notifyUpdate();
}

export function getShiftHistory(): Shift[] {
  initLocalStorage();
  return readJSON<Shift[]>(STORAGE_KEYS.SHIFT_HISTORY, []);
}

export function startNewShift(cashierId: string, startingCash: number): Shift {
  if (getActiveShift()) {
    throw new Error('Masih ada shift yang terbuka. Tutup shift tersebut terlebih dahulu.');
  }
  const cashiers = getCashiers();
  const cashier = cashiers.find((c) => c.id === cashierId) || cashiers[0];

  const newShift: Shift = {
    id: `SHIFT-${Date.now()}`,
    cashierId: cashier.id,
    cashierName: cashier.name,
    startTime: new Date().toISOString(),
    startingCash: Math.max(0, startingCash || 0),
    totalSalesCash: 0,
    totalSalesNonCash: 0,
    totalSalesDebt: 0,
    debtCollectedCash: 0,
    debtCollectedNonCash: 0,
    totalTransactions: 0,
    status: 'open',
  };

  saveActiveShift(newShift);
  setActiveCashier(cashier.id);
  return newShift;
}

export function closeCurrentShift(endingCashActual: number): Shift | null {
  const currentShift = getActiveShift();
  if (!currentShift) return null;

  currentShift.status = 'closed';
  currentShift.endTime = new Date().toISOString();
  currentShift.expectedCash = getExpectedDrawerCash(currentShift);
  currentShift.endingCashActual = endingCashActual;

  const history = getShiftHistory();
  history.unshift(currentShift);
  writeJSON(STORAGE_KEYS.SHIFT_HISTORY, history);

  localStorage.removeItem(STORAGE_KEYS.ACTIVE_SHIFT);
  notifyUpdate();
  return currentShift;
}

// -------------------------------------------------------------
// TRANSACTIONS
// -------------------------------------------------------------

export function getTransactions(): Transaction[] {
  initLocalStorage();
  return readJSON<Transaction[]>(STORAGE_KEYS.TRANSACTIONS, []);
}

function writeTransactions(txs: Transaction[]): void {
  writeJSON(STORAGE_KEYS.TRANSACTIONS, txs);
}

/**
 * Simpan transaksi baru. Melempar Error jika tidak ada shift terbuka atau stok tidak cukup,
 * supaya tidak ada penjualan yang lolos dari rekap shift.
 */
export function saveTransaction(tx: Transaction): Transaction {
  const shift = getActiveShift();
  if (!shift) {
    throw new Error('Belum ada shift yang dibuka. Buka shift terlebih dahulu sebelum bertransaksi.');
  }

  const products = getProducts();
  const issues = getStockIssues(tx.items, products);
  if (issues.length > 0) {
    throw new Error(issues.join('\n'));
  }

  const saved: Transaction = {
    ...tx,
    shiftId: shift.id,
    isSynced: false,
    ...(tx.paymentType === 'hutang' ? { debtStatus: 'unpaid' as const } : {}),
  };

  const transactions = getTransactions();
  transactions.unshift(saved); // Newest first
  writeTransactions(transactions);

  // Kurangi stok
  saved.items.forEach((item) => {
    const target = products.find((p) => p.id === item.product.id);
    if (target && target.stock >= 0) {
      target.stock = Math.max(0, target.stock - item.quantity);
    }
  });
  writeJSON(STORAGE_KEYS.PRODUCTS, products);

  // Rekap shift
  if (saved.paymentType === 'tunai') {
    shift.totalSalesCash += saved.grandTotal;
  } else if (saved.paymentType === 'hutang') {
    shift.totalSalesDebt = (shift.totalSalesDebt ?? 0) + saved.grandTotal;
  } else {
    shift.totalSalesNonCash += saved.grandTotal;
  }
  shift.totalTransactions += 1;
  writeJSON(STORAGE_KEYS.ACTIVE_SHIFT, shift);

  notifyUpdate();
  return saved;
}

export function cancelTransaction(
  txId: string,
  reason: string,
  cancelledBy?: string
): { ok: boolean; message: string } {
  const transactions = getTransactions();
  const tx = transactions.find((t) => t.id === txId);
  if (!tx) return { ok: false, message: 'Transaksi tidak ditemukan.' };
  if (tx.status === 'cancelled') return { ok: false, message: 'Transaksi sudah dibatalkan.' };
  if (tx.paymentType === 'hutang' && tx.debtStatus === 'paid') {
    return {
      ok: false,
      message: 'Bon ini sudah dilunasi. Pembatalan tidak bisa dilakukan karena uang pelunasan sudah masuk shift.',
    };
  }

  tx.status = 'cancelled';
  tx.cancelReason = reason;
  tx.cancelledAt = new Date().toISOString();
  tx.cancelledBy = cancelledBy;
  tx.isSynced = false; // kirim ulang status batal ke server
  writeTransactions(transactions);

  // Kembalikan stok
  const products = getProducts();
  tx.items.forEach((item) => {
    const target = products.find((p) => p.id === item.product.id);
    if (target && target.stock >= 0) {
      target.stock += item.quantity;
    }
  });
  writeJSON(STORAGE_KEYS.PRODUCTS, products);

  // Koreksi rekap shift jika transaksi berasal dari shift yang masih terbuka
  const shift = getActiveShift();
  let message = 'Transaksi berhasil dibatalkan.';
  if (shift && tx.shiftId === shift.id) {
    if (tx.paymentType === 'tunai') {
      shift.totalSalesCash = Math.max(0, shift.totalSalesCash - tx.grandTotal);
      message += ` Kembalikan uang ${formatIDR(tx.grandTotal)} dari laci.`;
    } else if (tx.paymentType === 'hutang') {
      shift.totalSalesDebt = Math.max(0, (shift.totalSalesDebt ?? 0) - tx.grandTotal);
    } else {
      shift.totalSalesNonCash = Math.max(0, shift.totalSalesNonCash - tx.grandTotal);
    }
    shift.totalTransactions = Math.max(0, shift.totalTransactions - 1);
    writeJSON(STORAGE_KEYS.ACTIVE_SHIFT, shift);
  } else if (tx.shiftId) {
    message += ' Catatan: transaksi berasal dari shift yang sudah ditutup, rekap shift lama tidak diubah.';
  }

  notifyUpdate();
  return { ok: true, message };
}

/** Lunasi bon/hutang. Uang pelunasan dicatat di shift yang sedang terbuka. */
export function payDebt(txId: string, method: 'tunai' | 'nontunai'): { ok: boolean; message: string } {
  const shift = getActiveShift();
  if (!shift) return { ok: false, message: 'Buka shift terlebih dahulu untuk menerima pelunasan.' };

  const transactions = getTransactions();
  const tx = transactions.find((t) => t.id === txId);
  if (!tx || tx.paymentType !== 'hutang') return { ok: false, message: 'Transaksi bon tidak ditemukan.' };
  if (tx.status !== 'completed') return { ok: false, message: 'Transaksi sudah dibatalkan.' };
  if (tx.debtStatus === 'paid') return { ok: false, message: 'Bon ini sudah lunas.' };

  tx.debtStatus = 'paid';
  tx.debtPaidAt = new Date().toISOString();
  tx.debtPaidMethod = method;
  tx.debtPaidShiftId = shift.id;
  tx.isSynced = false;
  writeTransactions(transactions);

  if (method === 'tunai') {
    shift.debtCollectedCash = (shift.debtCollectedCash ?? 0) + tx.grandTotal;
  } else {
    shift.debtCollectedNonCash = (shift.debtCollectedNonCash ?? 0) + tx.grandTotal;
  }
  writeJSON(STORAGE_KEYS.ACTIVE_SHIFT, shift);

  notifyUpdate();
  return { ok: true, message: `Bon ${tx.customerName || ''} sebesar ${formatIDR(tx.grandTotal)} lunas.` };
}

// -------------------------------------------------------------
// RESET, BACKUP & RESTORE
// -------------------------------------------------------------

export function resetDataToDefaults(): void {
  writeJSON(STORAGE_KEYS.PRODUCTS, INITIAL_PRODUCTS);
  writeJSON(STORAGE_KEYS.CATEGORIES, INITIAL_CATEGORIES);
  writeJSON(STORAGE_KEYS.CASHIERS, INITIAL_CASHIERS);
  localStorage.setItem(STORAGE_KEYS.ACTIVE_CASHIER_ID, INITIAL_CASHIERS[0].id);
  writeJSON(STORAGE_KEYS.SETTINGS, INITIAL_STORE_SETTINGS);
  writeJSON(STORAGE_KEYS.TRANSACTIONS, []);
  writeJSON(STORAGE_KEYS.SHIFT_HISTORY, []);
  localStorage.removeItem(STORAGE_KEYS.ACTIVE_SHIFT);
  localStorage.removeItem(STORAGE_KEYS.RECEIPT_SEQ);

  migrationDone = false;
  runMigrations();
  notifyUpdate();
}

export function exportDataAsJSON(): string {
  // API key sync sengaja TIDAK ikut di file backup agar tidak bocor jika file dibagikan.
  const { syncApiKey: _omit, ...settingsWithoutSecret } = getStoreSettings();
  const backup = {
    version: '2.0',
    exportDate: new Date().toISOString(),
    products: getProducts(),
    categories: getCategories(),
    cashiers: getCashiers(),
    settings: settingsWithoutSecret,
    transactions: getTransactions(),
    shift: getActiveShift(),
    shiftHistory: getShiftHistory(),
  };
  return JSON.stringify(backup, null, 2);
}

export function importDataFromJSON(jsonString: string): { ok: boolean; message: string } {
  let data: any;
  try {
    data = JSON.parse(jsonString);
  } catch {
    return { ok: false, message: 'File bukan JSON yang valid.' };
  }

  if (!data || typeof data !== 'object') return { ok: false, message: 'Format backup tidak dikenali.' };

  const arrayFields = ['products', 'categories', 'cashiers', 'transactions', 'shiftHistory'] as const;
  for (const f of arrayFields) {
    if (data[f] !== undefined && !Array.isArray(data[f])) {
      return { ok: false, message: `Field "${f}" pada backup harus berupa array.` };
    }
  }
  if (!data.products && !data.transactions && !data.cashiers) {
    return { ok: false, message: 'Backup tidak berisi data produk, kasir, maupun transaksi.' };
  }
  if (data.cashiers && data.cashiers.length === 0) {
    return { ok: false, message: 'Backup tidak memiliki kasir sama sekali.' };
  }

  if (data.products) writeJSON(STORAGE_KEYS.PRODUCTS, data.products);
  if (data.categories) writeJSON(STORAGE_KEYS.CATEGORIES, data.categories);
  if (data.cashiers) writeJSON(STORAGE_KEYS.CASHIERS, data.cashiers);
  if (data.settings) {
    // Pertahankan API key yang ada di perangkat ini
    const current = getStoreSettings();
    writeJSON(STORAGE_KEYS.SETTINGS, { ...data.settings, syncApiKey: current.syncApiKey });
  }
  if (data.transactions) writeJSON(STORAGE_KEYS.TRANSACTIONS, data.transactions);
  if (data.shiftHistory) writeJSON(STORAGE_KEYS.SHIFT_HISTORY, data.shiftHistory);
  if (data.shift && data.shift.status === 'open') {
    writeJSON(STORAGE_KEYS.ACTIVE_SHIFT, data.shift);
  } else {
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_SHIFT);
  }

  migrationDone = false;
  runMigrations();
  notifyUpdate();
  return { ok: true, message: 'Import data berhasil.' };
}

// -------------------------------------------------------------
// CLOUD SYNC
// -------------------------------------------------------------

export function getUnsyncedTransactions(): Transaction[] {
  return getTransactions().filter((t) => !t.isSynced);
}

function syncFingerprint(t: Transaction): string {
  const { isSynced: _a, syncedAt: _b, ...rest } = t;
  return JSON.stringify(rest);
}

/**
 * Tandai transaksi sebagai tersinkron. Jika `sent` diberikan, hanya transaksi yang isinya
 * tidak berubah sejak dikirim yang ditandai (mis. dibatalkan saat request sync sedang berjalan).
 */
export function markTransactionsAsSynced(txIds: string[], sent?: Transaction[]): void {
  const idSet = new Set(txIds);
  const sentPrints = new Map((sent ?? []).map((t) => [t.id, syncFingerprint(t)]));
  const now = new Date().toISOString();

  const updated = getTransactions().map((t) => {
    if (!idSet.has(t.id)) return t;
    if (sent && sentPrints.get(t.id) !== syncFingerprint(t)) return t;
    return { ...t, isSynced: true, syncedAt: now };
  });
  writeTransactions(updated);

  const settings = getStoreSettings();
  settings.lastSyncedAt = now;
  settings.lastSyncError = undefined;
  writeJSON(STORAGE_KEYS.SETTINGS, settings);

  notifyUpdate();
}

function recordSyncError(message: string): void {
  const settings = getStoreSettings();
  settings.lastSyncError = message;
  writeJSON(STORAGE_KEYS.SETTINGS, settings);
  notifyUpdate();
}

let syncInFlight: Promise<{ success: boolean; message: string; syncedCount: number }> | null = null;

export function performCloudSync(): Promise<{
  success: boolean;
  message: string;
  syncedCount: number;
}> {
  // Cegah dua sync berjalan bersamaan (manual + otomatis)
  if (syncInFlight) return syncInFlight;
  syncInFlight = doCloudSync().finally(() => {
    syncInFlight = null;
  });
  return syncInFlight;
}

async function doCloudSync(): Promise<{ success: boolean; message: string; syncedCount: number }> {
  const settings = getStoreSettings();
  if (!settings.syncApiUrl || !settings.syncApiUrl.trim()) {
    return {
      success: false,
      message: 'URL API Sync belum dikonfigurasi di Pengaturan Toko.',
      syncedCount: 0,
    };
  }

  const unsyncedTx = getUnsyncedTransactions();
  if (unsyncedTx.length === 0) {
    return {
      success: true,
      message: 'Semua transaksi sudah tersinkronisasi.',
      syncedCount: 0,
    };
  }

  try {
    const payload = {
      storeName: settings.storeName,
      deviceCode: getDeviceCode(),
      timestamp: new Date().toISOString(),
      transactions: unsyncedTx,
      products: getProducts(),
      shift: getActiveShift(),
    };

    const res = await fetch(settings.syncApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(settings.syncApiKey
          ? { 'x-api-key': settings.syncApiKey, Authorization: `Bearer ${settings.syncApiKey}` }
          : {}),
      },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      markTransactionsAsSynced(
        unsyncedTx.map((t) => t.id),
        unsyncedTx
      );
      return {
        success: true,
        message: `Berhasil menyinkronkan ${unsyncedTx.length} transaksi.`,
        syncedCount: unsyncedTx.length,
      };
    }

    const errorText = await res.text().catch(() => '');
    const message = `Gagal Sync (HTTP ${res.status}): ${errorText || 'Respon server tidak valid'}`;
    recordSyncError(message);
    return { success: false, message, syncedCount: 0 };
  } catch (err: any) {
    console.error('Cloud Sync error:', err);
    const message = `Gagal terhubung ke server: ${err?.message || 'Koneksi jaringan terputus'}`;
    recordSyncError(message);
    return { success: false, message, syncedCount: 0 };
  }
}

/** Sync otomatis di latar belakang jika diaktifkan, online, dan ada data yang belum terkirim. */
export function maybeAutoSync(): void {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  const settings = getStoreSettings();
  if (settings.autoSyncOnline === false) return;
  if (!settings.syncApiUrl || !settings.syncApiUrl.trim()) return;
  if (getUnsyncedTransactions().length === 0) return;
  void performCloudSync();
}

// -------------------------------------------------------------
// POSTGRESQL EXPORT
// -------------------------------------------------------------

/**
 * Generates ready-to-execute PostgreSQL DDL and INSERT SQL statements
 * for direct import into PostgreSQL database server.
 */
export function generatePostgresSqlScript(): string {
  const transactions = getTransactions();
  const products = getProducts();
  const settings = getStoreSettings();

  let sql = `-- ==========================================================\n`;
  sql += `-- POSTGRESQL SCHEMA & DATA DUMP FOR WARKOP POS\n`;
  sql += `-- Generated: ${new Date().toISOString()}\n`;
  sql += `-- Store: ${settings.storeName}\n`;
  sql += `-- ==========================================================\n\n`;

  // Schema creation
  sql += `CREATE TABLE IF NOT EXISTS products (\n`;
  sql += `  id VARCHAR(50) PRIMARY KEY,\n`;
  sql += `  name VARCHAR(255) NOT NULL,\n`;
  sql += `  category_id VARCHAR(50) NOT NULL,\n`;
  sql += `  price NUMERIC(12, 2) NOT NULL,\n`;
  sql += `  cost_price NUMERIC(12, 2) DEFAULT 0,\n`;
  sql += `  stock INT DEFAULT -1,\n`;
  sql += `  is_available BOOLEAN DEFAULT TRUE\n`;
  sql += `);\n\n`;

  sql += `CREATE TABLE IF NOT EXISTS transactions (\n`;
  sql += `  id VARCHAR(100) PRIMARY KEY,\n`;
  sql += `  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,\n`;
  sql += `  cashier_name VARCHAR(100),\n`;
  sql += `  order_type VARCHAR(50),\n`;
  sql += `  customer_name VARCHAR(100),\n`;
  sql += `  subtotal NUMERIC(12, 2),\n`;
  sql += `  discount_amount NUMERIC(12, 2),\n`;
  sql += `  tax_amount NUMERIC(12, 2),\n`;
  sql += `  grand_total NUMERIC(12, 2),\n`;
  sql += `  payment_type VARCHAR(50),\n`;
  sql += `  amount_paid NUMERIC(12, 2),\n`;
  sql += `  change_amount NUMERIC(12, 2),\n`;
  sql += `  status VARCHAR(20),\n`;
  sql += `  items_json JSONB\n`;
  sql += `);\n\n`;

  // Insert products
  if (products.length > 0) {
    sql += `-- Products Data\n`;
    products.forEach((p) => {
      const cleanName = p.name.replace(/'/g, "''");
      sql += `INSERT INTO products (id, name, category_id, price, cost_price, stock, is_available)\n`;
      sql += `VALUES ('${p.id}', '${cleanName}', '${p.categoryId}', ${p.price}, ${p.costPrice || 0}, ${p.stock}, ${p.isAvailable})\n`;
      sql += `ON CONFLICT (id) DO UPDATE SET price = EXCLUDED.price, stock = EXCLUDED.stock;\n\n`;
    });
  }

  // Insert transactions
  if (transactions.length > 0) {
    sql += `-- Transactions Data\n`;
    transactions.forEach((tx) => {
      const cleanCashier = tx.cashierName.replace(/'/g, "''");
      const cleanCust = (tx.customerName || 'Umum').replace(/'/g, "''");
      const itemsJson = JSON.stringify(tx.items).replace(/'/g, "''");

      sql += `INSERT INTO transactions (id, created_at, cashier_name, order_type, customer_name, subtotal, discount_amount, tax_amount, grand_total, payment_type, amount_paid, change_amount, status, items_json)\n`;
      sql += `VALUES ('${tx.id}', '${tx.timestamp}', '${cleanCashier}', '${tx.orderType}', '${cleanCust}', ${tx.subtotal}, ${tx.discountAmount}, ${tx.taxAmount}, ${tx.grandTotal}, '${tx.paymentType}', ${tx.amountPaid}, ${tx.changeAmount}, '${tx.status}', '${itemsJson}')\n`;
      sql += `ON CONFLICT (id) DO NOTHING;\n\n`;
    });
  }

  return sql;
}
