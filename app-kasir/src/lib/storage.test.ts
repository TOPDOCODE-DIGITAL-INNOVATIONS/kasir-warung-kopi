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
    expect(tsv.split('\n')[1]).toBe('2026-10-01\t510,000.00\t45,000.00\t555,000.00\t0.00\t555,000.00');
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
    vi.stubGlobal('fetch', async (_url: string, init: any) => {
      bodies.push(JSON.parse(init.body));
      return { ok: true, text: async () => '' };
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
    const withProducts: boolean[] = [];
    vi.stubGlobal('fetch', async (_url: string, init: any) => {
      const body = JSON.parse(init.body);
      sizes.push(body.transactions.length);
      withProducts.push(Array.isArray(body.products));
      return { ok: true, text: async () => '' };
    });
    const res = await performCloudSync();
    expect(res.success).toBe(true);
    expect(sizes).toEqual([200, 200, 50]);
    expect(withProducts).toEqual([true, false, false]);
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

