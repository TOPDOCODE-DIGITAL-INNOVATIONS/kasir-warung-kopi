import { Expense, Shift, Transaction } from '../types';

export type DateRangePreset = 'today' | 'yesterday' | '7d' | '30d' | 'month' | 'all' | 'custom';

export interface DateRange {
  start: Date | null; // inklusif
  end: Date | null; // eksklusif
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}

/** Tanggal lokal format YYYY-MM-DD (bukan UTC). */
export function toLocalDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseLocalDateKey(key: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function resolveDateRange(
  preset: DateRangePreset,
  now: Date = new Date(),
  customStart?: string,
  customEnd?: string
): DateRange {
  const today = startOfDay(now);
  switch (preset) {
    case 'today':
      return { start: today, end: addDays(today, 1) };
    case 'yesterday':
      return { start: addDays(today, -1), end: today };
    case '7d':
      return { start: addDays(today, -6), end: addDays(today, 1) };
    case '30d':
      return { start: addDays(today, -29), end: addDays(today, 1) };
    case 'month':
      return { start: new Date(today.getFullYear(), today.getMonth(), 1), end: addDays(today, 1) };
    case 'custom': {
      const s = customStart ? parseLocalDateKey(customStart) : null;
      const e = customEnd ? parseLocalDateKey(customEnd) : null;
      return { start: s, end: e ? addDays(e, 1) : null };
    }
    case 'all':
    default:
      return { start: null, end: null };
  }
}

export function isInRange(iso: string, range: DateRange): boolean {
  const t = new Date(iso).getTime();
  if (range.start && t < range.start.getTime()) return false;
  if (range.end && t >= range.end.getTime()) return false;
  return true;
}

export interface SalesReport {
  orders: number;
  grossSales: number; // subtotal sebelum diskon
  discounts: number;
  tax: number;
  netSales: number; // grand total (termasuk pajak)
  revenueExTax: number; // subtotal - diskon
  cogs: number; // harga pokok (modal)
  grossProfit: number; // revenueExTax - cogs
  itemsWithoutCost: number; // jumlah porsi yang produknya tidak punya harga modal
  avgTicket: number;
  outstandingDebt: number; // bon belum lunas pada periode ini
  overpay: number; // kelebihan (kembalian permen), di luar omset
  paymentBreakdown: Record<string, { count: number; total: number }>;
  topProducts: { name: string; qty: number; revenue: number }[];
}

export function computeSalesReport(transactions: Transaction[]): SalesReport {
  const completed = transactions.filter((t) => t.status === 'completed');

  let grossSales = 0;
  let discounts = 0;
  let tax = 0;
  let netSales = 0;
  let cogs = 0;
  let itemsWithoutCost = 0;
  let outstandingDebt = 0;
  let overpay = 0;
  const paymentBreakdown: SalesReport['paymentBreakdown'] = {};
  const productMap: Record<string, { name: string; qty: number; revenue: number }> = {};

  completed.forEach((t) => {
    grossSales += t.subtotal;
    discounts += t.discountAmount;
    tax += t.taxAmount;
    netSales += t.grandTotal;
    overpay += t.overpayAmount ?? 0;

    if (t.paymentType === 'hutang' && t.debtStatus !== 'paid') {
      outstandingDebt += t.grandTotal;
    }

    const pt = t.paymentType.toUpperCase();
    if (!paymentBreakdown[pt]) paymentBreakdown[pt] = { count: 0, total: 0 };
    paymentBreakdown[pt].count += 1;
    paymentBreakdown[pt].total += t.grandTotal;

    t.items.forEach((item) => {
      const cost = item.product.costPrice;
      if (cost && cost > 0) {
        cogs += cost * item.quantity;
      } else {
        itemsWithoutCost += item.quantity;
      }

      const name = item.product.name;
      if (!productMap[name]) productMap[name] = { name, qty: 0, revenue: 0 };
      productMap[name].qty += item.quantity;
      productMap[name].revenue += item.totalPrice;
    });
  });

  const revenueExTax = grossSales - discounts;

  return {
    orders: completed.length,
    grossSales,
    discounts,
    tax,
    netSales,
    revenueExTax,
    cogs,
    grossProfit: revenueExTax - cogs,
    itemsWithoutCost,
    avgTicket: completed.length > 0 ? netSales / completed.length : 0,
    outstandingDebt,
    overpay,
    paymentBreakdown,
    topProducts: Object.values(productMap)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5),
  };
}

/** Uang tunai yang seharusnya ada di laci. */
export function getExpectedDrawerCash(shift: Shift): number {
  return (
    shift.startingCash +
    shift.totalSalesCash +
    (shift.overpayCash ?? 0) +
    (shift.debtCollectedCash ?? 0) -
    (shift.expensesCash ?? 0)
  );
}

// -------------------------------------------------------------
// REKAP BULANAN (format seperti buku kas: Cash | QRIS | Penjualan | Pengeluaran | Total)
// -------------------------------------------------------------

export interface DailyRecapRow {
  date: string; // YYYY-MM-DD
  cash: number; // penjualan tunai + pelunasan bon tunai
  nonCash: number; // QRIS, transfer, e-wallet, debit + pelunasan bon non-tunai
  sales: number; // cash + nonCash (uang yang benar-benar masuk)
  overpay: number; // kelebihan (kembalian permen)
  expenses: number; // pengeluaran harian
  total: number; // sales + overpay - expenses
  orders: number;
}

