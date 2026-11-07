import { describe, expect, it } from 'vitest';
import { computeDailyClosing, dailyClosingToText } from './reports';
import { Expense, Shift, Transaction } from '../types';

const at = (d: number, h = 10) => new Date(2026, 10, d, h).toISOString(); // November 2026, waktu lokal
const DATE = '2026-11-07';
const base = {
  cashierId: 'c',
  cashierName: 'Budi',
  orderType: 'Dine In' as const,
  items: [],
  subtotal: 0,
  discountAmount: 0,
  taxAmount: 0,
  amountPaid: 0,
  changeAmount: 0,
  status: 'completed' as const,
};

const txs: Transaction[] = [
  { ...base, id: '1', timestamp: at(7), grandTotal: 18500, paymentType: 'tunai', amountPaid: 20000, changeAmount: 1000, overpayAmount: 500 },
  { ...base, id: '2', timestamp: at(7), grandTotal: 30000, paymentType: 'tunai' },
  { ...base, id: '3', timestamp: at(7), grandTotal: 25000, paymentType: 'qris' },
  { ...base, id: '4', timestamp: at(7), grandTotal: 40000, paymentType: 'transfer' },
  { ...base, id: '5', timestamp: at(7), grandTotal: 15000, paymentType: 'tunai', status: 'cancelled' },
  { ...base, id: '6', timestamp: at(7), grandTotal: 12000, paymentType: 'hutang', debtStatus: 'unpaid' },
  // bon kemarin, dilunasi hari ini tunai
  { ...base, id: '7', timestamp: at(6), grandTotal: 20000, paymentType: 'hutang', debtStatus: 'paid', debtPaidAt: at(7, 15), debtPaidMethod: 'tunai' },
  // transaksi hari lain tidak ikut
  { ...base, id: '8', timestamp: at(6), grandTotal: 99999, paymentType: 'tunai' },
];

const exps: Expense[] = [
  { id: 'e1', scope: 'daily', date: DATE, category: 'Es Batu', amount: 10000, fromDrawer: true, createdBy: 'x', createdAt: '' },
  { id: 'e2', scope: 'daily', date: DATE, category: 'Gas', amount: 25000, fromDrawer: false, createdBy: 'x', createdAt: '' },
  { id: 'e3', scope: 'monthly', date: '2026-11', category: 'Sewa', amount: 1000000, createdBy: 'x', createdAt: '' },
  { id: 'e4', scope: 'daily', date: '2026-11-06', category: 'Gas', amount: 777, createdBy: 'x', createdAt: '' },
];

// Shift hari ini: modal 100rb, tunai 48.500 + kelebihan 500 + pelunasan 20rb - laci 10rb = 159.000
const shift: Shift = {
  id: 's1',
  cashierId: 'c',
  cashierName: 'Budi',
  startTime: at(7, 8),
  endTime: at(7, 22),
  startingCash: 100000,
  totalSalesCash: 48500,
  totalSalesNonCash: 65000,
  totalSalesDebt: 12000,
  overpayCash: 500,
  debtCollectedCash: 20000,
  expensesCash: 10000,
  totalTransactions: 5,
  expectedCash: 159000,
  endingCashActual: 159000,
  status: 'closed',
};

describe('closing harian', () => {
  it('memisahkan pemasukan per metode, kelebihan, bon, dan pelunasan', () => {
    const c = computeDailyClosing(DATE, txs, exps, [shift]);
    expect(c.orders).toBe(5);
    expect(c.cancelled).toBe(1);
    expect(c.byMethod.tunai).toEqual({ count: 2, total: 48500 });
    expect(c.byMethod.qris).toEqual({ count: 1, total: 25000 });
    expect(c.byMethod.transfer).toEqual({ count: 1, total: 40000 });
    expect(c.overpay).toBe(500);
    expect(c.debtNew).toEqual({ count: 1, total: 12000 });
    expect(c.debtCollectedCash).toBe(20000);
    expect(c.sales).toBe(48500 + 25000 + 40000 + 12000);
    expect(c.cashIn).toBe(48500 + 500 + 20000);
    expect(c.nonCashIn).toBe(65000);
  });

  it('hanya pengeluaran harian di tanggal itu, dipisah laci / luar laci', () => {
    const c = computeDailyClosing(DATE, txs, exps, [shift]);
    expect(c.expensesDrawer).toBe(10000);
    expect(c.expensesOther).toBe(25000);
    expect(c.expenses).toHaveLength(2);
    expect(c.net).toBe(69000 + 65000 - 35000);
  });

  it('uang laci seharusnya cocok dengan shift, dan balance bila fisik sama', () => {
    const c = computeDailyClosing(DATE, txs, exps, [shift]);
    expect(c.startingCash).toBe(100000);
    expect(c.expectedCash).toBe(159000);
    expect(c.expectedCash).toBe(shift.expectedCash);
    expect(c.shiftDifference).toBe(0);
    expect(c.hasOpenShift).toBe(false);
  });

  it('menandai selisih kurang dan shift yang masih buka', () => {
    const short = computeDailyClosing(DATE, txs, exps, [{ ...shift, endingCashActual: 154000 }]);
    expect(short.shiftDifference).toBe(-5000);

    const open = computeDailyClosing(DATE, txs, exps, [{ ...shift, status: 'open', endTime: undefined, endingCashActual: undefined }]);
    expect(open.hasOpenShift).toBe(true);
    expect(open.shiftDifference).toBeNull();
  });

  it('teks rekap berisi angka penting', () => {
    const fmt = (n: number) => `Rp${n}`;
    const text = dailyClosingToText(computeDailyClosing(DATE, txs, exps, [shift]), 'RUAS KOPI', fmt);
    expect(text).toContain('QRIS: Rp25000 (1)');
    expect(text).toContain('Kelebihan (permen): Rp500');
    expect(text).toContain('Seharusnya: Rp159000');
    expect(text).toContain('selisih +Rp0');
  });
});
