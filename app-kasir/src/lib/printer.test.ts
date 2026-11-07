import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BLE_CHUNK_NO_RESPONSE, forgetPrinter, printLines } from './printer';
import { encodeEscPos } from './escpos';
import { StoreSettings } from '../types';
import { ReceiptLine } from './receipt';

const LINES: ReceiptLine[] = Array.from({ length: 40 }, (_, i) => ({ text: `Baris struk nomor ${i + 1}` }));
const settings = (printerMethod: string) => ({ printerMethod, printerFeedLines: 2 }) as unknown as StoreSettings;
const expected = () => encodeEscPos(LINES, 2);

function concat(parts: Uint8Array[]): number[] {
  return parts.flatMap((p) => Array.from(p));
}

/** Port Web Serial tiruan yang meniru perilaku Chrome: writer terkunci & koneksi bisa putus. */
class FakeSerialPort {
  writable: { getWriter: () => any } | null = null;
  written: Uint8Array[] = [];
  opens = 0;
  locked = false;
  /** Jumlah write berikutnya yang dibuat gagal (simulasi koneksi basi). */
  failNextWrites = 0;

  async open() {
    this.opens++;
    this.writable = {
      getWriter: () => {
        if (this.locked) throw new TypeError('WritableStream is locked');
        this.locked = true;
        return {
          write: async (b: Uint8Array) => {
            await new Promise((r) => setTimeout(r, 1));
            if (this.failNextWrites > 0) {
              this.failNextWrites--;
              throw new Error('NetworkError: The device has been lost.');
            }
            this.written.push(b);
          },
          ready: Promise.resolve(),
          releaseLock: () => {
            this.locked = false;
          },
        };
      },
    };
  }
  async close() {
    this.writable = null;
    this.locked = false;
  }
}

describe('printer – Bluetooth klasik / USB (Web Serial)', () => {
  let port: FakeSerialPort;

  beforeEach(() => {
    port = new FakeSerialPort();
    vi.stubGlobal('navigator', {
      userAgent: 'test',
      serial: { getPorts: async () => [port], requestPort: async () => port, addEventListener: () => {} },
    });
    forgetPrinter();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('mengirim seluruh data struk utuh', async () => {
    await printLines(LINES, settings('serial'), false);
    expect(concat(port.written)).toEqual(Array.from(expected()));
  });

  it('dua cetak bersamaan (cetak otomatis + tombol) tidak saling bentrok', async () => {
    await Promise.all([
      printLines(LINES, settings('serial'), false),
      printLines(LINES, settings('serial'), false),
    ]);
    const one = Array.from(expected());
    expect(concat(port.written)).toEqual([...one, ...one]); // berurutan, tidak tercampur
  });

  it('koneksi basi setelah printer tidur: buka ulang dan cetak tetap berhasil', async () => {
    await printLines(LINES, settings('serial'), false);
    port.written = [];
    port.failNextWrites = 1;
    await printLines(LINES, settings('serial'), false);
    expect(port.opens).toBe(2);
    expect(concat(port.written)).toEqual(Array.from(expected()));
  });

  it('jika tetap gagal, error jelas dan cetak berikutnya bisa pulih', async () => {
    port.failNextWrites = 2;
    await expect(printLines(LINES, settings('serial'), false)).rejects.toThrow();
    port.written = [];
    await printLines(LINES, settings('serial'), false);
    expect(concat(port.written)).toEqual(Array.from(expected()));
  });

  it('menolak struk tanpa isi', async () => {
    await expect(printLines([], settings('serial'), false)).rejects.toThrow(/kosong/i);
  });
});

describe('printer – Bluetooth LE', () => {
  let packets: Uint8Array[];
  let connected: boolean;
  let failNext: number;

  beforeEach(() => {
    packets = [];
    connected = false;
    failNext = 0;
    const characteristic = {
      properties: { writeWithoutResponse: true, write: false },
      writeValueWithoutResponse: async (b: Uint8Array) => {
        if (failNext > 0) {
          failNext--;
          connected = false;
          throw new Error('GATT Server is disconnected.');
        }
        packets.push(b);
      },
    };
    const device = {
      name: 'RPP02N',
      addEventListener: () => {},
      gatt: {
        get connected() {
          return connected;
        },
        connect: async () => {
          connected = true;
          return { getPrimaryService: async () => ({ getCharacteristics: async () => [characteristic] }) };
        },
        disconnect: () => {
          connected = false;
        },
      },
    };
    vi.stubGlobal('navigator', { userAgent: 'test', bluetooth: { getDevices: async () => [device] } });
    forgetPrinter();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('paket tidak melebihi 20 byte (batas MTU) dan data utuh', async () => {
    await printLines(LINES, settings('bluetooth'), false);
    expect(Math.max(...packets.map((p) => p.length))).toBeLessThanOrEqual(BLE_CHUNK_NO_RESPONSE);
    expect(concat(packets)).toEqual(Array.from(expected()));
  });

  it('sambung ulang otomatis bila koneksi putus saat mencetak', async () => {
    failNext = 1;
    await printLines(LINES, settings('bluetooth'), false);
    expect(concat(packets)).toEqual(Array.from(expected()));
  });
});