export interface MonthlyRecap {
  month: string; // YYYY-MM
  days: DailyRecapRow[];
  totalCash: number;
  totalNonCash: number;
  totalSales: number;
  totalOverpay: number;
  totalDailyExpenses: number;
  totalAfterDaily: number;
  monthlyExpenses: Expense[];
  totalMonthlyExpenses: number;
  netProfit: number; // totalAfterDaily - pengeluaran bulanan
  unpaidDebt: number; // bon bulan ini yang belum dibayar (belum jadi uang)
}

export function toMonthKey(d: Date): string {
  return toLocalDateKey(d).slice(0, 7);
}

export function computeMonthlyRecap(
  month: string,
  transactions: Transaction[],
  expenses: Expense[],
  now: Date = new Date()
): MonthlyRecap {
  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const todayKey = toLocalDateKey(now);

  const rows = new Map<string, DailyRecapRow>();
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${month}-${String(d).padStart(2, '0')}`;
    rows.set(key, { date: key, cash: 0, nonCash: 0, sales: 0, overpay: 0, expenses: 0, total: 0, orders: 0 });
  }
  const dayKey = (iso: string) => toLocalDateKey(new Date(iso));

  let unpaidDebt = 0;
  transactions.forEach((t) => {
    if (t.status !== 'completed') return;
    const saleRow = rows.get(dayKey(t.timestamp));
    if (saleRow) {
      saleRow.orders += 1;
      saleRow.overpay += t.overpayAmount ?? 0;
    }

    if (t.paymentType === 'hutang') {
      if (t.debtStatus === 'paid' && t.debtPaidAt) {
        const paidRow = rows.get(dayKey(t.debtPaidAt));
        if (paidRow) {
          if (t.debtPaidMethod === 'tunai') paidRow.cash += t.grandTotal;
          else paidRow.nonCash += t.grandTotal;
        }
      } else if (saleRow) {
        unpaidDebt += t.grandTotal;
      }
      return;
    }
    if (!saleRow) return;
    if (t.paymentType === 'tunai') saleRow.cash += t.grandTotal;
    else saleRow.nonCash += t.grandTotal;
  });

  const monthlyExpenses: Expense[] = [];
  expenses.forEach((e) => {
    if (e.scope === 'monthly') {
      if (e.date === month) monthlyExpenses.push(e);
      return;
    }
    const row = rows.get(e.date);
    if (row) row.expenses += e.amount;
  });

  // Hari yang belum terjadi tidak ditampilkan
  const days = [...rows.values()].filter((r) => r.date <= todayKey);
  days.forEach((r) => {
    r.sales = r.cash + r.nonCash;
    r.total = r.sales + r.overpay - r.expenses;
  });

  const sum = (f: (r: DailyRecapRow) => number) => days.reduce((a, r) => a + f(r), 0);
  const totalAfterDaily = sum((r) => r.total);
  const totalMonthlyExpenses = monthlyExpenses.reduce((a, e) => a + e.amount, 0);

  return {
    month,
    days,
    totalCash: sum((r) => r.cash),
    totalNonCash: sum((r) => r.nonCash),
    totalSales: sum((r) => r.sales),
    totalOverpay: sum((r) => r.overpay),
    totalDailyExpenses: sum((r) => r.expenses),
    totalAfterDaily,
    monthlyExpenses,
    totalMonthlyExpenses,
    netProfit: totalAfterDaily - totalMonthlyExpenses,
    unpaidDebt,
  };
}

/** Angka format buku kas: 1,234,567.00 (sama dengan file sampel). */
function bookNum(n: number): string {
  const s = Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return n < 0 ? `-${s}` : s;
}

/** Teks tab-separated, bisa langsung di-paste ke Excel / Google Sheets. */
export function monthlyRecapToTSV(recap: MonthlyRecap): string {
  const lines = [['Tanggal', 'Cash', 'QRIS', 'Penjualan', 'Kelebihan', 'Pengeluaran', 'Total'].join('\t')];
  recap.days.forEach((r) =>
    lines.push(
      [r.date, bookNum(r.cash), bookNum(r.nonCash), bookNum(r.sales), bookNum(r.overpay), bookNum(r.expenses), bookNum(r.total)].join('\t')
    )
  );
  lines.push(
    [
      'TOTAL',
      bookNum(recap.totalCash),
      bookNum(recap.totalNonCash),
      bookNum(recap.totalSales),
      bookNum(recap.totalOverpay),
      bookNum(recap.totalDailyExpenses),
      bookNum(recap.totalAfterDaily),
    ].join('\t')
  );
  if (recap.monthlyExpenses.length > 0) {
    lines.push('');
    lines.push('Pengeluaran Bulanan\t\t\t\t\t\t');
    recap.monthlyExpenses.forEach((e) =>
      lines.push([e.category + (e.note ? ` - ${e.note}` : ''), '', '', '', '', bookNum(e.amount), ''].join('\t'))
    );
    lines.push(['Total Pengeluaran Bulanan', '', '', '', '', bookNum(recap.totalMonthlyExpenses), ''].join('\t'));
  }
  lines.push('');
  lines.push(['LABA BERSIH', '', '', '', '', '', bookNum(recap.netProfit)].join('\t'));
  return lines.join('\n') + '\n';
}
