import { describe, expect, it } from 'vitest';
import { buildReceiptLines, leftRight, renderLineText, rp, toAscii, wrap } from './receipt';
import { encodeEscPos } from './escpos';
import { INITIAL_PRODUCTS, INITIAL_STORE_SETTINGS } from '../data/initialData';
import { Transaction } from '../types';

const product = { ...INITIAL_PRODUCTS[0], name: 'Kopi Susu Gula Aren Spesial Ukuran Jumbo Banget' };

const tx: Transaction = {
  id: 'WKP-20261107-K7Q-0001',
  timestamp: new Date(2026, 10, 7, 9, 5).toISOString(),
  cashierId: 'c-1',
  cashierName: 'Budi Santoso',
  orderType: 'Dine In',
  customerName: 'Mas Andi',
  items: [
    {
      cartItemId: 'x',
      product,
      quantity: 12,
      selectedOptions: [{ groupName: 'Suhu', choiceLabel: 'Es', extraPrice: 0 }],
      notes: 'kurangi es, gula sedikit saja ya kak',
      unitPrice: 18000,
      totalPrice: 216000,
    },
  ],
  subtotal: 216000,
  discountAmount: 16000,
  taxAmount: 20000,
  grandTotal: 220000,
  paymentType: 'tunai',
  amountPaid: 250000,
  changeAmount: 30000,
  status: 'completed',
};

describe('format struk 58mm (RPP02N)', () => {
  const lines = buildReceiptLines(tx, INITIAL_STORE_SETTINGS, 58);

  it('tidak ada baris melebihi 31 karakter (15 untuk huruf besar)', () => {
    lines.forEach((l) => {
      const max = l.double ? 15 : 31;
      expect(renderLineText(l, 58).length, JSON.stringify(l)).toBeLessThanOrEqual(max);
    });
  });

  it('hanya karakter ASCII', () => {
    lines.forEach((l) => expect(/^[\x20-\x7e]*$/.test(l.text)).toBe(true));
  });

  it('berisi total & kembalian dengan rata kanan', () => {
    const total = lines.find((l) => l.text.startsWith('TOTAL'))!;
    expect(total.text).toHaveLength(31);
    expect(total.text.endsWith('Rp220.000')).toBe(true);
    expect(lines.some((l) => l.text.startsWith('Kembali') && l.text.endsWith('Rp30.000'))).toBe(true);
  });

  it('menandai bon belum lunas & transaksi batal', () => {
    const bon = buildReceiptLines({ ...tx, paymentType: 'hutang', debtStatus: 'unpaid' }, INITIAL_STORE_SETTINGS);
    expect(bon.some((l) => l.text.includes('BELUM LUNAS'))).toBe(true);
    const batal = buildReceiptLines({ ...tx, status: 'cancelled' }, INITIAL_STORE_SETTINGS);
    expect(batal.some((l) => l.text.includes('DIBATALKAN'))).toBe(true);
  });

  it('80mm memakai 47 karakter', () => {
    const l80 = buildReceiptLines(tx, INITIAL_STORE_SETTINGS, 80);
    expect(l80.find((l) => l.text.startsWith('TOTAL'))!.text).toHaveLength(47);
  });
});

describe('helper', () => {
  it('rp tanpa NBSP', () => {
    expect(rp(1250000)).toBe('Rp1.250.000');
    expect(rp(-2000)).toBe('-Rp2.000');
  });

  it('toAscii membuang karakter non-ASCII', () => {
    expect(toAscii('Café • “Mantap” Rp')).toBe('Cafe * "Mantap" Rp');
  });

  it('wrap memotong kata panjang', () => {
    expect(wrap('a'.repeat(40), 32)).toEqual(['a'.repeat(32), 'a'.repeat(8)]);
  });

  it('leftRight memotong label yang terlalu panjang', () => {
    const s = leftRight('Label yang sangat panjang sekali', 'Rp10.000', 32);
    expect(s).toHaveLength(32);
    expect(s.endsWith(' Rp10.000')).toBe(true);
  });
});

describe('ESC/POS', () => {
  it('diawali ESC @, diakhiri feed, tanpa perintah potong (RPP02N tidak punya cutter)', () => {
    const bytes = Array.from(encodeEscPos([{ text: 'HALO', align: 'center', bold: true }]));
    expect(bytes.slice(0, 2)).toEqual([0x1b, 0x40]);
    expect(bytes.slice(-3)).toEqual([0x1b, 0x64, 3]);
    const hasCut = bytes.some((b, i) => b === 0x1d && bytes[i + 1] === 0x56);
    expect(hasCut).toBe(false);
    expect(String.fromCharCode(...bytes)).toContain('HALO\n');
  });
});

describe('struk ringkas', () => {
  it('lebih pendek dari format lengkap dan tetap memuat info penting', () => {
    const one = { ...tx, items: [{ ...tx.items[0], quantity: 1, totalPrice: 18000, notes: undefined }] };
    const compact = buildReceiptLines(one, INITIAL_STORE_SETTINGS, 58);
    const full = buildReceiptLines(one, { ...INITIAL_STORE_SETTINGS, receiptCompact: false }, 58);
    expect(compact.length).toBeLessThan(full.length * 0.75);
    const text = compact.map((l) => l.text).join('\n');
    expect(text).toContain('WKP-20261107-K7Q-0001');
    expect(text).toContain('Budi Santoso');
    expect(text).toMatch(/TOTAL\s+Rp220\.000/);
    compact.forEach((l) => expect(renderLineText(l, 58).length).toBeLessThanOrEqual(l.double ? 15 : 31));
  });

  it('menampilkan informasi WiFi di struk bila diisi di pengaturan', () => {
    const withWifi = buildReceiptLines(
      tx,
      { ...INITIAL_STORE_SETTINGS, wifiName: 'RUAS KOPI', wifiPassword: 'kopibali123' },
      58
    );
    const text = withWifi.map((l) => l.text).join('\n');
    expect(text).toContain('RUAS KOPI');
    expect(text).toContain('kopibali123');
    withWifi.forEach((l) => expect(renderLineText(l, 58).length).toBeLessThanOrEqual(l.double ? 15 : 31));
  });
});
