import { StoreSettings, Transaction } from '../types';
import { buildReceiptLines, charsPerLine, PaperWidth, ReceiptLine } from './receipt';
import { bytesToBase64, encodeEscPos } from './escpos';

export type PrinterMethod = 'serial' | 'bluetooth' | 'rawbt' | 'browser';

export const PRINTER_METHOD_LABELS: Record<PrinterMethod, string> = {
  serial: 'Langsung – Bluetooth klasik / USB (disarankan RPP02N)',
  bluetooth: 'Langsung – Bluetooth LE',
  rawbt: 'Lewat aplikasi RawBT (Android) – versi gratis ada iklan',
  browser: 'Dialog print browser',
};

/** Metode yang mencetak langsung tanpa membuka dialog/aplikasi lain. */
export function isDirectMethod(m: PrinterMethod): boolean {
  return m === 'serial' || m === 'bluetooth';
}

export function getPrinterMethod(settings: StoreSettings): PrinterMethod {
  return (settings.printerMethod as PrinterMethod) || 'browser';
}

/** Default: cetak otomatis aktif untuk metode langsung (tanpa dialog). */
export function shouldAutoPrint(settings: StoreSettings): boolean {
  return settings.autoPrintAfterPayment ?? isDirectMethod(getPrinterMethod(settings));
}

/**
 * Baris kosong setelah struk. RawBT sudah menambahkan feed sendiri, jadi default 0
 * agar jarak bawah (dan jarak atas struk berikutnya) tidak terlalu jauh.
 */
export function getFeedLines(settings: StoreSettings): number {
  const v = settings.printerFeedLines;
  if (typeof v === 'number' && v >= 0) return Math.min(Math.round(v), 10);
  return getPrinterMethod(settings) === 'rawbt' ? 0 : 2;
}

export function getPaperWidth(settings: StoreSettings): PaperWidth {
  return settings.printerPaperWidth === 80 ? 80 : 58;
}

/** Alasan metode tidak tersedia (null = didukung). */
export function printerUnsupportedReason(m: PrinterMethod): string | null {
  if (isPrinterMethodSupported(m)) return null;
  if (m === 'rawbt') return 'RawBT hanya tersedia di Android.';
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    return `Halaman dibuka lewat ${location.protocol}//${location.host} (bukan HTTPS). Chrome hanya mengizinkan Bluetooth/USB di alamat HTTPS atau localhost.`;
  }
  const chrome = navigator.userAgent.match(/Chrome\/(\d+)/);
  const ver = chrome ? ` (Chrome Anda versi ${chrome[1]})` : ' (browser ini bukan Chrome)';
  if (m === 'serial') return `Butuh Chrome Android 138+ atau Chrome desktop 117+${ver}.`;
  return `Browser ini tidak mendukung Web Bluetooth${ver}.`;
}

export function isPrinterMethodSupported(m: PrinterMethod): boolean {
  if (typeof navigator === 'undefined') return false;
  if (m === 'serial') return Boolean((navigator as any).serial);
  if (m === 'bluetooth') return Boolean((navigator as any).bluetooth);
  if (m === 'rawbt') return /android/i.test(navigator.userAgent);
  return true;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// -------------------------------------------------------------
// Web Serial: Bluetooth klasik (SPP/RFCOMM) atau USB.
// RPP02N adalah printer Bluetooth klasik, jadi ini cara langsung yang paling cocok.
// Didukung Chrome desktop (117+) dan Chrome Android (138+).
// Izin port diingat browser → cetak berikutnya tanpa dialog apa pun.
// -------------------------------------------------------------
const SPP_UUID = '00001101-0000-1000-8000-00805f9b34fb';
let serialPort: any = null;

async function getSerialPort(interactive: boolean): Promise<any> {
  const serial = (navigator as any).serial;
  if (!serial) {
    throw new Error('Browser ini belum mendukung Web Serial. Perbarui Chrome (Android 138+) atau pilih metode lain.');
  }
  if (serialPort) return serialPort;

  const granted: any[] = await serial.getPorts();
  if (granted.length > 0) {
    serialPort = granted[0];
    return serialPort;
  }
  if (!interactive) {
    throw new Error('Printer belum dihubungkan. Buka Pengaturan → Printer Struk → Hubungkan Printer.');
  }
  serialPort = await serial.requestPort({ allowedBluetoothServiceClassIds: [SPP_UUID] });
  return serialPort;
}

async function writeSerial(bytes: Uint8Array, interactive: boolean): Promise<void> {
  const port = await getSerialPort(interactive);
  if (!port.writable) {
    try {
      await port.open({ baudRate: 9600 }); // baud diabaikan untuk Bluetooth, dipakai untuk USB
    } catch (err: any) {
      if (err?.name !== 'InvalidStateError') {
        serialPort = null;
        throw new Error(
          `Tidak bisa terhubung ke printer (${err?.message || err}). Pastikan printer menyala dan sudah di-pair.`
        );
      }
    }
  }
  const writer = port.writable.getWriter();
  try {
    const CHUNK = 512;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      await writer.write(bytes.slice(i, i + CHUNK));
    }
  } finally {
    writer.releaseLock();
  }
}

// -------------------------------------------------------------
// Web Bluetooth (BLE). Perangkat yang pernah dipilih dipakai lagi lewat getDevices().
// -------------------------------------------------------------
const BLE_PRINTER_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
  '0000ff00-0000-1000-8000-00805f9b34fb',
];

let bleCharacteristic: any = null;
let bleDevice: any = null;

