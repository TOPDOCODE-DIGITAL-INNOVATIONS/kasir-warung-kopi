import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetStorageStateForTests,
  cancelTransaction,
  closeCurrentShift,
  exportDataAsJSON,
  generateReceiptId,
  getActiveShift,
  getCashiers,
  getProducts,
  getShiftHistory,
  getStockIssues,
  getStoreSettings,
  getTransactions,
  formatIDR,
  importDataFromJSON,
  markTransactionsAsSynced,
  payDebt,
  saveProducts,
  saveStoreSettings,
  saveTransaction,
  startNewShift,
  addExpense,
  deleteExpense,
  getExpenses,
  performCloudSync,
  getUnsyncedCount,
  pruneSyncedTransactions,
  KEEP_SYNCED_DAYS,
  applyPulledData,
  getAllShifts,
  saveCategories,
  consumeSyncLinkFromUrl,
  hasPendingPush,
  editTransaction,
  canEditTransactionAmounts,
} from './storage';
import { verifyPin, hashPin, isValidPin, sha256Hex } from './security';
import { can } from './permissions';
import { computeSalesReport, resolveDateRange, isInRange, computeMonthlyRecap, monthlyRecapToTSV, toLocalDateKey, toMonthKey, getExpectedDrawerCash } from './reports';
import { PaymentType, Transaction } from '../types';

class MemoryStorage {
  private store = new Map<string, string>();
  getItem(k: string) {
    return this.store.has(k) ? this.store.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.store.set(k, String(v));
  }
  removeItem(k: string) {
    this.store.delete(k);
  }
  clear() {
    this.store.clear();
  }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage());
  vi.stubGlobal('window', { dispatchEvent: () => true });
  __resetStorageStateForTests();
});

const EMPTY_PULL = { configUpdatedAt: null, config: null, transactions: [], expenses: [], shifts: [], deletedExpenseIds: [], hasMore: false };

/** fetch palsu: POST memanggil onPost, GET (tarik data) mengembalikan `pull`. */
function stubServer(onPost: (body: any) => any = () => ({}), pull: any = { ...EMPTY_PULL, configUpdatedAt: '2026-01-01T00:00:00.000Z' }) {
  const gets: string[] = [];
  vi.stubGlobal('fetch', async (url: string, init: any) => {
    if (init?.method === 'GET') {
      gets.push(url);
      return { ok: true, json: async () => (typeof pull === 'function' ? pull(url) : pull), text: async () => '' };
    }
    const data = onPost(JSON.parse(init.body)) ?? {};
    return { ok: true, json: async () => ({ success: true, data }), text: async () => '' };
  });
  return gets;
}

function makeTx(paymentType: PaymentType, qty = 1, productId?: string): Transaction {
  const product = productId ? getProducts().find((p) => p.id === productId)! : getProducts()[0];
  const total = product.price * qty;
  return {
    id: generateReceiptId(),
    timestamp: new Date().toISOString(),
    cashierId: 'c-1',
    cashierName: 'Budi',
    orderType: 'Dine In',
    customerName: paymentType === 'hutang' ? 'Pak RT' : undefined,
    items: [
      {
        cartItemId: `${product.id}--`,
        product,
        quantity: qty,
        selectedOptions: [],
        unitPrice: product.price,
        totalPrice: total,
      },
    ],
    subtotal: total,
    discountAmount: 0,
    taxAmount: 0,
    grandTotal: total,
    paymentType,
    amountPaid: total,
    changeAmount: 0,
    status: 'completed',
  };
}

describe('init', () => {
  it('tidak membuka shift otomatis', () => {
    getProducts();
    expect(getActiveShift()).toBeNull();
  });

  it('memigrasi PIN plaintext menjadi hash & selalu ada Owner', () => {
    localStorage.setItem(
      'warkop_pos_cashiers',
      JSON.stringify([{ id: 'x', name: 'Lama', role: 'Supervisor', pin: '4321' }])
    );
    const [c] = getCashiers();
    expect(c.pin).toBeUndefined();
    expect(c.pinHash).toBeTruthy();
    expect(verifyPin(c, '4321')).toBe(true);
    expect(verifyPin(c, '1234')).toBe(false);
    expect(c.role).toBe('Owner');
  });
});

describe('nomor struk', () => {
  it('memakai tanggal lokal dan berurutan', () => {
    const d = new Date(2026, 10, 7, 1, 30); // 01:30 lokal
    const a = generateReceiptId(d);
    const b = generateReceiptId(d);
    expect(a).toMatch(/^WKP-20261107-[A-Z0-9]{3}-0001$/);
    expect(b.endsWith('-0002')).toBe(true);
  });

  it('reset urutan di hari berikutnya', () => {
    generateReceiptId(new Date(2026, 10, 7, 23, 0));
    expect(generateReceiptId(new Date(2026, 10, 8, 0, 5))).toMatch(/-20261108-.*-0001$/);
  });
});

