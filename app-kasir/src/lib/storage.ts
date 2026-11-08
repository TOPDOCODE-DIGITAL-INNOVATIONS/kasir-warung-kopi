import {
  Product,
  Category,
  Cashier,
  Transaction,
  Shift,
  StoreSettings,
  CartItem,
  Expense,
  DraftOrder,
  PaymentType,
  TransactionEditLog,
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
  EXPENSES: 'warkop_pos_expenses',
  /** ID pengeluaran yang sudah pernah terkirim lalu dihapus, agar server ikut menghapusnya */
  EXPENSES_DELETED: 'warkop_pos_expenses_deleted',
  /** Versi data master (menu/kasir/pengaturan) dari server yang sudah ada di perangkat ini */
  CONFIG_VERSION: 'warkop_pos_config_version',
  /** Waktu data master terakhir diubah di perangkat ini dan belum terkirim (kosong = tidak ada perubahan) */
  CONFIG_DIRTY_AT: 'warkop_pos_config_dirty_at',
  /** Perangkat baru dari link kasir: tunggu data master dari server, jangan kirim data bawaan */
  CONFIG_WAIT_REMOTE: 'warkop_pos_config_wait_remote',
  /** Ada perubahan shift yang belum terkirim (buka/tutup shift) */
  SHIFT_DIRTY_AT: 'warkop_pos_shift_dirty_at',
  /** Cursor tarik data per jenis: { tx, exp, shift, del } */
  PULL_CURSORS: 'warkop_pos_pull_cursors',
  PULL_INIT_DONE: 'warkop_pos_pull_init_done',
  /** Shift dari perangkat lain (untuk rekap closing harian) */
  REMOTE_SHIFTS: 'warkop_pos_remote_shifts',
  /** Draf pesanan / open bill (bayar nanti) */
  DRAFTS: 'warkop_pos_drafts',
  /** ID draf yang sudah pernah terkirim lalu dihapus/dibayar, agar perangkat lain ikut menghapusnya */
  DRAFTS_DELETED: 'warkop_pos_drafts_deleted',
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

function isQuotaError(err: unknown): boolean {
  return (
    err instanceof DOMException &&
    (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED' || err.code === 22)
  );
}

function writeJSON(key: string, value: unknown): void {
  const json = JSON.stringify(value);
  try {
    localStorage.setItem(key, json);
  } catch (err) {
    if (!isQuotaError(err)) throw err;
    // Penyimpanan penuh: buang transaksi lama yang sudah tersinkron, lalu coba sekali lagi.
    if (pruneSyncedTransactions(PRUNE_EMERGENCY_DAYS) > 0) {
      try {
        localStorage.setItem(key, json);
        return;
      } catch (retryErr) {
        if (!isQuotaError(retryErr)) throw retryErr;
      }
    }
    throw new Error(
      'Penyimpanan perangkat penuh. Sambungkan ke internet dan lakukan Sync agar transaksi lama bisa dibersihkan, ' +
        'atau unduh backup lalu hapus data lama.'
    );
  }
}

/** Transaksi tersinkron yang lebih tua dari ini dihapus dari perangkat (datanya tetap ada di dashboard). */
export const KEEP_SYNCED_DAYS = 62;
const PRUNE_EMERGENCY_DAYS = 7;

/**
 * Hapus dari perangkat transaksi yang SUDAH tersinkron dan lebih tua dari `days` hari.
 * Transaksi belum tersinkron dan bon yang belum lunas tidak pernah dihapus.
 * Mengembalikan jumlah transaksi yang dihapus.
 */
export function pruneSyncedTransactions(days: number = KEEP_SYNCED_DAYS, now: Date = new Date()): number {
  const cutoff = now.getTime() - days * 86400000;
  const all = readJSON<Transaction[]>(STORAGE_KEYS.TRANSACTIONS, []);
  const kept = all.filter(
    (t) =>
      !t.isSynced ||
      (t.paymentType === 'hutang' && t.debtStatus !== 'paid' && t.status !== 'cancelled') ||
      new Date(t.timestamp).getTime() >= cutoff
  );
  const removed = all.length - kept.length;
  if (removed > 0) localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(kept));
  return removed;
}

/** Simpan hanya data produk yang dibutuhkan struk/laporan, agar transaksi tidak memakan banyak ruang. */
function compactCartItems(items: CartItem[]): CartItem[] {
  return items.map((item) => {
    const { options: _o, description: _d, imageUrl: _i, colorBg: _c, ...product } = item.product;
    return { ...item, product };
  });
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
  pushBackoffUntil = 0;
}

function runMigrations(): void {
  if (migrationDone) return;
  migrationDone = true;

  const cashiers = readJSON<Cashier[]>(STORAGE_KEYS.CASHIERS, []);
  let changed = false;

  // Migrasi nama contoh lama (Budi/Siti/Agus) ke daftar tim terbaru (Fajar, Wulan, Melya, Widya)
  const legacyNames: Record<string, string> = {
    'Budi Santoso': 'Fajar',
    'Siti Rahma': 'Wulan',
    'Agus Warkop': 'Melya',
  };
  cashiers.forEach((c) => {
    if (legacyNames[c.name]) {
      c.name = legacyNames[c.name];
      changed = true;
    }
  });
  if (
    cashiers.some((c) => c.id === 'c-1' && c.name === 'Fajar') &&
    !cashiers.some((c) => c.id === 'c-4' || c.name.toLowerCase() === 'widya')
  ) {
    const widyaSeed = INITIAL_CASHIERS.find((c) => c.id === 'c-4');
    if (widyaSeed) {
      cashiers.push({ ...widyaSeed });
      changed = true;
    }
  }

  if (migrateCashierPins(cashiers)) {
    changed = true;
  }

  // Migrasi katalog contoh lama (Kopi Susu Gula Aren) & nama toko lama ke RUAS KOPI BALI
  const savedProducts = readJSON<Product[]>(STORAGE_KEYS.PRODUCTS, []);
  if (savedProducts.some((p) => p.id === 'p-1' && p.name === 'Kopi Susu Gula Aren')) {
    writeJSON(STORAGE_KEYS.PRODUCTS, INITIAL_PRODUCTS);
    writeJSON(STORAGE_KEYS.CATEGORIES, INITIAL_CATEGORIES);
  }
  const savedSettings = readJSON<StoreSettings | null>(STORAGE_KEYS.SETTINGS, null);
  if (savedSettings && savedSettings.storeName === 'WARKOP KOPI NUSANTARA') {
    writeJSON(STORAGE_KEYS.SETTINGS, {
      ...savedSettings,
      storeName: INITIAL_STORE_SETTINGS.storeName,
      storeTagline: INITIAL_STORE_SETTINGS.storeTagline,
      address: INITIAL_STORE_SETTINGS.address,
      receiptHeaderMsg: INITIAL_STORE_SETTINGS.receiptHeaderMsg,
      receiptFooterMsg: INITIAL_STORE_SETTINGS.receiptFooterMsg,
      qrisMerchantName: INITIAL_STORE_SETTINGS.qrisMerchantName,
    });
  }

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
  markConfigDirty();
  notifyUpdate();
}

export function getCategories(): Category[] {
  initLocalStorage();
  return readJSON(STORAGE_KEYS.CATEGORIES, INITIAL_CATEGORIES);
}

export function saveCategories(categories: Category[]): void {
  writeJSON(STORAGE_KEYS.CATEGORIES, categories);
  markConfigDirty();
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
  markConfigDirty();
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
  const prev = getStoreSettings();
  const next: StoreSettings = {
    ...settings,
    syncApiKey: settings.syncApiKey?.trim() || undefined,
    syncApiUrl: settings.syncApiUrl?.trim() || undefined,
  };
  const tokenChanged = (prev.syncApiKey ?? '').trim() !== (next.syncApiKey ?? '');
  writeJSON(STORAGE_KEYS.SETTINGS, tokenChanged ? { ...next, lastSyncError: undefined } : next);
  if (tokenChanged) {
    onSyncTokenChanged(false);
  } else if (JSON.stringify(sharedSettings(prev)) !== JSON.stringify(sharedSettings(next))) {
    markConfigDirty();
  }
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
  markShiftDirty();
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
    overpayCash: 0,
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
  markShiftDirty();
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

  const overpay = tx.paymentType === 'tunai' ? Math.max(0, Math.round(tx.overpayAmount ?? 0)) : 0;
  if (overpay > 0 && overpay > tx.amountPaid - tx.grandTotal) {
    throw new Error('Kelebihan tidak boleh lebih besar dari kembalian.');
  }

  const saved: Transaction = {
    ...tx,
    overpayAmount: overpay || undefined,
    items: compactCartItems(tx.items),
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
    if (overpay > 0) shift.overpayCash = (shift.overpayCash ?? 0) + overpay;
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
      const overpay = tx.overpayAmount ?? 0;
      if (overpay > 0) shift.overpayCash = Math.max(0, (shift.overpayCash ?? 0) - overpay);
      message += ` Kembalikan uang ${formatIDR(tx.grandTotal + overpay)} dari laci.`;
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
// KOREKSI (EDIT) TRANSAKSI
// -------------------------------------------------------------

export interface TransactionEditInput {
  items: CartItem[];
  /** Diskon nominal (Rp) */
  discountAmount: number;
  discountReason?: string;
  paymentType: PaymentType;
  paymentDetail?: string;
  /** Uang diterima, khusus tunai */
  amountPaid?: number;
  /** Kelebihan (kembalian diganti permen), khusus tunai */
  overpayAmount?: number;
  orderType: Transaction['orderType'];
  customerName?: string;
  customerPhone?: string;
  notes?: string;
}

/** Tambah (sign 1) / keluarkan (sign -1) kontribusi transaksi pada rekap shift. */
function applyTxToShift(shift: Shift, tx: Transaction, sign: 1 | -1): void {
  if (tx.paymentType === 'tunai') {
    shift.totalSalesCash = Math.max(0, shift.totalSalesCash + sign * tx.grandTotal);
    const overpay = tx.overpayAmount ?? 0;
    if (overpay > 0) shift.overpayCash = Math.max(0, (shift.overpayCash ?? 0) + sign * overpay);
  } else if (tx.paymentType === 'hutang') {
    shift.totalSalesDebt = Math.max(0, (shift.totalSalesDebt ?? 0) + sign * tx.grandTotal);
  } else {
    shift.totalSalesNonCash = Math.max(0, shift.totalSalesNonCash + sign * tx.grandTotal);
  }
}

/** Uang tunai yang masuk laci dari transaksi ini (penjualan tunai + kelebihan). */
function cashIn(tx: Transaction): number {
  return tx.paymentType === 'tunai' ? tx.grandTotal + (tx.overpayAmount ?? 0) : 0;
}

/**
 * Apakah nominal (item, diskon, pembayaran) transaksi boleh dikoreksi. Hanya transaksi dari shift
 * yang masih terbuka di perangkat ini, agar rekap kas shift tetap cocok dengan isi laci.
 */
export function canEditTransactionAmounts(tx: Transaction): { ok: boolean; reason?: string } {
  if (tx.status === 'cancelled') return { ok: false, reason: 'Transaksi sudah dibatalkan.' };
  if (tx.paymentType === 'hutang' && tx.debtStatus === 'paid') {
    return { ok: false, reason: 'Bon ini sudah dilunasi, nominalnya tidak bisa diubah.' };
  }
  const shift = getActiveShift();
  if (!shift || !tx.shiftId || tx.shiftId !== shift.id) {
    return {
      ok: false,
      reason:
        'Transaksi dari shift yang sudah ditutup (atau dari perangkat lain): hanya pelanggan, tipe order & catatan ' +
        'yang bisa dikoreksi. Untuk koreksi item/nominal, batalkan transaksi lalu buat transaksi baru.',
    };
  }
  return { ok: true };
}

function itemsPrint(items: CartItem[]): string {
  return JSON.stringify(
    items
      .map((i) => [i.product.id, i.quantity, i.unitPrice, i.selectedOptions.map((o) => o.choiceLabel).join('|'), i.notes ?? ''])
      .sort()
  );
}

function qtyByProduct(items: CartItem[]): Map<string, number> {
  const m = new Map<string, number>();
  items.forEach((i) => m.set(i.product.id, (m.get(i.product.id) ?? 0) + i.quantity));
  return m;
}

/**
 * Koreksi transaksi yang salah catat. Nomor struk & waktu tetap; stok dan rekap shift ikut
 * disesuaikan, dan perubahan dicatat di `editHistory` lalu dikirim ulang ke server.
 */
export function editTransaction(
  txId: string,
  input: TransactionEditInput,
  opts: { reason: string; editedBy: string }
): { ok: boolean; message: string; transaction?: Transaction } {
  const reason = opts.reason.trim();
  if (!reason) return { ok: false, message: 'Mohon isi alasan koreksi.' };

  const transactions = getTransactions();
  const idx = transactions.findIndex((t) => t.id === txId);
  if (idx < 0) return { ok: false, message: 'Transaksi tidak ditemukan.' };
  const old = transactions[idx];
  if (old.status === 'cancelled') return { ok: false, message: 'Transaksi yang dibatalkan tidak bisa dikoreksi.' };

  // Item & total
  const items = compactCartItems(
    input.items
      .map((i) => ({ ...i, quantity: Math.floor(i.quantity) }))
      .filter((i) => i.quantity > 0)
      .map((i) => ({ ...i, totalPrice: i.unitPrice * i.quantity }))
  );
  if (items.length === 0) {
    return { ok: false, message: 'Minimal harus ada 1 item. Untuk membatalkan semuanya, gunakan Batalkan Transaksi.' };
  }
  const subtotal = items.reduce((sum, i) => sum + i.totalPrice, 0);
  const discountAmount = Math.min(subtotal, Math.max(0, Math.round(input.discountAmount || 0)));
  const afterDiscount = subtotal - discountAmount;
  // Pakai tarif pajak transaksi aslinya, bukan pengaturan saat ini.
  const oldBase = old.subtotal - old.discountAmount;
  const taxRate = old.taxAmount > 0 && oldBase > 0 ? Math.round((old.taxAmount / oldBase) * 10000) / 10000 : 0;
  const taxAmount = Math.round(afterDiscount * taxRate);
  const grandTotal = afterDiscount + taxAmount;

  // Pembayaran
  const paymentType = input.paymentType;
  const customerName = input.customerName?.trim() || undefined;
  if (paymentType === 'hutang' && !customerName) {
    return { ok: false, message: 'Nama pelanggan wajib diisi untuk Bon / Hutang.' };
  }
  let amountPaid = grandTotal;
  let changeAmount = 0;
  let overpayAmount: number | undefined;
  if (paymentType === 'tunai') {
    amountPaid = Math.round(input.amountPaid ?? old.amountPaid);
    if (amountPaid < grandTotal) {
      return { ok: false, message: `Uang diterima (${formatIDR(amountPaid)}) kurang dari total ${formatIDR(grandTotal)}.` };
    }
    const overpay = Math.max(0, Math.round(input.overpayAmount ?? 0));
    if (overpay > amountPaid - grandTotal) return { ok: false, message: 'Kelebihan tidak boleh lebih besar dari kembalian.' };
    overpayAmount = overpay || undefined;
    changeAmount = amountPaid - grandTotal - overpay;
  }

  const updated: Transaction = {
    ...old,
    items,
    subtotal,
    discountAmount,
    discountReason: discountAmount > 0 ? input.discountReason?.trim() || old.discountReason : undefined,
    taxAmount,
    grandTotal,
    paymentType,
    paymentDetail: input.paymentDetail?.trim() || undefined,
    amountPaid,
    changeAmount,
    overpayAmount,
    orderType: input.orderType,
    customerName,
    customerPhone: input.customerPhone?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
  };
  if (paymentType === 'hutang') {
    updated.debtStatus = old.paymentType === 'hutang' ? old.debtStatus ?? 'unpaid' : 'unpaid';
  } else {
    delete updated.debtStatus;
    delete updated.debtPaidAt;
    delete updated.debtPaidMethod;
    delete updated.debtPaidShiftId;
  }

  const itemsChanged = itemsPrint(old.items) !== itemsPrint(items);
  const amountsChanged =
    itemsChanged ||
    old.discountAmount !== discountAmount ||
    old.grandTotal !== grandTotal ||
    old.paymentType !== paymentType ||
    old.amountPaid !== amountPaid ||
    (old.overpayAmount ?? 0) !== (overpayAmount ?? 0);

  // Ringkasan perubahan untuk audit
  const summary: string[] = [];
  if (old.grandTotal !== grandTotal) summary.push(`Total ${formatIDR(old.grandTotal)} → ${formatIDR(grandTotal)}`);
  if (itemsChanged) {
    const desc = (list: CartItem[]) => list.map((i) => `${i.quantity}x ${i.product.name}`).join(', ');
    summary.push(`Item: ${desc(old.items)} → ${desc(items)}`);
  }
  if (old.discountAmount !== discountAmount) summary.push(`Diskon ${formatIDR(old.discountAmount)} → ${formatIDR(discountAmount)}`);
  if (old.paymentType !== paymentType) summary.push(`Pembayaran ${old.paymentType} → ${paymentType}`);
  else if ((old.paymentDetail ?? '') !== (updated.paymentDetail ?? '')) summary.push('Detail pembayaran diubah');
  if (paymentType === 'tunai' && old.paymentType === 'tunai' && old.amountPaid !== amountPaid) {
    summary.push(`Uang diterima ${formatIDR(old.amountPaid)} → ${formatIDR(amountPaid)}`);
  }
  if ((old.overpayAmount ?? 0) !== (overpayAmount ?? 0)) {
    summary.push(`Kelebihan ${formatIDR(old.overpayAmount ?? 0)} → ${formatIDR(overpayAmount ?? 0)}`);
  }
  if (old.orderType !== updated.orderType) summary.push(`Order ${old.orderType} → ${updated.orderType}`);
  if ((old.customerName ?? '') !== (customerName ?? '')) {
    summary.push(`Pelanggan "${old.customerName ?? '-'}" → "${customerName ?? '-'}"`);
  }
  if ((old.customerPhone ?? '') !== (updated.customerPhone ?? '')) summary.push('No. HP diubah');
  if ((old.notes ?? '') !== (updated.notes ?? '')) summary.push('Catatan diubah');
  if (summary.length === 0) return { ok: false, message: 'Tidak ada perubahan.' };

  let shift: Shift | null = null;
  let products: Product[] | null = null;
  if (amountsChanged) {
    const allowed = canEditTransactionAmounts(old);
    if (!allowed.ok) return { ok: false, message: allowed.reason! };
    shift = getActiveShift()!;

    if (itemsChanged) {
      // Cek & sesuaikan stok berdasarkan selisih jumlah per produk.
      products = getProducts();
      const before = qtyByProduct(old.items);
      const after = qtyByProduct(items);
      const issues: string[] = [];
      after.forEach((qty, productId) => {
        const delta = qty - (before.get(productId) ?? 0);
        if (delta <= 0) return;
        const p = products!.find((x) => x.id === productId);
        const name = items.find((i) => i.product.id === productId)?.product.name ?? productId;
        if (!p) {
          if (!before.has(productId)) issues.push(`${name} sudah tidak ada di katalog.`);
          return;
        }
        if (!before.has(productId) && !p.isAvailable) issues.push(`${p.name} sedang tidak tersedia.`);
        else if (p.stock >= 0 && delta > p.stock) issues.push(`Stok ${p.name} tinggal ${p.stock}, perlu tambahan ${delta}.`);
      });
      if (issues.length) return { ok: false, message: issues.join('\n') };

      const productIds = new Set([...before.keys(), ...after.keys()]);
      productIds.forEach((productId) => {
        const delta = (after.get(productId) ?? 0) - (before.get(productId) ?? 0);
        const p = products!.find((x) => x.id === productId);
        if (delta !== 0 && p && p.stock >= 0) p.stock = Math.max(0, p.stock - delta);
      });
    }
  }

  const log: TransactionEditLog = {
    at: new Date().toISOString(),
    by: opts.editedBy,
    reason,
    summary: summary.join('; '),
    prevGrandTotal: old.grandTotal,
    prevPaymentType: old.paymentType,
  };
  updated.editHistory = [...(old.editHistory ?? []), log];
  updated.isSynced = false; // kirim ulang ke server
  delete updated.syncedAt;

  transactions[idx] = updated;
  writeTransactions(transactions);
  if (products) writeJSON(STORAGE_KEYS.PRODUCTS, products);

  let message = 'Transaksi berhasil dikoreksi.';
  if (shift) {
    applyTxToShift(shift, old, -1);
    applyTxToShift(shift, updated, 1);
    writeJSON(STORAGE_KEYS.ACTIVE_SHIFT, shift);
    markShiftDirty();
    const diff = cashIn(updated) - cashIn(old);
    if (diff > 0) message += ` Terima tambahan ${formatIDR(diff)} ke laci.`;
    if (diff < 0) message += ` Kembalikan ${formatIDR(-diff)} dari laci ke pelanggan.`;
  }

  notifyUpdate();
  return { ok: true, message, transaction: updated };
}

// -------------------------------------------------------------
// DRAF PESANAN (OPEN BILL / BAYAR NANTI)
// -------------------------------------------------------------

export function getDrafts(): DraftOrder[] {
  return readJSON<DraftOrder[]>(STORAGE_KEYS.DRAFTS, []).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function writeDrafts(list: DraftOrder[]): void {
  writeJSON(STORAGE_KEYS.DRAFTS, list);
}

export function getDeletedDraftIds(): string[] {
  return readJSON<string[]>(STORAGE_KEYS.DRAFTS_DELETED, []);
}

export function getUnsyncedDrafts(): DraftOrder[] {
  return getDrafts().filter((d) => !d.isSynced);
}

export interface DraftInput {
  /** Diisi untuk memperbarui draf yang sudah ada */
  id?: string;
  label: string;
  orderType: DraftOrder['orderType'];
  items: CartItem[];
  discountAmount: number;
  discountType: 'rp' | 'percent';
  notes?: string;
}

/** Simpan / perbarui draf. Tidak butuh shift terbuka dan tidak mengurangi stok. */
export function saveDraft(input: DraftInput, cashierName: string): DraftOrder {
  const label = input.label.trim();
  if (!label) throw new Error('Isi nama pelanggan / no. meja untuk draf.');
  const items = compactCartItems(input.items.filter((i) => i.quantity > 0));
  if (items.length === 0) throw new Error('Draf harus berisi minimal 1 item.');

  const now = new Date().toISOString();
  const list = readJSON<DraftOrder[]>(STORAGE_KEYS.DRAFTS, []);
  const i = input.id ? list.findIndex((d) => d.id === input.id) : -1;
  const prev = i >= 0 ? list[i] : null;
  const draft: DraftOrder = {
    id: prev?.id ?? input.id ?? `DRAFT-${getDeviceCode()}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    label,
    orderType: input.orderType,
    items,
    discountAmount: Math.max(0, input.discountAmount || 0),
    discountType: input.discountType,
    notes: input.notes?.trim() || undefined,
    createdAt: prev?.createdAt ?? now,
    createdBy: prev?.createdBy ?? cashierName,
    updatedAt: now,
    updatedBy: cashierName,
    deviceCode: prev?.deviceCode ?? getDeviceCode(),
    isSynced: false,
    ...(prev?.syncedAt ? { syncedAt: prev.syncedAt } : {}),
  };
  if (i >= 0) list[i] = draft;
  else list.push(draft);
  writeDrafts(list);
  notifyUpdate();
  return draft;
}

/** Hapus draf (dibayar atau dibatalkan). */
export function deleteDraft(id: string): void {
  const list = readJSON<DraftOrder[]>(STORAGE_KEYS.DRAFTS, []);
  const draft = list.find((d) => d.id === id);
  if (!draft) return;
  writeDrafts(list.filter((d) => d.id !== id));
  if (draft.syncedAt) {
    const deleted = getDeletedDraftIds();
    if (!deleted.includes(id)) writeJSON(STORAGE_KEYS.DRAFTS_DELETED, [...deleted, id]);
  }
  notifyUpdate();
}

/**
 * Item draf untuk dimuat ke keranjang: data produk diambil dari katalog terbaru (gambar, opsi),
 * harga tetap harga saat dipesan.
 */
export function draftItemsForCart(draft: DraftOrder): CartItem[] {
  const products = getProducts();
  return draft.items.map((it) => {
    const p = products.find((x) => x.id === it.product.id);
    return { ...it, product: p ? { ...p } : it.product, totalPrice: it.unitPrice * it.quantity };
  });
}

function draftPrint(d: DraftOrder): string {
  const { isSynced: _a, syncedAt: _b, ...rest } = d;
  return JSON.stringify(rest);
}

function markDraftsSynced(sent: DraftOrder[], sentDeletedIds: string[]): void {
  const prints = new Map(sent.map((d) => [d.id, draftPrint(d)]));
  const now = new Date().toISOString();
  writeDrafts(
    readJSON<DraftOrder[]>(STORAGE_KEYS.DRAFTS, []).map((d) =>
      prints.get(d.id) === draftPrint(d) ? { ...d, isSynced: true, syncedAt: now } : d
    )
  );
  if (sentDeletedIds.length) {
    const done = new Set(sentDeletedIds);
    writeJSON(STORAGE_KEYS.DRAFTS_DELETED, getDeletedDraftIds().filter((id) => !done.has(id)));
  }
}

// -------------------------------------------------------------
// PENGELUARAN
// -------------------------------------------------------------

export const EXPENSE_CATEGORIES = {
  daily: ['Bahan Baku', 'Es Batu', 'Gas', 'Air Galon', 'Cup / Plastik', 'Susu', 'Gula', 'Transport', 'Lain-lain'],
  monthly: ['Sewa Tempat', 'Gaji Karyawan', 'Listrik', 'Air PDAM', 'Internet / Wifi', 'Iuran / Retribusi', 'Perawatan Alat', 'Lain-lain'],
};

export function getExpenses(): Expense[] {
  return readJSON<Expense[]>(STORAGE_KEYS.EXPENSES, []);
}

export function addExpense(
  input: Omit<Expense, 'id' | 'createdAt' | 'shiftId'>
): Expense {
  if (!(input.amount > 0)) throw new Error('Nominal pengeluaran harus lebih dari 0.');
  if (!input.category.trim()) throw new Error('Kategori wajib diisi.');
  const validDate = input.scope === 'monthly' ? /^\d{4}-\d{2}$/ : /^\d{4}-\d{2}-\d{2}$/;
  if (!validDate.test(input.date)) throw new Error('Tanggal pengeluaran tidak valid.');

  const expense: Expense = {
    ...input,
    amount: Math.round(input.amount),
    category: input.category.trim(),
    note: input.note?.trim() || undefined,
    fromDrawer: input.scope === 'daily' ? Boolean(input.fromDrawer) : false,
    id: `EXP-${getDeviceCode()}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    createdAt: new Date().toISOString(),
    isSynced: false,
  };

  if (expense.fromDrawer) {
    const shift = getActiveShift();
    if (!shift) throw new Error('Tidak ada shift terbuka. Hilangkan centang "Diambil dari laci" atau buka shift dulu.');
    if (expense.date !== toLocalDateKey(new Date())) {
      throw new Error('Pengeluaran dari laci hanya bisa untuk tanggal hari ini.');
    }
    expense.shiftId = shift.id;
    shift.expensesCash = (shift.expensesCash ?? 0) + expense.amount;
    writeJSON(STORAGE_KEYS.ACTIVE_SHIFT, shift);
  }

  const list = getExpenses();
  list.unshift(expense);
  writeJSON(STORAGE_KEYS.EXPENSES, list);
  notifyUpdate();
  return expense;
}

export function deleteExpense(id: string): { ok: boolean; message: string } {
  const list = getExpenses();
  const exp = list.find((e) => e.id === id);
  if (!exp) return { ok: false, message: 'Pengeluaran tidak ditemukan.' };

  let message = 'Pengeluaran dihapus.';
  if (exp.fromDrawer && exp.shiftId) {
    const shift = getActiveShift();
    if (shift && shift.id === exp.shiftId) {
      shift.expensesCash = Math.max(0, (shift.expensesCash ?? 0) - exp.amount);
      writeJSON(STORAGE_KEYS.ACTIVE_SHIFT, shift);
      message += ` Kembalikan ${formatIDR(exp.amount)} ke laci.`;
    } else {
      message += ' Shift asalnya sudah ditutup, rekap shift lama tidak diubah.';
    }
  }

  writeJSON(STORAGE_KEYS.EXPENSES, list.filter((e) => e.id !== id));
  if (exp.isSynced) {
    const deleted = getDeletedExpenseIds();
    if (!deleted.includes(id)) writeJSON(STORAGE_KEYS.EXPENSES_DELETED, [...deleted, id]);
  }
  notifyUpdate();
  return { ok: true, message };
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
  writeJSON(STORAGE_KEYS.EXPENSES, []);
  writeJSON(STORAGE_KEYS.EXPENSES_DELETED, []);
  writeJSON(STORAGE_KEYS.DRAFTS, []);
  writeJSON(STORAGE_KEYS.DRAFTS_DELETED, []);
  localStorage.removeItem(STORAGE_KEYS.ACTIVE_SHIFT);
  localStorage.removeItem(STORAGE_KEYS.RECEIPT_SEQ);
  localStorage.removeItem(STORAGE_KEYS.CONFIG_DIRTY_AT);
  localStorage.removeItem(STORAGE_KEYS.SHIFT_DIRTY_AT);
  localStorage.removeItem(STORAGE_KEYS.REMOTE_SHIFTS);
  // Data bersama akan ditarik ulang dari server (jika token sync masih terisi).
  resetPullState();

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
    expenses: getExpenses(),
    drafts: getDrafts(),
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

  const arrayFields = ['products', 'categories', 'cashiers', 'transactions', 'shiftHistory', 'expenses', 'drafts'] as const;
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
  if (data.expenses) writeJSON(STORAGE_KEYS.EXPENSES, data.expenses);
  if (data.drafts) writeJSON(STORAGE_KEYS.DRAFTS, data.drafts);
  if (data.shift && data.shift.status === 'open') {
    writeJSON(STORAGE_KEYS.ACTIVE_SHIFT, data.shift);
  } else {
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_SHIFT);
  }

  migrationDone = false;
  runMigrations();
  if (data.products || data.categories || data.cashiers || data.settings) markConfigDirty();
  notifyUpdate();
  return { ok: true, message: 'Import data berhasil.' };
}

// -------------------------------------------------------------
// CLOUD SYNC
// -------------------------------------------------------------

export function getUnsyncedTransactions(): Transaction[] {
  return getTransactions().filter((t) => !t.isSynced);
}

export function getUnsyncedExpenses(): Expense[] {
  return getExpenses().filter((e) => !e.isSynced);
}

export function getDeletedExpenseIds(): string[] {
  return readJSON<string[]>(STORAGE_KEYS.EXPENSES_DELETED, []);
}

/** Jumlah data (transaksi + pengeluaran + hapus pengeluaran) yang belum terkirim ke server. */
export function getUnsyncedCount(): number {
  return getUnsyncedTransactions().length + getUnsyncedExpenses().length + getDeletedExpenseIds().length;
}

/** Ada sesuatu yang perlu dikirim ke server (data, perubahan menu/kasir/pengaturan, atau shift). */
export function hasPendingPush(): boolean {
  return (
    getUnsyncedCount() > 0 ||
    getUnsyncedDrafts().length > 0 ||
    getDeletedDraftIds().length > 0 ||
    !!localStorage.getItem(STORAGE_KEYS.CONFIG_DIRTY_AT) ||
    !!localStorage.getItem(STORAGE_KEYS.SHIFT_DIRTY_AT)
  );
}

/** Tandai pengeluaran terkirim; hanya yang isinya tidak berubah sejak dikirim. */
export function markExpensesAsSynced(sent: Expense[], sentDeletedIds: string[] = []): void {
  const print = (e: Expense) => {
    const { isSynced: _a, syncedAt: _b, ...rest } = e;
    return JSON.stringify(rest);
  };
  const sentPrints = new Map(sent.map((e) => [e.id, print(e)]));
  const now = new Date().toISOString();
  writeJSON(
    STORAGE_KEYS.EXPENSES,
    getExpenses().map((e) =>
      sentPrints.has(e.id) && sentPrints.get(e.id) === print(e) ? { ...e, isSynced: true, syncedAt: now } : e
    )
  );
  if (sentDeletedIds.length > 0) {
    const done = new Set(sentDeletedIds);
    writeJSON(STORAGE_KEYS.EXPENSES_DELETED, getDeletedExpenseIds().filter((id) => !done.has(id)));
  }
  notifyUpdate();
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
  pruneSyncedTransactions();

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

/**
 * URL endpoint sync. Jika kosong dan app disajikan dari website (mis. https://domain/kasir/),
 * pakai endpoint di domain yang sama: https://domain/api/sync.
 */
export function getSyncUrl(settings: StoreSettings = getStoreSettings()): string {
  const custom = settings.syncApiUrl?.trim();
  if (custom) return custom;
  if (typeof window !== 'undefined' && /^https?:$/.test(window.location.protocol)) {
    return `${window.location.origin}/api/sync`;
  }
  return '';
}

/** Shift yang dimulai dalam 14 hari terakhir (termasuk yang sudah ditutup). */
function getRecentShifts(): Shift[] {
  const cutoff = Date.now() - 14 * 86400000;
  return getShiftHistory().filter((s) => new Date(s.startTime).getTime() >= cutoff);
}

type SyncResult = { success: boolean; message: string; syncedCount: number };

let syncInFlight: Promise<SyncResult> | null = null;
let syncInFlightKey = '';
let syncQueued = false;

function currentSyncKey(): string {
  return getStoreSettings().syncApiKey?.trim() ?? '';
}

/** Kirim perubahan ke server lalu tarik perubahan dari perangkat lain. */
export function performCloudSync(): Promise<SyncResult> {
  // Cegah dua sync berjalan bersamaan (manual + otomatis). Perubahan yang masuk saat sync
  // sedang berjalan dikirim di putaran berikutnya.
  if (syncInFlight) {
    // Token diganti saat sync dengan token lama masih berjalan: jalankan sync baru setelahnya,
    // jangan kembalikan hasil sync token lama.
    if (syncInFlightKey !== currentSyncKey()) {
      const after = () => performCloudSync();
      return syncInFlight.then(after, after);
    }
    syncQueued = true;
    return syncInFlight;
  }
  syncInFlightKey = currentSyncKey();
  syncInFlight = doCloudSync()
    .then((res) => {
      if (!res.success) pushBackoffUntil = Date.now() + PUSH_BACKOFF_MS;
      return res;
    })
    .finally(() => {
    syncInFlight = null;
    if (syncQueued) {
      syncQueued = false;
      if (hasPendingPush()) void performCloudSync();
    }
  });
  return syncInFlight;
}

function syncHeaders(apiKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    Authorization: `Bearer ${apiKey}`,
  };
}

async function doCloudSync(): Promise<SyncResult> {
  const settings = getStoreSettings();
  const syncUrl = getSyncUrl(settings);
  if (!syncUrl) {
    return {
      success: false,
      message: 'URL API Sync belum dikonfigurasi di Pengaturan Toko.',
      syncedCount: 0,
    };
  }
  const apiKey = settings.syncApiKey?.trim();
  if (!apiKey) {
    return {
      success: false,
      message: 'Token sync belum diisi. Salin token cabang dari Dashboard Owner → Cabang & Token.',
      syncedCount: 0,
    };
  }

  let push = hasPendingPush() ? await pushToCloud(syncUrl, apiKey) : null;
  if (push && !push.success) return push;

  const pull = await pullFromCloud(syncUrl, apiKey);
  if (pull.aborted) {
    return { success: false, message: pull.message, syncedCount: push?.syncedCount ?? 0 };
  }
  if (!pull.success) {
    recordSyncError(pull.message);
    return { success: false, message: pull.message, syncedCount: push?.syncedCount ?? 0 };
  }
  if (pull.needConfigPush) {
    // Server belum punya data master: perangkat yang sudah dipakai ini jadi sumber pertamanya.
    markConfigDirty();
    const extra = await pushToCloud(syncUrl, apiKey);
    if (!extra.success) return extra;
    push = push ?? extra;
  }

  const current = getStoreSettings();
  writeJSON(STORAGE_KEYS.SETTINGS, { ...current, lastSyncedAt: new Date().toISOString(), lastSyncError: undefined });
  notifyUpdate();

  const parts = [push?.sent, pull.received ? `menerima ${pull.received} perubahan dari perangkat lain` : '']
    .filter(Boolean)
    .join(', ');
  return {
    success: true,
    message: parts ? `Berhasil: ${parts}.` : 'Semua data sudah sinkron.',
    syncedCount: (push?.syncedCount ?? 0) + pull.received,
  };
}

/** Kirim transaksi, pengeluaran, shift, dan data master yang berubah. */
async function pushToCloud(syncUrl: string, apiKey: string): Promise<SyncResult & { sent?: string }> {
  const settings = getStoreSettings();
  const shiftDirtyAt = localStorage.getItem(STORAGE_KEYS.SHIFT_DIRTY_AT);
  const configDirtyAt = localStorage.getItem(STORAGE_KEYS.CONFIG_DIRTY_AT);

  // Kirim bertahap agar request tidak melebihi batas ukuran body server (Vercel: 4,5 MB).
  let sentTx = 0;
  let sentExp = 0;
  let sentDel = 0;
  let configSent = false;
  let draftsSent = 0;
  try {
    for (let batch = 0; ; batch++) {
      const draftBatch = batch === 0 ? getUnsyncedDrafts().slice(0, SYNC_BATCH_DRAFTS) : [];
      const draftDelBatch = batch === 0 ? getDeletedDraftIds().slice(0, SYNC_BATCH_DRAFTS) : [];
      const txBatch = getUnsyncedTransactions().slice(0, SYNC_BATCH_TX);
      const expBatch = getUnsyncedExpenses().slice(0, SYNC_BATCH_EXPENSES);
      const delBatch = getDeletedExpenseIds().slice(0, SYNC_BATCH_EXPENSES);
      // Batch pertama selalu dikirim (membawa data master & shift); berikutnya hanya jika masih ada sisa.
      if (batch > 0 && txBatch.length + expBatch.length + delBatch.length === 0) break;
      if (batch >= SYNC_MAX_BATCHES) break;

      const payload = {
        storeName: settings.storeName,
        deviceCode: getDeviceCode(),
        timestamp: new Date().toISOString(),
        transactions: txBatch,
        expenses: expBatch,
        deletedExpenseIds: delBatch,
        ...(batch === 0
          ? {
              shift: getActiveShift(),
              shifts: getRecentShifts(),
              drafts: draftBatch,
              deletedDraftIds: draftDelBatch,
              ...(configDirtyAt ? { config: getSharedConfig(), configEditedAt: configDirtyAt } : {}),
            }
          : {}),
      };

      const res = await fetch(syncUrl, {
        method: 'POST',
        headers: syncHeaders(apiKey),
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        const message = `Gagal Sync (HTTP ${res.status}): ${errorText || 'Respon server tidak valid'}`;
        recordSyncError(message);
        return { success: false, message: withProgress(message, sentTx, sentExp), syncedCount: sentTx + sentExp + sentDel };
      }

      if (batch === 0) {
        const body = await res.json().catch(() => null);
        const data = body?.data;
        if (configDirtyAt && data?.configAccepted) {
          configSent = true;
          // Hanya bersihkan jika tidak ada perubahan baru selama request berjalan.
          if (localStorage.getItem(STORAGE_KEYS.CONFIG_DIRTY_AT) === configDirtyAt) {
            localStorage.removeItem(STORAGE_KEYS.CONFIG_DIRTY_AT);
            if (typeof data.configUpdatedAt === 'string') {
              localStorage.setItem(STORAGE_KEYS.CONFIG_VERSION, data.configUpdatedAt);
            }
          }
        }
        if (shiftDirtyAt && localStorage.getItem(STORAGE_KEYS.SHIFT_DIRTY_AT) === shiftDirtyAt) {
          localStorage.removeItem(STORAGE_KEYS.SHIFT_DIRTY_AT);
        }
        if (draftBatch.length + draftDelBatch.length > 0) {
          if (data?.draftsAccepted === true) {
            markDraftsSynced(draftBatch, draftDelBatch);
            draftsSent = draftBatch.length + draftDelBatch.length;
          } else {
            // Server belum mendukung draf (belum di-deploy / tabel belum dibuat): jangan kirim ulang terus-menerus.
            pushBackoffUntil = Date.now() + PUSH_BACKOFF_MS;
          }
        }
      }

      markExpensesAsSynced(expBatch, delBatch);
      markTransactionsAsSynced(
        txBatch.map((t) => t.id),
        txBatch
      );
      sentTx += txBatch.length;
      sentExp += expBatch.length;
      sentDel += delBatch.length;
    }

    const parts = [
      sentTx ? `${sentTx} transaksi` : '',
      sentExp ? `${sentExp} pengeluaran` : '',
      sentDel ? `${sentDel} hapus pengeluaran` : '',
      configSent ? 'menu/kasir/pengaturan' : '',
      draftsSent ? `${draftsSent} draf` : '',
    ].filter(Boolean);
    return {
      success: true,
      message: '',
      sent: parts.length ? `mengirim ${parts.join(', ')}` : '',
      syncedCount: sentTx + sentExp + sentDel,
    };
  } catch (err: any) {
    console.error('Cloud Sync error:', err);
    const message = `Gagal terhubung ke server: ${err?.message || 'Koneksi jaringan terputus'}`;
    recordSyncError(message);
    return { success: false, message: withProgress(message, sentTx, sentExp), syncedCount: sentTx + sentExp + sentDel };
  }
}

const SYNC_BATCH_TX = 200;
const SYNC_BATCH_EXPENSES = 500;
const SYNC_BATCH_DRAFTS = 200;
/** Setelah sync gagal, sync otomatis karena perubahan lokal ditahan sebentar (tarik berkala tetap jalan). */
const PUSH_BACKOFF_MS = 15 * 1000;
let pushBackoffUntil = 0;
const SYNC_MAX_BATCHES = 50;
const PULL_MAX_PAGES = 20;
/** Tarik ulang sedikit ke belakang dari cursor, untuk data yang ditulis server bersamaan dengan tarikan sebelumnya. */
const PULL_OVERLAP_MS = 2 * 60 * 1000;

function withProgress(message: string, tx: number, exp: number): string {
  return tx || exp ? `${message} (sebagian sudah terkirim: ${tx} transaksi, ${exp} pengeluaran)` : message;
}

// -------------------------------------------------------------
// TARIK DATA DARI SERVER (perangkat lain)
// -------------------------------------------------------------

type PullCursors = { tx: string; exp: string; shift: string; del: string; draft?: string };

export interface PullResponse {
  configUpdatedAt?: string | null;
  config?: SharedConfig | null;
  transactions?: Transaction[];
  expenses?: Expense[];
  shifts?: Shift[];
  deletedExpenseIds?: string[];
  drafts?: DraftOrder[];
  deletedDraftIds?: string[];
  cursors?: PullCursors;
  hasMore?: boolean;
}

export interface SharedConfig {
  products: Product[];
  categories: Category[];
  cashiers: Cashier[];
  settings: Partial<StoreSettings>;
}

/** Pengaturan yang khusus perangkat ini (tidak ikut dibagi ke perangkat lain). */
const DEVICE_SETTING_KEYS = [
  'syncApiUrl',
  'syncApiKey',
  'autoSyncOnline',
  'lastSyncedAt',
  'lastSyncError',
  'printerMethod',
  'printerPaperWidth',
  'autoPrintAfterPayment',
  'printerFeedLines',
  'receiptCompact',
] as const;

function sharedSettings(s: StoreSettings): Partial<StoreSettings> {
  const copy: Partial<StoreSettings> = { ...s };
  DEVICE_SETTING_KEYS.forEach((k) => delete copy[k]);
  return copy;
}

function deviceSettings(s: StoreSettings): Partial<StoreSettings> {
  const out: Partial<StoreSettings> = {};
  DEVICE_SETTING_KEYS.forEach((k) => {
    if (s[k] !== undefined) (out as any)[k] = s[k];
  });
  return out;
}

export function getSharedConfig(): SharedConfig {
  return {
    products: getProducts(),
    categories: getCategories(),
    cashiers: getCashiers(),
    settings: sharedSettings(getStoreSettings()),
  };
}

function markConfigDirty(): void {
  localStorage.setItem(STORAGE_KEYS.CONFIG_DIRTY_AT, new Date().toISOString());
  // Perubahan sengaja dari pengguna: perangkat ini boleh mengirim data masternya.
  localStorage.removeItem(STORAGE_KEYS.CONFIG_WAIT_REMOTE);
}

function markShiftDirty(): void {
  localStorage.setItem(STORAGE_KEYS.SHIFT_DIRTY_AT, new Date().toISOString());
}

/** Lupakan posisi tarik data, sehingga tarikan berikutnya mengambil ulang data terbaru dari server. */
function resetPullState(): void {
  localStorage.removeItem(STORAGE_KEYS.PULL_CURSORS);
  localStorage.removeItem(STORAGE_KEYS.PULL_INIT_DONE);
  localStorage.removeItem(STORAGE_KEYS.CONFIG_VERSION);
}

/**
 * Perangkat dihubungkan ke cabang (token) lain, lewat Link Kasir maupun diisi manual di Pengaturan.
 * Data master cabang di server yang dipakai: perubahan menu/kasir lokal yang belum terkirim TIDAK
 * dikirim lebih dulu (dulu bisa menimpa menu & kasir cabang di semua perangkat). Jika server belum
 * punya data master, perangkat yang sudah dipakai ini tetap menjadi sumber pertamanya.
 */
function onSyncTokenChanged(fromLink: boolean): void {
  const hadLocalEdits = !!localStorage.getItem(STORAGE_KEYS.CONFIG_DIRTY_AT);
  resetPullState();
  localStorage.removeItem(STORAGE_KEYS.CONFIG_DIRTY_AT);
  // Shift perangkat lain milik cabang lama tidak boleh ikut rekap cabang baru.
  localStorage.removeItem(STORAGE_KEYS.REMOTE_SHIFTS);
  // Link kasir di perangkat yang belum pernah bertransaksi & belum diubah: pakai menu/kasir dari
  // server, jangan kirim data bawaan walau server belum punya data master.
  if (fromLink && getTransactions().length === 0 && !hadLocalEdits) {
    localStorage.setItem(STORAGE_KEYS.CONFIG_WAIT_REMOTE, '1');
  } else {
    localStorage.removeItem(STORAGE_KEYS.CONFIG_WAIT_REMOTE);
  }
}

/** JSON dengan urutan key tetap (jsonb di server mengubah urutan key). */
function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v as object)
      .filter((k) => (v as any)[k] !== undefined && (v as any)[k] !== null)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify((v as any)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v);
}

function contentPrint(o: object): string {
  const { isSynced: _a, syncedAt: _b, deviceCode: _c, ...rest } = o as any;
  return stableStringify(rest);
}

function applyRemoteConfig(cfg: SharedConfig): void {
  if (Array.isArray(cfg.products)) writeJSON(STORAGE_KEYS.PRODUCTS, cfg.products);
  if (Array.isArray(cfg.categories)) writeJSON(STORAGE_KEYS.CATEGORIES, cfg.categories);
  if (Array.isArray(cfg.cashiers) && cfg.cashiers.length > 0) writeJSON(STORAGE_KEYS.CASHIERS, cfg.cashiers);
  if (cfg.settings && typeof cfg.settings === 'object') {
    const local = getStoreSettings();
    writeJSON(STORAGE_KEYS.SETTINGS, { ...local, ...cfg.settings, ...deviceSettings(local) });
  }
}

/** Gabungkan data dari server ke perangkat ini. Mengembalikan jumlah perubahan. */
export function applyPulledData(data: PullResponse): number {
  let changed = 0;
  const now = new Date().toISOString();

  // Data master: yang terakhir diubah yang menang.
  if (data.config && data.configUpdatedAt) {
    const dirtyAt = localStorage.getItem(STORAGE_KEYS.CONFIG_DIRTY_AT);
    if (!dirtyAt || data.configUpdatedAt >= dirtyAt) {
      applyRemoteConfig(data.config);
      localStorage.removeItem(STORAGE_KEYS.CONFIG_DIRTY_AT);
      localStorage.removeItem(STORAGE_KEYS.CONFIG_WAIT_REMOTE);
      localStorage.setItem(STORAGE_KEYS.CONFIG_VERSION, data.configUpdatedAt);
      changed++;
    }
  }

  // Transaksi: perubahan lokal yang belum terkirim tidak ditimpa.
  const remoteTx = (data.transactions ?? []).filter((t) => t && typeof t.id === 'string' && t.timestamp);
  if (remoteTx.length) {
    const local = getTransactions();
    const index = new Map(local.map((t, i) => [t.id, i]));
    let txChanged = 0;
    remoteTx.forEach((r) => {
      const incoming: Transaction = { ...r, isSynced: true, syncedAt: now };
      const i = index.get(r.id);
      if (i === undefined) {
        index.set(r.id, local.push(incoming) - 1);
        txChanged++;
      } else if (local[i].isSynced && contentPrint(local[i]) !== contentPrint(incoming)) {
        local[i] = incoming;
        txChanged++;
      }
    });
    if (txChanged) {
      local.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      writeTransactions(local);
      pruneSyncedTransactions();
      changed += txChanged;
    }
  }

  // Pengeluaran
  const deleted = new Set(data.deletedExpenseIds ?? []);
  const remoteExp = (data.expenses ?? []).filter((e) => e && typeof e.id === 'string' && !deleted.has(e.id));
  if (remoteExp.length || deleted.size) {
    const local = getExpenses();
    let list = local;
    let expChanged = 0;
    if (deleted.size) {
      list = local.filter((e) => !deleted.has(e.id));
      expChanged += local.length - list.length;
    }
    const index = new Map(list.map((e, i) => [e.id, i]));
    remoteExp.forEach((r) => {
      const incoming: Expense = { ...r, isSynced: true, syncedAt: now };
      const i = index.get(r.id);
      if (i === undefined) {
        index.set(r.id, list.push(incoming) - 1);
        expChanged++;
      } else if (list[i].isSynced && contentPrint(list[i]) !== contentPrint(incoming)) {
        list[i] = incoming;
        expChanged++;
      }
    });
    if (expChanged) {
      list.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
      writeJSON(STORAGE_KEYS.EXPENSES, list);
      changed += expChanged;
    }
  }

  // Draf pesanan: perubahan lokal yang belum terkirim tidak ditimpa; draf yang dihapus/dibayar di
  // perangkat lain ikut hilang.
  const deletedDrafts = new Set(data.deletedDraftIds ?? []);
  const remoteDrafts = (data.drafts ?? []).filter(
    (d) => d && typeof d.id === 'string' && Array.isArray(d.items) && !deletedDrafts.has(d.id)
  );
  if (remoteDrafts.length || deletedDrafts.size) {
    const local = readJSON<DraftOrder[]>(STORAGE_KEYS.DRAFTS, []);
    let list = local.filter((d) => !deletedDrafts.has(d.id));
    let draftChanged = local.length - list.length;
    const index = new Map(list.map((d, i) => [d.id, i]));
    remoteDrafts.forEach((r) => {
      const incoming: DraftOrder = { ...r, isSynced: true, syncedAt: now };
      const i = index.get(r.id);
      if (i === undefined) {
        index.set(r.id, list.push(incoming) - 1);
        draftChanged++;
      } else if (list[i].isSynced && contentPrint(list[i]) !== contentPrint(incoming)) {
        list[i] = incoming;
        draftChanged++;
      }
    });
    if (draftChanged) {
      writeDrafts(list);
      changed += draftChanged;
    }
  }

  // Shift perangkat lain (shift milik perangkat ini sudah ada di lokal)
  const remoteShifts = (data.shifts ?? []).filter((s) => s && typeof s.id === 'string' && s.startTime);
  if (remoteShifts.length) {
    const own = new Set([getActiveShift()?.id, ...getShiftHistory().map((s) => s.id)]);
    const cutoff = Date.now() - KEEP_SYNCED_DAYS * 86400000;
    const byId = new Map(getRemoteShifts().map((s) => [s.id, s]));
    let shiftChanged = 0;
    remoteShifts.forEach((s) => {
      if (own.has(s.id)) return;
      const cur = byId.get(s.id);
      if (!cur || stableStringify(cur) !== stableStringify(s)) {
        byId.set(s.id, s);
        shiftChanged++;
      }
    });
    if (shiftChanged) {
      const kept = [...byId.values()].filter((s) => new Date(s.startTime).getTime() >= cutoff);
      writeJSON(STORAGE_KEYS.REMOTE_SHIFTS, kept);
      changed += shiftChanged;
    }
  }

  if (changed) notifyUpdate();
  return changed;
}

function getRemoteShifts(): Shift[] {
  return readJSON<Shift[]>(STORAGE_KEYS.REMOTE_SHIFTS, []);
}

/** Semua shift (perangkat ini + perangkat lain), untuk rekap closing harian toko. */
export function getAllShifts(): Shift[] {
  const active = getActiveShift();
  const own = active ? [active, ...getShiftHistory()] : getShiftHistory();
  const ownIds = new Set(own.map((s) => s.id));
  return [...own, ...getRemoteShifts().filter((s) => !ownIds.has(s.id))];
}

async function pullFromCloud(
  syncUrl: string,
  apiKey: string
): Promise<{ success: boolean; message: string; received: number; needConfigPush: boolean; aborted?: boolean }> {
  const saved = readJSON<PullCursors | null>(STORAGE_KEYS.PULL_CURSORS, null);
  let cursors: PullCursors | null = saved
    ? (Object.fromEntries(
        Object.entries(saved).map(([k, v]) => {
          const t = new Date(v).getTime();
          return [k, Number.isNaN(t) ? v : new Date(t - PULL_OVERLAP_MS).toISOString()];
        })
      ) as PullCursors)
    : null;
  let received = 0;
  let needConfigPush = false;

  try {
    for (let page = 0; page < PULL_MAX_PAGES; page++) {
      const base = (typeof window !== 'undefined' && window.location?.href) || 'http://localhost/';
      const url = new URL(syncUrl, base);
      if (cursors) (Object.keys(cursors) as (keyof PullCursors)[]).forEach((k) => url.searchParams.set(k, cursors![k]));
      if (!localStorage.getItem(STORAGE_KEYS.PULL_INIT_DONE)) url.searchParams.set('init', '1');
      const version = localStorage.getItem(STORAGE_KEYS.CONFIG_VERSION);
      if (version) url.searchParams.set('config', version);

      const res = await fetch(url.toString(), { method: 'GET', headers: syncHeaders(apiKey), cache: 'no-store' });
      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        return {
          success: false,
          message: `Gagal mengambil data (HTTP ${res.status}): ${errorText || 'Respon server tidak valid'}`,
          received,
          needConfigPush,
        };
      }
      const data = (await res.json()) as PullResponse;

      // Token diganti selama request berjalan: data ini milik cabang lama, jangan disimpan
      // (cursor & data master cabang lama akan merusak tarikan pertama dari cabang baru).
      if (currentSyncKey() !== apiKey) {
        return {
          success: false,
          aborted: true,
          message: 'Token sync berubah saat sinkronisasi berjalan. Sync diulang dengan token baru.',
          received,
          needConfigPush: false,
        };
      }

      if (
        page === 0 &&
        !data.configUpdatedAt &&
        !version &&
        !localStorage.getItem(STORAGE_KEYS.CONFIG_WAIT_REMOTE) &&
        !localStorage.getItem(STORAGE_KEYS.CONFIG_DIRTY_AT)
      ) {
        needConfigPush = true;
      }

      received += applyPulledData(data);
      if (data.cursors) {
        cursors = data.cursors;
        writeJSON(STORAGE_KEYS.PULL_CURSORS, cursors);
      }
      if (!data.hasMore) {
        localStorage.setItem(STORAGE_KEYS.PULL_INIT_DONE, '1');
        break;
      }
    }
    return { success: true, message: '', received, needConfigPush };
  } catch (err: any) {
    console.error('Cloud pull error:', err);
    return {
      success: false,
      message: `Gagal mengambil data dari server: ${err?.message || 'Koneksi jaringan terputus'}`,
      received,
      needConfigPush,
    };
  }
}

/**
 * Link kasir dari dashboard: https://domain/kasir/#token=XXXX
 * Simpan token ke perangkat ini lalu hapus dari address bar. Perangkat baru akan mengambil
 * menu, kasir, pengaturan, dan transaksi dari server. Mengembalikan true jika token dipakai.
 */
export function consumeSyncLinkFromUrl(): boolean {
  if (typeof window === 'undefined') return false;
  const url = new URL(window.location.href);
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
  const token = (hash.get('token') || url.searchParams.get('token') || '').trim();
  if (!token) return false;

  hash.delete('token');
  url.searchParams.delete('token');
  const rest = hash.toString();
  url.hash = rest ? `#${rest}` : '';
  window.history.replaceState(null, '', url.toString());

  initLocalStorage();
  const settings = getStoreSettings();
  const current = settings.syncApiKey?.trim();
  if (current === token) return false;
  if (
    current &&
    getUnsyncedCount() > 0 &&
    !window.confirm(
      'Perangkat ini masih punya data yang belum terkirim ke cabang lama. Tetap ganti ke cabang dari link ini?'
    )
  ) {
    return false;
  }

  writeJSON(STORAGE_KEYS.SETTINGS, { ...settings, syncApiKey: token, autoSyncOnline: true, lastSyncError: undefined });
  onSyncTokenChanged(true);
  notifyUpdate();
  return true;
}

/**
 * Sync otomatis jika diaktifkan dan online.
 * Tanpa `pull`, hanya berjalan bila ada data yang perlu dikirim (dipicu oleh perubahan).
 * Dengan `pull`, selalu jalan untuk menarik perubahan dari perangkat lain.
 */
export function maybeAutoSync(opts: { pull?: boolean } = {}): void {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  const settings = getStoreSettings();
  if (settings.autoSyncOnline === false) return;
  if (!getSyncUrl(settings) || !settings.syncApiKey?.trim()) return;
  if (!opts.pull && !hasPendingPush()) return;
  // Gagal barusan: jangan mengulang setiap ada perubahan (bisa membanjiri server); tunggu tarik berkala.
  if (!opts.pull && Date.now() < pushBackoffUntil) return;
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

  sql += `CREATE TABLE IF NOT EXISTS expenses (\n`;
  sql += `  id VARCHAR(100) PRIMARY KEY,\n`;
  sql += `  scope VARCHAR(10) NOT NULL, -- 'daily' | 'monthly'\n`;
  sql += `  expense_date VARCHAR(10) NOT NULL, -- YYYY-MM-DD (harian) / YYYY-MM (bulanan)\n`;
  sql += `  category VARCHAR(100) NOT NULL,\n`;
  sql += `  amount NUMERIC(12, 2) NOT NULL,\n`;
  sql += `  note TEXT,\n`;
  sql += `  from_drawer BOOLEAN DEFAULT FALSE,\n`;
  sql += `  shift_id VARCHAR(100),\n`;
  sql += `  created_by VARCHAR(100),\n`;
  sql += `  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP\n`;
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

  const expenses = getExpenses();
  if (expenses.length > 0) {
    sql += `-- Expenses Data\n`;
    const q = (v?: string) => (v ? `'${v.replace(/'/g, "''")}'` : 'NULL');
    expenses.forEach((e) => {
      sql += `INSERT INTO expenses (id, scope, expense_date, category, amount, note, from_drawer, shift_id, created_by, created_at)\n`;
      sql += `VALUES (${q(e.id)}, ${q(e.scope)}, ${q(e.date)}, ${q(e.category)}, ${e.amount}, ${q(e.note)}, ${Boolean(e.fromDrawer)}, ${q(e.shiftId)}, ${q(e.createdBy)}, ${q(e.createdAt)})\n`;
      sql += `ON CONFLICT (id) DO UPDATE SET amount = EXCLUDED.amount, category = EXCLUDED.category, note = EXCLUDED.note;\n\n`;
    });
  }

  return sql;
}
