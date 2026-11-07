import { StoreSettings, Transaction } from '../types';

/**
 * Format struk teks untuk printer thermal.
 * 58mm (mis. VSC/Rongta RPP02N): 384 dot, Font A 12x24 → 32 karakter per baris.
 * 80mm: 48 karakter per baris.
 */
export type PaperWidth = 58 | 80;

export function charsPerLine(paper: PaperWidth = 58): number {
  return paper === 80 ? 48 : 32;
}

export interface ReceiptLine {
  text: string;
  align?: 'left' | 'center' | 'right';
  bold?: boolean;
  /** Huruf ukuran 2x (lebar & tinggi). Lebar baris jadi setengah. */
  double?: boolean;
}

/** Printer thermal hanya aman untuk ASCII; ganti karakter lain. */
export function toAscii(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // aksen
    .replace(/[   ]/g, ' ') // spasi non-breaking
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/•/g, '*')
    .replace(/[^\x20-\x7e]/g, '');
}

/** Rupiah tanpa simbol ganda/NBSP, mis. "Rp12.500" atau "-Rp2.000". */
export function rp(amount: number): string {
  const n = Math.round(amount);
  const s = Math.abs(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${n < 0 ? '-' : ''}Rp${s}`;
}

/** Pecah teks menjadi beberapa baris maksimal `width` karakter, memotong di spasi bila bisa. */
export function wrap(text: string, width: number): string[] {
  const clean = toAscii(text).trim();
  if (!clean) return [];
  const words = clean.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (let w of words) {
    while (w.length > width) {
      if (cur) {
        lines.push(cur);
        cur = '';
      }
      lines.push(w.slice(0, width));
      w = w.slice(width);
    }
    if (!w) continue;
    if (!cur) cur = w;
    else if (cur.length + 1 + w.length <= width) cur += ' ' + w;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

/** Baris kiri-kanan, mis. "Subtotal          Rp25.000". Label dipotong jika tidak muat. */
export function leftRight(left: string, right: string, width: number): string {
  const r = toAscii(right);
  let l = toAscii(left);
  const maxLeft = Math.max(0, width - r.length - 1);
  if (l.length > maxLeft) l = l.slice(0, maxLeft);
  return l + ' '.repeat(Math.max(1, width - l.length - r.length)) + r;
}

const PAYMENT_LABEL: Record<string, string> = {
  tunai: 'TUNAI',
  qris: 'QRIS',
  transfer: 'TRANSFER',
  ewallet: 'E-WALLET',
  hutang: 'BON/HUTANG',
  debit: 'DEBIT/KREDIT',
};

/** Angka ribuan tanpa "Rp", untuk kolom harga item agar lebih ringkas. */
export function num(amount: number): string {
  return rp(amount).replace('Rp', '');
}

function formatDateShort(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function buildReceiptLines(
  tx: Transaction,
  settings: StoreSettings,
  paper: PaperWidth = 58
): ReceiptLine[] {
  if (settings.receiptCompact !== false) return buildCompactReceiptLines(tx, settings, paper);
  return buildFullReceiptLines(tx, settings, paper);
}

/**
 * Struk ringkas (default): hemat kertas ±40%.
 * Nama toko 1 baris, alamat+telp digabung, tanggal+kasir dan order+pelanggan satu baris,
 * item qty 1 cukup satu baris, subtotal hanya muncul bila ada diskon/pajak.
 */
export function buildCompactReceiptLines(
  tx: Transaction,
  settings: StoreSettings,
  paper: PaperWidth = 58
): ReceiptLine[] {
  const W = charsPerLine(paper);
  const sep: ReceiptLine = { text: '-'.repeat(W) };
  const out: ReceiptLine[] = [];
  const push = (text: string, opts: Omit<ReceiptLine, 'text'> = {}) => out.push({ text, ...opts });
  const pushWrapped = (text: string | undefined, opts: Omit<ReceiptLine, 'text'> = {}, width = W) =>
    wrap(text || '', width).forEach((t) => push(t, opts));

  // Header: huruf besar hanya jika nama toko muat 1 baris
  const name = toAscii(settings.storeName || '').trim();
  if (name.length <= Math.floor(W / 2)) push(name, { align: 'center', bold: true, double: true });
  else pushWrapped(name, { align: 'center', bold: true });
  const contact = [settings.address, settings.phone ? `Telp ${settings.phone}` : '']
    .filter((x) => x && x.trim())
    .join(' - ');
  pushWrapped(contact, { align: 'center' });
  out.push(sep);

  if (tx.status === 'cancelled') push('*** TRANSAKSI DIBATALKAN ***', { align: 'center', bold: true });

  push(toAscii(tx.id));
  push(leftRight(formatDateShort(tx.timestamp), tx.cashierName, W));
  push(leftRight(tx.orderType, tx.customerName || '', W));
  out.push(sep);

  tx.items.forEach((item) => {
    const opts = item.selectedOptions?.length
      ? ` (${item.selectedOptions.map((o) => o.choiceLabel).join(', ')})`
      : '';
    const label = `${item.product.name}${opts}`;
    if (item.quantity === 1) {
      // Satu baris: nama ... harga. Jika nama panjang, harga di baris terakhir nama.
      const price = num(item.totalPrice);
      const nameLines = wrap(label, W);
      const last = nameLines.pop() || '';
      nameLines.forEach((t) => push(t));
      if (last.length + 1 + price.length <= W) push(leftRight(last, price, W));
      else {
        push(last);
        push(leftRight('', price, W));
      }
    } else {
      pushWrapped(label);
      push(leftRight(` ${item.quantity} x ${num(item.unitPrice)}`, num(item.totalPrice), W));
    }
    if (item.notes) wrap(`*${item.notes}`, W - 1).forEach((t) => push(` ${t}`));
  });
  out.push(sep);

  if (tx.discountAmount > 0 || tx.taxAmount > 0) {
    push(leftRight('Subtotal', rp(tx.subtotal), W));
    if (tx.discountAmount > 0) push(leftRight('Diskon', rp(-tx.discountAmount), W));
    if (tx.taxAmount > 0) push(leftRight(`Pajak ${settings.taxRatePercent}%`, rp(tx.taxAmount), W));
  }
  push(leftRight('TOTAL', rp(tx.grandTotal), W), { bold: true });

  if (tx.paymentType === 'tunai') {
    push(leftRight('Tunai', rp(tx.amountPaid), W));
    push(leftRight('Kembali', rp(tx.changeAmount), W));
  } else if (tx.paymentType === 'hutang') {
    push(tx.debtStatus === 'paid' ? '** BON - SUDAH LUNAS **' : '** BON - BELUM LUNAS **', {
      align: 'center',
      bold: true,
    });
  } else {
    push(leftRight('Bayar', PAYMENT_LABEL[tx.paymentType] || tx.paymentType.toUpperCase(), W));
  }

  pushWrapped(settings.receiptFooterMsg || 'Terima kasih!', { align: 'center' });
  return out;
}

/** Struk lengkap (format lama), untuk yang menonaktifkan mode ringkas. */
export function buildFullReceiptLines(
  tx: Transaction,
  settings: StoreSettings,
  paper: PaperWidth = 58
): ReceiptLine[] {
  const W = charsPerLine(paper);
  const sep: ReceiptLine = { text: '-'.repeat(W) };
  const out: ReceiptLine[] = [];
  const push = (text: string, opts: Omit<ReceiptLine, 'text'> = {}) => out.push({ text, ...opts });
  const pushWrapped = (text: string | undefined, opts: Omit<ReceiptLine, 'text'> = {}, width = W) =>
    wrap(text || '', width).forEach((t) => push(t, opts));

  // Header toko
  pushWrapped(settings.storeName, { align: 'center', bold: true, double: true }, Math.floor(W / 2));
  pushWrapped(settings.storeTagline, { align: 'center' });
  pushWrapped(settings.address, { align: 'center' });
  if (settings.phone) pushWrapped(`Telp: ${settings.phone}`, { align: 'center' });
  if (settings.receiptHeaderMsg) pushWrapped(settings.receiptHeaderMsg, { align: 'center' });
  out.push(sep);

  if (tx.status === 'cancelled') {
    push('*** TRANSAKSI DIBATALKAN ***', { align: 'center', bold: true });
    out.push(sep);
  }

  // Info transaksi
  push(toAscii(tx.id), { bold: true });
  push(leftRight('Tanggal', formatDate(tx.timestamp), W));
  push(leftRight('Kasir', tx.cashierName, W));
  push(leftRight('Order', tx.orderType, W));
  if (tx.customerName) push(leftRight('Pelanggan', tx.customerName, W));
  out.push(sep);

  // Item
  tx.items.forEach((item) => {
    pushWrapped(item.product.name, { bold: true });
    const indented = (text: string) => wrap(text, W - 2).forEach((t) => push(`  ${t}`));
    if (item.selectedOptions?.length) indented(item.selectedOptions.map((o) => o.choiceLabel).join(', '));
    if (item.notes) indented(`Note: ${item.notes}`);
    push(leftRight(`  ${item.quantity} x ${rp(item.unitPrice)}`, rp(item.totalPrice), W));
  });
  out.push(sep);

  // Total
  push(leftRight('Subtotal', rp(tx.subtotal), W));
  if (tx.discountAmount > 0) push(leftRight('Diskon', rp(-tx.discountAmount), W));
  if (tx.taxAmount > 0) push(leftRight(`Pajak ${settings.taxRatePercent}%`, rp(tx.taxAmount), W));
  push(leftRight('TOTAL', rp(tx.grandTotal), W), { bold: true });
  out.push(sep);

  push(leftRight('Bayar', PAYMENT_LABEL[tx.paymentType] || tx.paymentType.toUpperCase(), W));
  if (tx.paymentDetail && tx.paymentType !== 'hutang') pushWrapped(tx.paymentDetail, { align: 'right' });
  if (tx.paymentType === 'tunai') {
    push(leftRight('Tunai', rp(tx.amountPaid), W));
    push(leftRight('Kembali', rp(tx.changeAmount), W), { bold: true });
  }
  if (tx.paymentType === 'hutang') {
    push(tx.debtStatus === 'paid' ? '** BON - SUDAH LUNAS **' : '** BON - BELUM LUNAS **', {
      align: 'center',
      bold: true,
    });
  }
  out.push(sep);

  pushWrapped(settings.receiptFooterMsg || 'Terima kasih!', { align: 'center' });

  return out;
}

/** Render teks polos (untuk pratinjau / cetak via browser) dengan rata tengah/kanan diterapkan. */
export function renderLineText(line: ReceiptLine, paper: PaperWidth = 58): string {
  const W = line.double ? Math.floor(charsPerLine(paper) / 2) : charsPerLine(paper);
  const t = line.text.slice(0, W);
  if (line.align === 'center') {
    const pad = Math.floor((W - t.length) / 2);
    return ' '.repeat(pad) + t;
  }
  if (line.align === 'right') return ' '.repeat(W - t.length) + t;
  return t;
}