describe('transaksi & shift', () => {
  it('menolak transaksi tanpa shift', () => {
    expect(() => saveTransaction(makeTx('tunai'))).toThrow(/shift/i);
  });

  it('mencatat tunai/non-tunai/bon ke rekap shift', () => {
    startNewShift('c-1', 50000);
    const cash = saveTransaction(makeTx('tunai'));
    saveTransaction(makeTx('qris'));
    saveTransaction(makeTx('hutang'));

    const s = getActiveShift()!;
    expect(cash.shiftId).toBe(s.id);
    expect(s.totalSalesCash).toBe(cash.grandTotal);
    expect(s.totalSalesNonCash).toBeGreaterThan(0);
    expect(s.totalSalesDebt).toBeGreaterThan(0);
    expect(s.totalTransactions).toBe(3);
  });

  it('pembatalan mengoreksi rekap shift, stok, dan status sync', () => {
    startNewShift('c-1', 0);
    const limited = getProducts();
    limited[0].stock = 10;
    saveProducts(limited);

    const tx = saveTransaction(makeTx('tunai', 2, limited[0].id));
    expect(getProducts()[0].stock).toBe(8);
    markTransactionsAsSynced([tx.id]);

    const res = cancelTransaction(tx.id, 'salah pesan', 'Budi');
    expect(res.ok).toBe(true);

    const s = getActiveShift()!;
    expect(s.totalSalesCash).toBe(0);
    expect(s.totalTransactions).toBe(0);
    expect(getProducts()[0].stock).toBe(10);
    const saved = getTransactions().find((t) => t.id === tx.id)!;
    expect(saved.status).toBe('cancelled');
    expect(saved.isSynced).toBe(false);
  });

  it('menolak penjualan melebihi stok', () => {
    startNewShift('c-1', 0);
    const ps = getProducts();
    ps[0].stock = 1;
    saveProducts(ps);
    expect(() => saveTransaction(makeTx('tunai', 2, ps[0].id))).toThrow(/stok/i);
    expect(getStockIssues([{ product: ps[0], quantity: 2 }], ps)).toHaveLength(1);
  });

  it('tutup shift menyimpan ekspektasi kas & riwayat', () => {
    startNewShift('c-1', 100000);
    const tx = saveTransaction(makeTx('tunai'));
    closeCurrentShift(100000 + tx.grandTotal - 1000);
    const [h] = getShiftHistory();
    expect(h.expectedCash).toBe(100000 + tx.grandTotal);
    expect(h.endingCashActual! - h.expectedCash!).toBe(-1000);
    expect(getActiveShift()).toBeNull();
  });
});

describe('bon / hutang', () => {
  it('pelunasan tunai masuk ke kas shift yang terbuka', () => {
    startNewShift('c-1', 0);
    const bon = saveTransaction(makeTx('hutang'));
    expect(bon.debtStatus).toBe('unpaid');

    const res = payDebt(bon.id, 'tunai');
    expect(res.ok).toBe(true);
    expect(getActiveShift()!.debtCollectedCash).toBe(bon.grandTotal);
    expect(getTransactions().find((t) => t.id === bon.id)!.debtStatus).toBe('paid');

    // Bon yang sudah lunas tidak bisa dibatalkan
    expect(cancelTransaction(bon.id, 'x').ok).toBe(false);
  });
});

describe('backup', () => {
  it('tidak mengekspor API key, dan import mempertahankan key lokal', () => {
    saveStoreSettings({ ...getStoreSettings(), syncApiKey: 'rahasia' });
    const json = exportDataAsJSON();
    expect(json).not.toContain('rahasia');

    expect(importDataFromJSON(json).ok).toBe(true);
    expect(getStoreSettings().syncApiKey).toBe('rahasia');
  });

  it('menolak file backup yang rusak', () => {
    expect(importDataFromJSON('bukan json').ok).toBe(false);
    expect(importDataFromJSON('{"products": "x"}').ok).toBe(false);
  });
});

