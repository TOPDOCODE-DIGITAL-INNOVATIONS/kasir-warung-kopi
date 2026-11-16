/** Ambil angka dari teks input rupiah ("Rp 1.250.000" -> 1250000). Kosong -> 0. */
export function parseRupiah(text: string): number {
  const digits = text.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  return digits ? Number(digits) : 0;
}

/** Format angka untuk isi input dengan pemisah ribuan titik (1250000 -> "1.250.000"). */
export function formatRupiahInput(value: number): string {
  const n = Math.max(0, Math.round(Number.isFinite(value) ? value : 0));
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Posisi kursor baru setelah teks diformat ulang: pertahankan jumlah digit di kanan kursor,
 * supaya mengetik/menghapus di tengah angka tidak membuat kursor loncat ke akhir.
 */
export function caretAfterFormat(formatted: string, digitsRightOfCaret: number): number {
  if (digitsRightOfCaret <= 0) return formatted.length;
  let seen = 0;
  for (let i = formatted.length - 1; i >= 0; i--) {
    if (/\d/.test(formatted[i])) {
      seen++;
      if (seen === digitsRightOfCaret) return i;
    }
  }
  return 0;
}
