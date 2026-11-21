import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetStorageStateForTests,
  canCreateSales,
  generateReceiptId,
  getDeviceAccess,
  getProducts,
  getStoreSettings,
  getTransactions,
  getUnsyncedCount,
  performCloudSync,
  recordDeviceAccess,
  saveStoreSettings,
  saveTransaction,
  startNewShift,
  SALES_BLOCKED_MESSAGE,
} from './storage';
import type { Transaction } from '../types';

class MemoryStorage {
  private store = new Map<string, string>();
  getItem(k: string) { return this.store.has(k) ? this.store.get(k)! : null; }
  setItem(k: string, v: string) { this.store.set(k, String(v)); }
  removeItem(k: string) { this.store.delete(k); }
  clear() { this.store.clear(); }
}

const dispatched: string[] = [];
beforeEach(() => {
  dispatched.length = 0;
  vi.stubGlobal('localStorage', new MemoryStorage());
  vi.stubGlobal('window', { dispatchEvent: (e: { type: string }) => { dispatched.push(e.type); return true; } });
  vi.stubGlobal('CustomEvent', class { constructor(public type: string) {} });
  __resetStorageStateForTests();
});

const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * 86400000).toISOString();

function tx(): Transaction {
  const product = getProducts()[0];
  return {
    id: generateReceiptId(), timestamp: new Date().toISOString(), cashierId: 'c-1', cashierName: 'Budi', orderType: 'Dine In',
    items: [{ cartItemId: `${product.id}--`, product, quantity: 1, selectedOptions: [], unitPrice: product.price, totalPrice: product.price }],
    subtotal: product.price, discountAmount: 0, taxAmount: 0, grandTotal: product.price, paymentType: 'tunai',
    amountPaid: product.price, changeAmount: 0, status: 'completed',
  };
}

describe('status langganan di perangkat kasir', () => {
  it('perangkat yang belum pernah sync tetap bisa berjualan', () => {
    expect(getDeviceAccess()).toBeNull();
    expect(canCreateSales()).toBe(true);
  });

  it('menyimpan status valid dan mengabaikan data rusak/null', () => {
    recordDeviceAccess({ state: 'trial', graceEndsAt: iso(5), checkedAt: iso(0) });
    expect(getDeviceAccess()?.state).toBe('trial');
    for (const bad of [null, undefined, 'expired', { state: 'hacked', graceEndsAt: null, checkedAt: iso(0) }, { state: 'expired', graceEndsAt: 5, checkedAt: iso(0) }, { state: 'expired', graceEndsAt: null, checkedAt: 'x' }]) {
      recordDeviceAccess(bad);
    }
    expect(getDeviceAccess()?.state).toBe('trial');
  });

  it('memberi tahu UI hanya saat status berubah', () => {
    recordDeviceAccess({ state: 'trial', graceEndsAt: iso(5), checkedAt: iso(0) });
    recordDeviceAccess({ state: 'trial', graceEndsAt: iso(5), checkedAt: iso(0) });
    expect(dispatched.length).toBe(1);
    recordDeviceAccess({ state: 'expired', graceEndsAt: iso(-1), checkedAt: iso(0) });
    expect(dispatched.length).toBe(2);
  });

  it('menolak transaksi baru saat langganan habis, dan mengizinkan lagi setelah diperpanjang', () => {
    startNewShift('c-1', 0);
    recordDeviceAccess({ state: 'expired', graceEndsAt: iso(-1), checkedAt: iso(0) });
    expect(canCreateSales()).toBe(false);
    expect(() => saveTransaction(tx())).toThrow(SALES_BLOCKED_MESSAGE);
    expect(getTransactions()).toHaveLength(0);

    recordDeviceAccess({ state: 'active', graceEndsAt: iso(33), checkedAt: iso(0) });
    expect(canCreateSales()).toBe(true);
    expect(saveTransaction(tx()).id).toBeTruthy();
  });

  it('memblokir offline begitu jam perangkat melewati batas toleransi', () => {
    recordDeviceAccess({ state: 'grace', graceEndsAt: iso(-0.01), checkedAt: iso(-1) });
    expect(canCreateSales()).toBe(false);
  });

  it('sync tetap mengirim transaksi lama dan menyimpan status akses dari server', async () => {
    startNewShift('c-1', 0);
    saveTransaction(tx());
    saveStoreSettings({ ...getStoreSettings(), syncApiUrl: 'https://x.test/sync', syncApiKey: 'tok' });
    recordDeviceAccess({ state: 'expired', graceEndsAt: iso(-1), checkedAt: iso(0) });
    expect(getUnsyncedCount()).toBe(1);

    const posted: unknown[] = [];
    vi.stubGlobal('fetch', async (_url: string, init: { method?: string; body?: string }) => {
      if (init?.method === 'GET') {
        return { ok: true, text: async () => '', json: async () => ({
          configUpdatedAt: '2026-01-01T00:00:00.000Z', config: null, transactions: [], expenses: [], shifts: [], deletedExpenseIds: [], hasMore: false,
          access: { state: 'active', graceEndsAt: iso(30), checkedAt: iso(0) },
        }) };
      }
      posted.push(JSON.parse(init.body!));
      return { ok: true, text: async () => '', json: async () => ({ success: true, data: {}, access: { state: 'expired', graceEndsAt: iso(-1), checkedAt: iso(0) } }) };
    });

    expect((await performCloudSync()).success).toBe(true);
    expect((posted[0] as { transactions: unknown[] }).transactions).toHaveLength(1);
    expect(getUnsyncedCount()).toBe(0);
    // Tarikan data (GET) terjadi setelah kirim; status terbarunya yang berlaku.
    expect(getDeviceAccess()?.state).toBe('active');
    expect(canCreateSales()).toBe(true);
  });
});
