import { ReceiptLine, toAscii } from './receipt';

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

/**
 * Ubah baris struk menjadi perintah ESC/POS.
 * Diuji untuk printer kelas RPP02N (58mm, tanpa cutter): tidak mengirim perintah potong,
 * hanya feed beberapa baris agar struk bisa disobek.
 */
export function encodeEscPos(lines: ReceiptLine[], feedLines = 3, lineSpacingDots = 26): Uint8Array {
  const bytes: number[] = [];
  const cmd = (...b: number[]) => bytes.push(...b);

  cmd(ESC, 0x40); // ESC @ : reset printer
  cmd(ESC, 0x74, 0x00); // ESC t 0 : code page PC437 (ASCII aman)
  // ESC 3 n : jarak baris n dot. Default printer 30 dot (3,75mm); Font A tingginya 24 dot,
  // jadi 26 dot tetap terbaca tapi menghemat ±13% kertas.
  cmd(ESC, 0x33, lineSpacingDots);

  lines.forEach((line) => {
    cmd(ESC, 0x61, line.align === 'center' ? 1 : line.align === 'right' ? 2 : 0); // ESC a
    cmd(ESC, 0x45, line.bold ? 1 : 0); // ESC E : bold
    cmd(GS, 0x21, line.double ? 0x11 : 0x00); // GS ! : ukuran huruf
    for (const ch of toAscii(line.text)) bytes.push(ch.charCodeAt(0));
    cmd(LF);
  });

  // Kembalikan ke normal lalu feed kertas
  cmd(ESC, 0x61, 0);
  cmd(ESC, 0x45, 0);
  cmd(GS, 0x21, 0);
  cmd(ESC, 0x32); // ESC 2 : kembalikan jarak baris default
  cmd(ESC, 0x64, feedLines); // ESC d n : feed n baris (cukup untuk melewati gerigi sobek)

  return new Uint8Array(bytes);
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}
