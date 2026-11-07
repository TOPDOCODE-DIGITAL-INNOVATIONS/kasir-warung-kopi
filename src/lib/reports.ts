import { Shift, Transaction } from '../types';

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
  const paymentBreakdown: SalesReport['paymentBreakdown'] = {};
  const productMap: Record<string, { name: string; qty: number; revenue: number }> = {};

  completed.forEach((t) => {
    grossSales += t.subtotal;
    discounts += t.discountAmount;
    tax += t.taxAmount;
    netSales += t.grandTotal;

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
    paymentBreakdown,
    topProducts: Object.values(productMap)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5),
  };
}

/** Uang tunai yang seharusnya ada di laci. */
export function getExpectedDrawerCash(shift: Shift): number {
  return shift.startingCash + shift.totalSalesCash + (shift.debtCollectedCash ?? 0);
}
