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
} from './storage';
import { verifyPin, hashPin, isValidPin, sha256Hex } from './security';
import { can } from './permissions';
import { computeSalesReport, resolveDateRange, isInRange } from './reports';
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