describe('security & permissions', () => {
  it('sha256 sesuai vektor uji standar', () => {
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('validasi PIN', () => {
    expect(isValidPin('1234')).toBe(true);
    expect(isValidPin('12a4')).toBe(false);
    expect(isValidPin('123')).toBe(false);
    const c = { id: 'a', name: 'A', role: 'Kasir' as const, ...hashPin('9999') };
    expect(verifyPin(c, '9999')).toBe(true);
  });

  it('hak akses per role', () => {
    expect(can('Kasir', 'cancelTransaction')).toBe(false);
    expect(can('Kasir', 'settings')).toBe(false);
    expect(can('Supervisor', 'cancelTransaction')).toBe(true);
    expect(can('Supervisor', 'dataAdmin')).toBe(false);
    expect(can('Owner', 'dataAdmin')).toBe(true);
  });
});

describe('laporan', () => {
  it('menghitung laba kotor dari harga modal', () => {
    startNewShift('c-1', 0);
    const ps = getProducts();
    ps[0].costPrice = 4000;
    ps[0].price = 10000;
    saveProducts(ps);
    saveTransaction(makeTx('tunai', 3, ps[0].id));

    const r = computeSalesReport(getTransactions());
    expect(r.revenueExTax).toBe(30000);
    expect(r.cogs).toBe(12000);
    expect(r.grossProfit).toBe(18000);
  });

  it('filter rentang tanggal "hari ini" memakai waktu lokal', () => {
    const now = new Date(2026, 10, 7, 12, 0);
    const range = resolveDateRange('today', now);
    expect(isInRange(new Date(2026, 10, 7, 0, 30).toISOString(), range)).toBe(true);
    expect(isInRange(new Date(2026, 10, 6, 23, 59).toISOString(), range)).toBe(false);
  });
});

describe('pengeluaran', () => {
  it('pengeluaran dari laci mengurangi kas seharusnya di shift, dan dikembalikan saat dihapus', () => {
    startNewShift('c-1', 100000);
    saveTransaction(makeTx('tunai'));
    const before = getExpectedDrawerCash(getActiveShift()!);
    const exp = addExpense({
      scope: 'daily',
      date: toLocalDateKey(new Date()),
      category: 'Es Batu',
      amount: 15000,
      fromDrawer: true,
      createdBy: 'Budi',
    });
    expect(getExpectedDrawerCash(getActiveShift()!)).toBe(before - 15000);
    deleteExpense(exp.id);
    expect(getExpectedDrawerCash(getActiveShift()!)).toBe(before);
    expect(getExpenses()).toHaveLength(0);
  });

  it('pengeluaran dari laci butuh shift terbuka', () => {
    expect(() =>
      addExpense({ scope: 'daily', date: toLocalDateKey(new Date()), category: 'Gas', amount: 1000, fromDrawer: true, createdBy: 'x' })
    ).toThrow();
  });

  it('pengeluaran bulanan tersimpan dan ikut backup', () => {
    addExpense({ scope: 'monthly', date: toMonthKey(new Date()), category: 'Sewa Tempat', amount: 1500000, createdBy: 'Owner' });
    expect(JSON.parse(exportDataAsJSON()).expenses).toHaveLength(1);
  });
});

describe('kelebihan (kembalian permen)', () => {
  it('kelebihan masuk ke uang laci seharusnya, bukan ke omset, dan dibalik saat batal', () => {
    startNewShift('c-1', 100000);
    const base = makeTx('tunai');
    const tx = saveTransaction({
      ...base,
      amountPaid: base.grandTotal + 2000,
      changeAmount: 1500,
      overpayAmount: 500,
    });
    const shift = getActiveShift()!;
    expect(shift.totalSalesCash).toBe(base.grandTotal);
    expect(shift.overpayCash).toBe(500);
    // laci = modal + uang diterima - kembalian uang
    expect(getExpectedDrawerCash(shift)).toBe(100000 + base.grandTotal + 2000 - 1500);
    expect(computeSalesReport(getTransactions())).toMatchObject({ netSales: base.grandTotal, overpay: 500 });

    const res = cancelTransaction(tx.id, 'salah', 'Budi');
    expect(res.message).toContain(formatIDR(base.grandTotal + 500));
    expect(getActiveShift()!.overpayCash).toBe(0);
  });

  it('kelebihan tidak boleh melebihi kembalian', () => {
    startNewShift('c-1', 0);
    const base = makeTx('tunai');
    expect(() => saveTransaction({ ...base, amountPaid: base.grandTotal + 500, overpayAmount: 1000 })).toThrow(/kelebihan/i);
  });

  it('kelebihan diabaikan untuk pembayaran non-tunai', () => {
    startNewShift('c-1', 0);
    const tx = saveTransaction({ ...makeTx('qris'), overpayAmount: 500 });
    expect(tx.overpayAmount).toBeUndefined();
    expect(getActiveShift()!.overpayCash ?? 0).toBe(0);
  });

  it('rekap bulanan punya kolom kelebihan dan ikut menambah total', () => {
    const at = new Date(2026, 9, 5, 10).toISOString();
    const base = { cashierId: 'c', cashierName: 'B', orderType: 'Dine In' as const, items: [], subtotal: 0, discountAmount: 0, taxAmount: 0, status: 'completed' as const };
    const txs: Transaction[] = [
      { ...base, id: '1', timestamp: at, grandTotal: 18500, paymentType: 'tunai', amountPaid: 20000, changeAmount: 1000, overpayAmount: 500 },
    ];
    const r = computeMonthlyRecap('2026-10', txs, [], new Date(2026, 10, 7));
    expect(r.days[4]).toMatchObject({ cash: 18500, sales: 18500, overpay: 500, total: 19000 });
    expect(r.totalOverpay).toBe(500);
    expect(r.netProfit).toBe(19000);
  });
});

describe('rekap bulanan', () => {
  it('menghitung cash, non-tunai, pengeluaran harian & bulanan seperti buku kas', () => {
    const at = (d: number, h = 10) => new Date(2026, 9, d, h).toISOString();
    const base = { cashierId: 'c', cashierName: 'B', orderType: 'Dine In' as const, items: [], subtotal: 0, discountAmount: 0, taxAmount: 0, amountPaid: 0, changeAmount: 0, status: 'completed' as const };
    const txs: Transaction[] = [
      { ...base, id: '1', timestamp: at(1), grandTotal: 510000, paymentType: 'tunai' },
      { ...base, id: '2', timestamp: at(1), grandTotal: 45000, paymentType: 'qris' },
      { ...base, id: '3', timestamp: at(2), grandTotal: 20000, paymentType: 'tunai', status: 'cancelled' },
      { ...base, id: '4', timestamp: at(2), grandTotal: 30000, paymentType: 'hutang', debtStatus: 'paid', debtPaidAt: at(3), debtPaidMethod: 'tunai' },
      { ...base, id: '5', timestamp: at(2), grandTotal: 12000, paymentType: 'hutang', debtStatus: 'unpaid' },
    ];
    const exps = [
      { id: 'e1', scope: 'daily' as const, date: '2026-10-03', category: 'Gas', amount: 50000, createdBy: 'x', createdAt: '' },
      { id: 'e2', scope: 'monthly' as const, date: '2026-10', category: 'Sewa', amount: 300000, createdBy: 'x', createdAt: '' },
      { id: 'e3', scope: 'monthly' as const, date: '2026-09', category: 'Sewa', amount: 999, createdBy: 'x', createdAt: '' },
    ];
    const r = computeMonthlyRecap('2026-10', txs, exps, new Date(2026, 10, 7));
    expect(r.days).toHaveLength(31);
    expect(r.days[0]).toMatchObject({ cash: 510000, nonCash: 45000, sales: 555000, expenses: 0, total: 555000 });
    expect(r.days[1].sales).toBe(0);
    expect(r.days[2]).toMatchObject({ cash: 30000, expenses: 50000, total: -20000 });
    expect(r.totalSales).toBe(585000);
    expect(r.totalMonthlyExpenses).toBe(300000);
    expect(r.netProfit).toBe(585000 - 50000 - 300000);
    expect(r.unpaidDebt).toBe(12000);
    const tsv = monthlyRecapToTSV(r);
    expect(tsv.split('\n')[1]).toBe('2026-10-01\t510,000.00\t45,000.00\t555,000.00\t0.00\t0.00\t555,000.00');
    expect(tsv).toContain('-20,000.00');
  });

  it('hari yang belum terjadi tidak ditampilkan', () => {
    expect(computeMonthlyRecap('2026-11', [], [], new Date(2026, 10, 7)).days).toHaveLength(7);
  });
});

describe('sync pengeluaran', () => {
  it('mengirim pengeluaran baru & ID yang dihapus, lalu menandainya terkirim', async () => {
    saveStoreSettings({ ...getStoreSettings(), syncApiUrl: 'https://x.test/sync', syncApiKey: 'tok' });
    const bodies: any[] = [];
    stubServer((b) => {
      bodies.push(b);
    });

    const exp = addExpense({ scope: 'monthly', date: '2026-11', category: 'Sewa', amount: 100, createdBy: 'O' });
    expect(getUnsyncedCount()).toBe(1);
    expect((await performCloudSync()).success).toBe(true);
    expect(bodies[0].expenses.map((e: any) => e.id)).toEqual([exp.id]);
    expect(getUnsyncedCount()).toBe(0);

    deleteExpense(exp.id);
    expect(getUnsyncedCount()).toBe(1);
    await performCloudSync();
    expect(bodies[1].deletedExpenseIds).toEqual([exp.id]);
    expect(bodies[1].expenses).toEqual([]);
    expect(getUnsyncedCount()).toBe(0);
  });

  it('pengeluaran yang belum pernah terkirim lalu dihapus tidak perlu dikirim', () => {
    const exp = addExpense({ scope: 'monthly', date: '2026-11', category: 'Sewa', amount: 100, createdBy: 'O' });
    deleteExpense(exp.id);
    expect(getUnsyncedCount()).toBe(0);
  });

  it('tanpa token, sync tidak dijalankan', async () => {
    saveStoreSettings({ ...getStoreSettings(), syncApiUrl: 'https://x.test/sync', syncApiKey: '' });
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    addExpense({ scope: 'monthly', date: '2026-11', category: 'Sewa', amount: 100, createdBy: 'O' });
    expect((await performCloudSync()).success).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(getUnsyncedCount()).toBe(1);
  });

  it('gagal sync: pengeluaran tetap menunggu dikirim', async () => {
    saveStoreSettings({ ...getStoreSettings(), syncApiUrl: 'https://x.test/sync', syncApiKey: 'tok' });
    vi.stubGlobal('fetch', async () => ({ ok: false, status: 500, text: async () => 'err' }));
    addExpense({ scope: 'monthly', date: '2026-11', category: 'Sewa', amount: 100, createdBy: 'O' });
    expect((await performCloudSync()).success).toBe(false);
    expect(getUnsyncedCount()).toBe(1);
  });
});

describe('penyimpanan & sync bertahap', () => {
  it('sync dikirim per batch dan semua transaksi akhirnya tersinkron', async () => {
    saveStoreSettings({ ...getStoreSettings(), syncApiUrl: 'https://x.test/sync', syncApiKey: 'tok' });
    const old = Array.from({ length: 450 }, (_, i) => ({
      id: `T-${i}`,
      timestamp: new Date().toISOString(),
      paymentType: 'tunai',
      status: 'completed',
      items: [],
      isSynced: false,
    }));
    localStorage.setItem('warkop_pos_transactions', JSON.stringify(old));
    const sizes: number[] = [];
    const withShift: boolean[] = [];
    stubServer((body) => {
      sizes.push(body.transactions.length);
      withShift.push('shift' in body);
    });
    const res = await performCloudSync();
    expect(res.success).toBe(true);
    expect(sizes).toEqual([200, 200, 50]);
    expect(withShift).toEqual([true, false, false]);
    expect(getUnsyncedCount()).toBe(0);
  });

  it('membersihkan transaksi lama yang sudah tersinkron, kecuali bon belum lunas & yang belum terkirim', () => {
    const now = new Date('2026-11-07T10:00:00Z');
    const daysAgo = (d: number) => new Date(now.getTime() - d * 86400000).toISOString();
    const txs = [
      { id: 'old-synced', timestamp: daysAgo(100), paymentType: 'tunai', status: 'completed', isSynced: true, items: [] },
      { id: 'old-unsynced', timestamp: daysAgo(100), paymentType: 'tunai', status: 'completed', isSynced: false, items: [] },
      { id: 'old-bon', timestamp: daysAgo(100), paymentType: 'hutang', debtStatus: 'unpaid', status: 'completed', isSynced: true, items: [] },
      { id: 'new-synced', timestamp: daysAgo(3), paymentType: 'tunai', status: 'completed', isSynced: true, items: [] },
    ];
    localStorage.setItem('warkop_pos_transactions', JSON.stringify(txs));
    expect(pruneSyncedTransactions(KEEP_SYNCED_DAYS, now)).toBe(1);
    expect(getTransactions().map((t) => t.id)).toEqual(['old-unsynced', 'old-bon', 'new-synced']);
  });
});

describe('sync dua arah antar perangkat', () => {
  const remoteTx = (id: string, extra: Partial<Transaction> = {}): Transaction => ({
    id,
    timestamp: '2026-11-07T03:00:00.000Z',
    cashierId: 'c-2',
    cashierName: 'Wulan',
    orderType: 'Dine In',
    items: [],
    subtotal: 10000,
    discountAmount: 0,
    taxAmount: 0,
    grandTotal: 10000,
    paymentType: 'tunai',
    amountPaid: 10000,
    changeAmount: 0,
    status: 'completed',
    deviceCode: 'B22',
    ...extra,
  });

  it('transaksi dari perangkat lain masuk; perubahan lokal yang belum terkirim tidak ditimpa', () => {
    startNewShift('c-1', 0);
    const mine = saveTransaction(makeTx('tunai'));
    expect(applyPulledData({ transactions: [remoteTx('R-1'), remoteTx(mine.id, { status: 'cancelled' })] })).toBe(1);
    const txs = getTransactions();
    expect(txs.map((t) => t.id).sort()).toEqual([mine.id, 'R-1'].sort());
    expect(txs.find((t) => t.id === 'R-1')!.isSynced).toBe(true);
    expect(txs.find((t) => t.id === mine.id)!.status).toBe('completed');

    // Setelah terkirim, perubahan dari perangkat lain (mis. dibatalkan) ikut masuk
    markTransactionsAsSynced([mine.id]);
    applyPulledData({ transactions: [{ ...getTransactions().find((t) => t.id === mine.id)!, status: 'cancelled' }] });
    expect(getTransactions().find((t) => t.id === mine.id)!.status).toBe('cancelled');
    // Data yang sama tidak dihitung sebagai perubahan
    expect(applyPulledData({ transactions: [remoteTx('R-1')] })).toBe(0);
  });

  it('menu/kasir/pengaturan dari server dipakai, pengaturan khusus perangkat tetap', () => {
    saveStoreSettings({ ...getStoreSettings(), syncApiKey: 'tok', printerMethod: 'rawbt' });
    const cfg = {
      products: [{ id: 'x-1', name: 'Kopi Remote', categoryId: 'kopi', price: 15000, stock: -1, isAvailable: true }],
      categories: [{ id: 'kopi', name: 'Kopi', iconName: 'coffee' }],
      cashiers: [{ id: 'c-9', name: 'Owner Remote', role: 'Owner' as const }],
      settings: { storeName: 'TOKO REMOTE' },
    };
    // Perubahan lokal yang lebih baru menang
    saveCategories([{ id: 'lokal', name: 'Lokal', iconName: 'x' }]);
    applyPulledData({ config: cfg, configUpdatedAt: '2020-01-01T00:00:00.000Z' });
    expect(getProducts()[0].name).not.toBe('Kopi Remote');
    expect(hasPendingPush()).toBe(true);

    applyPulledData({ config: cfg, configUpdatedAt: '2999-01-01T00:00:00.000Z' });
    expect(getProducts().map((p) => p.name)).toEqual(['Kopi Remote']);
    expect(getCashiers().map((c) => c.name)).toEqual(['Owner Remote']);
    const s = getStoreSettings();
    expect(s.storeName).toBe('TOKO REMOTE');
    expect(s.syncApiKey).toBe('tok');
    expect(s.printerMethod).toBe('rawbt');
    expect(hasPendingPush()).toBe(false);
  });

  it('pengeluaran yang dihapus di perangkat lain ikut terhapus', () => {
    const exp = addExpense({ scope: 'monthly', date: '2026-11', category: 'Sewa', amount: 100, createdBy: 'O' });
    applyPulledData({ expenses: [{ ...exp, id: 'EXP-B' }] });
    expect(getExpenses().map((e) => e.id).sort()).toEqual([exp.id, 'EXP-B'].sort());
    applyPulledData({ deletedExpenseIds: ['EXP-B'] });
    expect(getExpenses().map((e) => e.id)).toEqual([exp.id]);
  });

  it('shift perangkat lain ikut di rekap, shift sendiri tidak dobel', () => {
    const own = startNewShift('c-1', 50000);
    const other = { ...own, id: 'SHIFT-B', cashierName: 'Wulan' };
    applyPulledData({ shifts: [own, other] });
    expect(getAllShifts().map((s) => s.id)).toEqual([own.id, 'SHIFT-B']);
  });

  it('perangkat lama: server belum punya data master -> menu perangkat ini dikirim', async () => {
    saveStoreSettings({ ...getStoreSettings(), syncApiUrl: 'https://x.test/sync', syncApiKey: 'tok' });
    const configs: any[] = [];
    stubServer(
      (b) => {
        if (b.config) configs.push(b.config);
        return { configAccepted: !!b.config, configUpdatedAt: b.configEditedAt ?? null };
      },
      { ...EMPTY_PULL }
    );
    const res = await performCloudSync();
    expect(res.success).toBe(true);
    expect(configs).toHaveLength(1);
    expect(configs[0].products.length).toBeGreaterThan(0);
    expect(configs[0].settings.syncApiKey).toBeUndefined();
    expect(hasPendingPush()).toBe(false);
  });

  it('link kasir: simpan token, hapus dari URL, perangkat baru menunggu data master server', async () => {
    const replace = vi.fn();
    vi.stubGlobal('window', {
      dispatchEvent: () => true,
      location: { href: 'https://kopi.test/kasir/#token=abc123', protocol: 'https:', origin: 'https://kopi.test' },
      history: { replaceState: replace },
      confirm: () => true,
    });
    expect(consumeSyncLinkFromUrl()).toBe(true);
    expect(getStoreSettings().syncApiKey).toBe('abc123');
    expect(replace).toHaveBeenCalledWith(null, '', 'https://kopi.test/kasir/');

    // Server belum punya data master: perangkat baru TIDAK mengirim menu bawaan
    const posts: any[] = [];
    const gets = stubServer((b) => posts.push(b), { ...EMPTY_PULL });
    expect((await performCloudSync()).success).toBe(true);
    expect(posts).toHaveLength(0);
    expect(gets[0]).toContain('init=1');
    expect(gets[0]).toMatch(/^https:\/\/kopi\.test\/api\/sync/);
  });
});

describe('ganti token sync', () => {
  it('token diisi manual: perubahan menu lokal tidak menimpa data master cabang di server', async () => {
    saveCategories([{ id: 'lokal', name: 'Lokal', iconName: 'x' }]); // perubahan lokal lama
    saveStoreSettings({ ...getStoreSettings(), syncApiUrl: 'https://x.test/sync', syncApiKey: 'cabang-b' });
    const posts: any[] = [];
    const serverCfg = {
      products: [{ id: 'b-1', name: 'Kopi Cabang B', categoryId: 'kopi', price: 1, stock: -1, isAvailable: true }],
      categories: [{ id: 'kopi', name: 'Kopi', iconName: 'coffee' }],
      cashiers: [{ id: 'c-b', name: 'Owner B', role: 'Owner' }],
      settings: { storeName: 'CABANG B' },
    };
    stubServer((b) => posts.push(b), { ...EMPTY_PULL, configUpdatedAt: '2026-01-01T00:00:00.000Z', config: serverCfg });
    expect((await performCloudSync()).success).toBe(true);
    expect(posts.filter((b) => b.config)).toHaveLength(0);
    expect(getProducts().map((p) => p.name)).toEqual(['Kopi Cabang B']);
    expect(getStoreSettings().storeName).toBe('CABANG B');
  });

  it('token di-trim & error sync lama dibersihkan saat token diganti', () => {
    saveStoreSettings({ ...getStoreSettings(), syncApiKey: 'lama', lastSyncError: 'HTTP 401' });
    saveStoreSettings({ ...getStoreSettings(), syncApiKey: '  baru  ' });
    expect(getStoreSettings().syncApiKey).toBe('baru');
    expect(getStoreSettings().lastSyncError).toBeUndefined();
  });

  it('sync dengan token lama yang masih berjalan tidak menyimpan cursor ke cabang baru', async () => {
    saveStoreSettings({ ...getStoreSettings(), syncApiUrl: 'https://x.test/sync', syncApiKey: 'lama' });
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const tokens: string[] = [];
    vi.stubGlobal('fetch', async (url: string, init: any) => {
      tokens.push(init.headers['x-api-key']);
      if (init.headers['x-api-key'] === 'lama') await gate;
      const cursors = { tx: init.headers['x-api-key'] === 'lama' ? '2026-01-01T00:00:00.000Z' : '2026-11-01T00:00:00.000Z', exp: 'x', shift: 'x', del: 'x' };
      return { ok: true, json: async () => ({ ...EMPTY_PULL, configUpdatedAt: '2026-01-01T00:00:00.000Z', cursors }), text: async () => '' };
    });
    const first = performCloudSync();
    saveStoreSettings({ ...getStoreSettings(), syncApiKey: 'baru' });
    const second = performCloudSync();
    release();
    await first;
    expect((await second).success).toBe(true);
    expect(tokens).toEqual(['lama', 'baru']);
    expect(JSON.parse(localStorage.getItem('warkop_pos_pull_cursors')!).tx).toBe('2026-11-01T00:00:00.000Z');
  });
});

describe('koreksi transaksi', () => {
  const approve = { reason: 'salah catat', editedBy: 'Owner' };

  it('ubah jumlah item & metode bayar: total, stok, dan rekap shift ikut dikoreksi', () => {
    const product = getProducts().find((p) => p.stock >= 0) ?? getProducts()[0];
    const products = getProducts().map((p) => (p.id === product.id ? { ...p, stock: 10 } : p));
    saveProducts(products);
    startNewShift('c-1', 0);
    const tx = saveTransaction(makeTx('tunai', 2, product.id));
    markTransactionsAsSynced([tx.id]);
    expect(getProducts().find((p) => p.id === product.id)!.stock).toBe(8);

    const res = editTransaction(
      tx.id,
      { items: [{ ...tx.items[0], quantity: 1 }], discountAmount: 0, paymentType: 'qris', orderType: 'Takeaway' },
      approve
    );
    expect(res.ok).toBe(true);
    const t = getTransactions().find((x) => x.id === tx.id)!;
    expect(t.grandTotal).toBe(product.price);
    expect(t.paymentType).toBe('qris');
    expect(t.amountPaid).toBe(product.price);
    expect(t.isSynced).toBe(false);
    expect(t.editHistory).toHaveLength(1);
    expect(t.editHistory![0].prevGrandTotal).toBe(product.price * 2);
    expect(getProducts().find((p) => p.id === product.id)!.stock).toBe(9);
    const shift = getActiveShift()!;
    expect(shift.totalSalesCash).toBe(0);
    expect(shift.totalSalesNonCash).toBe(product.price);
    expect(shift.totalTransactions).toBe(1);
  });

  it('tunai: uang diterima harus cukup; kembalian dihitung ulang', () => {
    startNewShift('c-1', 0);
    const tx = saveTransaction({ ...makeTx('tunai', 1), amountPaid: 50000, changeAmount: 50000 - makeTx('tunai', 1).grandTotal });
    const price = tx.items[0].unitPrice;
    const bad = editTransaction(tx.id, { items: [{ ...tx.items[0], quantity: 100 }], discountAmount: 0, paymentType: 'tunai', amountPaid: 1, orderType: 'Dine In' }, approve);
    expect(bad.ok).toBe(false);
    const ok = editTransaction(tx.id, { items: tx.items, discountAmount: 0, paymentType: 'tunai', amountPaid: price + 5000, orderType: 'Dine In' }, approve);
    expect(ok.ok).toBe(true);
    expect(getTransactions().find((x) => x.id === tx.id)!.changeAmount).toBe(5000);
  });

  it('transaksi dari shift yang sudah ditutup: hanya info pelanggan yang boleh diubah', () => {
    startNewShift('c-1', 0);
    const tx = saveTransaction(makeTx('tunai'));
    closeCurrentShift(tx.grandTotal);
    expect(canEditTransactionAmounts(getTransactions()[0]).ok).toBe(false);
    const nominal = editTransaction(tx.id, { items: tx.items, discountAmount: 1000, paymentType: 'tunai', orderType: 'Dine In' }, approve);
    expect(nominal.ok).toBe(false);
    const info = editTransaction(tx.id, { items: tx.items, discountAmount: 0, paymentType: 'tunai', orderType: 'Dine In', customerName: 'Bu Ani' }, approve);
    expect(info.ok).toBe(true);
    expect(getTransactions()[0].customerName).toBe('Bu Ani');
    expect(getShiftHistory()[0].totalSalesCash).toBe(tx.grandTotal);
  });

  it('bon: wajib nama pelanggan; ganti ke tunai memindahkan rekap & status bon', () => {
    startNewShift('c-1', 0);
    const tx = saveTransaction(makeTx('tunai'));
    expect(editTransaction(tx.id, { items: tx.items, discountAmount: 0, paymentType: 'hutang', orderType: 'Dine In' }, approve).ok).toBe(false);
    expect(editTransaction(tx.id, { items: tx.items, discountAmount: 0, paymentType: 'hutang', orderType: 'Dine In', customerName: 'Pak RT' }, approve).ok).toBe(true);
    let t = getTransactions()[0];
    expect(t.debtStatus).toBe('unpaid');
    expect(getActiveShift()!.totalSalesDebt).toBe(tx.grandTotal);
    expect(getActiveShift()!.totalSalesCash).toBe(0);
    expect(editTransaction(tx.id, { items: tx.items, discountAmount: 0, paymentType: 'tunai', amountPaid: tx.grandTotal, orderType: 'Dine In', customerName: 'Pak RT' }, approve).ok).toBe(true);
    t = getTransactions()[0];
    expect(t.debtStatus).toBeUndefined();
    expect(t.editHistory).toHaveLength(2);
    expect(getActiveShift()!.totalSalesDebt).toBe(0);
  });

  it('wajib alasan & menolak jika tidak ada perubahan', () => {
    startNewShift('c-1', 0);
    const tx = saveTransaction(makeTx('qris'));
    const input = { items: tx.items, discountAmount: 0, paymentType: 'qris' as const, orderType: 'Dine In' as const };
    expect(editTransaction(tx.id, input, { reason: ' ', editedBy: 'O' }).ok).toBe(false);
    expect(editTransaction(tx.id, input, approve).message).toBe('Tidak ada perubahan.');
  });
});
