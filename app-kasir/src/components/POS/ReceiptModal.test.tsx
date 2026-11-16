import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { INITIAL_PRODUCTS, INITIAL_STORE_SETTINGS } from '../../data/initialData';
import { Transaction } from '../../types';
import { formatIDR } from '../../lib/storage';
import { ReceiptModal } from './ReceiptModal';
import { TransactionOrderDetails } from './TransactionOrderDetails';

// Portal cetak membutuhkan document.body; tampilan detail dan pratinjau tetap dirender asli.
vi.mock('./ThermalReceipt', async (importOriginal) => ({
  ...await importOriginal<typeof import('./ThermalReceipt')>(),
  ThermalReceiptPrintPortal: () => null,
}));

const transaction: Transaction = {
  id: 'WKP-TEST-0001', timestamp: '2026-11-12T06:45:00.000Z',
  cashierId: 'cashier-test', cashierName: 'Kasir Uji', orderType: 'Dine In',
  customerName: 'Meja 4', notes: 'Sajikan bersama makanan',
  items: [
    {
      cartItemId: 'latte-ice', product: { ...INITIAL_PRODUCTS[0], name: 'Latte Uji', price: 99000 },
      quantity: 2, selectedOptions: [{ groupName: 'Suhu', choiceLabel: 'Ice', extraPrice: 2000 }],
      notes: 'Tanpa gula\nEs sedikit', unitPrice: 22000, totalPrice: 44000,
    },
    {
      cartItemId: 'latte-hot', product: { ...INITIAL_PRODUCTS[0], name: 'Latte Uji', price: 99000 },
      quantity: 1, selectedOptions: [{ groupName: 'Suhu', choiceLabel: 'Hot', extraPrice: 0 }],
      unitPrice: 20000, totalPrice: 20000,
    },
  ],
  subtotal: 64000, discountAmount: 4000, discountReason: 'Promo lama', taxAmount: 6000,
  grandTotal: 66000, paymentType: 'tunai', amountPaid: 70000, changeAmount: 4000,
  status: 'completed',
};

describe('rincian pesanan dari riwayat transaksi', () => {
  it('membuka detail pesanan sebagai default di riwayat, dengan opsi pratinjau dan cetak struk', () => {
    const html = renderToStaticMarkup(<ReceiptModal transaction={transaction} storeSettings={INITIAL_STORE_SETTINGS} variant="history" onClose={() => {}} onNewTransaction={() => {}} />);
    expect(html).toContain('Detail Transaksi');
    expect(html).toMatch(/role="tab"[^>]*aria-selected="true"[^>]*>[\s\S]*?Detail Pesanan<\/button>/);
    expect(html).toContain('Pratinjau Struk');
    expect(html).toContain('Suhu: Ice');
    expect(html).toContain('Tanpa gula');
    expect(html).toContain('Cetak Struk');
    expect(html).toContain('TUTUP DETAIL');
    expect(html).not.toContain('Pembayaran Berhasil!');
    expect(html).not.toContain('Kertas 58mm');
    expect(html).not.toContain('TRANSAKSI BARU');
  });

  it('tetap membuka pratinjau struk setelah pembayaran baru', () => {
    const html = renderToStaticMarkup(<ReceiptModal transaction={transaction} storeSettings={INITIAL_STORE_SETTINGS} onClose={() => {}} onNewTransaction={() => {}} />);
    expect(html).toContain('Pembayaran Berhasil!');
    expect(html).toMatch(/role="tab"[^>]*aria-selected="true"[^>]*>[\s\S]*?Pratinjau Struk<\/button>/);
    expect(html).toContain('Kertas 58mm');
    expect(html).toContain('TRANSAKSI BARU');
    expect(html).not.toContain('Sajikan bersama makanan');
  });

  it('memisahkan variasi produk dan memakai jumlah, opsi, catatan, serta nominal snapshot', () => {
    const before = structuredClone(transaction);
    const html = renderToStaticMarkup(<TransactionOrderDetails transaction={transaction} />);
    expect(html.match(/Latte Uji/g)).toHaveLength(2);
    expect(html).toContain('Suhu: Ice');
    expect(html).toContain('Suhu: Hot');
    expect(html).toContain('Tanpa gula\nEs sedikit');
    expect(html).toContain('Sajikan bersama makanan');
    expect(html).toContain('2 porsi ×');
    expect(html).toContain('3 porsi');
    for (const amount of [22000, 44000, 20000, 64000, 4000, 6000, 66000]) {
      expect(html).toContain(formatIDR(amount));
    }
    expect(html).not.toContain(formatIDR(99000));
    expect(html).not.toMatch(/<(input|textarea|button)\b/);
    expect(transaction).toEqual(before);
  });

  it('menerima transaksi lama tanpa opsi atau catatan', () => {
    const legacy = { ...transaction, notes: undefined, items: [{ ...transaction.items[0], selectedOptions: undefined, notes: undefined }] };
    const html = renderToStaticMarkup(<TransactionOrderDetails transaction={legacy} />);
    expect(html).toContain('Latte Uji');
    expect(html).not.toContain('Catatan');
    expect(html).not.toContain('Suhu:');
  });

  it('menunjukkan status bon dan pembatalan tanpa menganggap semuanya lunas', () => {
    const debt: Transaction = { ...transaction, paymentType: 'hutang', amountPaid: 0, changeAmount: 0, debtStatus: 'unpaid' };
    const unpaid = renderToStaticMarkup(<TransactionOrderDetails transaction={debt} />);
    expect(unpaid).toContain('Bon Belum Lunas');
    expect(unpaid).not.toContain('>Dibayar<');
    const paid = renderToStaticMarkup(<TransactionOrderDetails transaction={{ ...debt, debtStatus: 'paid' }} />);
    expect(paid).toContain('>Lunas<');
    const cancelled = renderToStaticMarkup(<TransactionOrderDetails transaction={{ ...debt, status: 'cancelled', cancelReason: 'Salah pesanan' }} />);
    expect(cancelled).toContain('Dibatalkan');
    expect(cancelled).toContain('Alasan pembatalan: Salah pesanan');
    expect(cancelled).not.toContain('Bon Belum Lunas');
  });

  it('memberi keterangan ketika snapshot tidak memuat item', () => {
    const html = renderToStaticMarkup(<TransactionOrderDetails transaction={{ ...transaction, items: [] }} />);
    expect(html).toContain('Detail produk tidak tersedia');
  });
});
