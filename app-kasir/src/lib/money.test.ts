import { describe, expect, it } from 'vitest';
import { caretAfterFormat, formatRupiahInput, parseRupiah } from './money';

describe('format rupiah saat mengetik', () => {
  it('memberi titik ribuan', () => {
    expect(formatRupiahInput(0)).toBe('0');
    expect(formatRupiahInput(500)).toBe('500');
    expect(formatRupiahInput(50000)).toBe('50.000');
    expect(formatRupiahInput(1250000)).toBe('1.250.000');
    expect(formatRupiahInput(-5)).toBe('0');
  });

  it('membaca angka dari teks apa pun', () => {
    expect(parseRupiah('')).toBe(0);
    expect(parseRupiah('Rp 1.250.000')).toBe(1250000);
    expect(parseRupiah('50.0001')).toBe(500001);
    expect(parseRupiah('007')).toBe(7);
    expect(parseRupiah('abc')).toBe(0);
  });

  it('kursor tetap di posisi digit yang sama setelah diformat', () => {
    // "5000|0" (sisa 1 digit di kanan) -> "50.00|0"
    expect(caretAfterFormat('50.000', 1)).toBe(5);
    // kursor di akhir
    expect(caretAfterFormat('50.000', 0)).toBe(6);
    // semua digit di kanan -> awal
    expect(caretAfterFormat('50.000', 5)).toBe(0);
  });
});