async function getBleCharacteristic(interactive: boolean): Promise<any> {
  if (bleCharacteristic && bleDevice?.gatt?.connected) return bleCharacteristic;

  const bluetooth = (navigator as any).bluetooth;
  if (!bluetooth) throw new Error('Browser ini tidak mendukung Web Bluetooth.');

  if (!bleDevice && bluetooth.getDevices) {
    const known: any[] = await bluetooth.getDevices();
    if (known.length > 0) bleDevice = known[0];
  }
  if (!bleDevice) {
    if (!interactive) {
      throw new Error('Printer belum dihubungkan. Buka Pengaturan → Printer Struk → Hubungkan Printer.');
    }
    bleDevice = await bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: BLE_PRINTER_SERVICES,
    });
  }
  bleDevice.addEventListener?.('gattserverdisconnected', () => {
    bleCharacteristic = null;
  });

  const server = await bleDevice.gatt.connect();
  for (const uuid of BLE_PRINTER_SERVICES) {
    try {
      const service = await server.getPrimaryService(uuid);
      const chars = await service.getCharacteristics();
      const writable = chars.find((c: any) => c.properties.writeWithoutResponse || c.properties.write);
      if (writable) {
        bleCharacteristic = writable;
        return writable;
      }
    } catch {
      /* layanan tidak ada, coba berikutnya */
    }
  }

  bleDevice = null;
  throw new Error(
    'Printer tidak menyediakan layanan Bluetooth LE. Untuk RPP02N gunakan metode "Bluetooth klasik / USB".'
  );
}

async function writeBle(bytes: Uint8Array, interactive: boolean): Promise<void> {
  const ch = await getBleCharacteristic(interactive);
  const CHUNK = 100;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const part = bytes.slice(i, i + CHUNK);
    if (ch.properties.writeWithoutResponse && ch.writeValueWithoutResponse) {
      await ch.writeValueWithoutResponse(part);
    } else {
      await ch.writeValue(part);
    }
    await sleep(20);
  }
}

// -------------------------------------------------------------
// RawBT (Android)
// -------------------------------------------------------------
function printViaRawBT(bytes: Uint8Array): void {
  if (!/android/i.test(navigator.userAgent)) {
    // Di luar Android skema rawbt: tidak dikenal dan membuat halaman kosong.
    throw new Error('RawBT hanya tersedia di Android. Pilih metode cetak lain di Pengaturan.');
  }
  const b64 = bytesToBase64(bytes);
  window.location.href = `intent:base64,${b64}#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;`;
}

// -------------------------------------------------------------
// API publik
// -------------------------------------------------------------

/** Pilih & simpan printer (harus dipanggil dari klik pengguna). */
export async function connectPrinter(settings: StoreSettings): Promise<string> {
  const method = getPrinterMethod(settings);
  if (method === 'serial') {
    forgetPrinter();
    const port = await (navigator as any).serial.requestPort({ allowedBluetoothServiceClassIds: [SPP_UUID] });
    serialPort = port;
    await writeSerial(encodeEscPos([], 1), false); // buka koneksi & uji
    return 'Printer terhubung. Struk berikutnya akan langsung dicetak.';
  }
  if (method === 'bluetooth') {
    forgetPrinter();
    bleDevice = await (navigator as any).bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: BLE_PRINTER_SERVICES,
    });
    await getBleCharacteristic(false);
    return `Printer ${bleDevice?.name || ''} terhubung. Struk berikutnya akan langsung dicetak.`;
  }
  return 'Metode ini tidak perlu dihubungkan.';
}

export function forgetPrinter(): void {
  try {
    bleDevice?.gatt?.disconnect();
  } catch {
    /* abaikan */
  }
  bleDevice = null;
  bleCharacteristic = null;
  if (serialPort?.writable) {
    serialPort.close?.().catch(() => {});
  }
  serialPort = null;
}

/** @deprecated nama lama */
export const forgetBluetoothPrinter = forgetPrinter;

/**
 * Cetak struk sesuai metode di pengaturan.
 * @param interactive true jika dipanggil dari klik (boleh memunculkan pemilih perangkat)
 * Untuk metode 'browser', <ThermalReceiptPrintPortal> harus sudah ter-render.
 */
export async function printLines(
  lines: ReceiptLine[],
  settings: StoreSettings,
  interactive = true
): Promise<void> {
  const method = getPrinterMethod(settings);
  if (method === 'browser') {
    window.print();
    return;
  }
  const bytes = encodeEscPos(lines, getFeedLines(settings));
  if (method === 'rawbt') return printViaRawBT(bytes);
  if (method === 'serial') return writeSerial(bytes, interactive);
  return writeBle(bytes, interactive);
}

export function buildLinesFor(tx: Transaction, settings: StoreSettings): ReceiptLine[] {
  return buildReceiptLines(tx, settings, getPaperWidth(settings));
}

/** Struk uji untuk tombol "Tes Printer". */
export function buildTestLines(settings: StoreSettings): ReceiptLine[] {
  const W = charsPerLine(getPaperWidth(settings));
  return [
    { text: 'TES PRINTER', align: 'center', bold: true, double: true },
    { text: settings.storeName.slice(0, W), align: 'center' },
    { text: 'Baris di bawah tidak boleh', align: 'center' },
    { text: 'diikuti baris kosong', align: 'center' },
    { text: '-'.repeat(W) },
    { text: '1234567890'.repeat(5).slice(0, W) },
    { text: 'Rata kanan', align: 'right' },
    { text: 'Tebal', bold: true },
    { text: '-'.repeat(W) },
    { text: new Date().toLocaleString('id-ID').replace(/[^\x20-\x7e]/g, ' '), align: 'center' },
  ];
}
