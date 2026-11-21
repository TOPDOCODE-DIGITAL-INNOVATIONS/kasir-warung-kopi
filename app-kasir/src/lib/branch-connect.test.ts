import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetStorageStateForTests,
  connectDevice,
  connectionNeedsOwnerPin,
  consumeSyncLinkFromUrl,
  disconnectBlocker,
  disconnectDevice,
  generateReceiptId,
  getCashiers,
  getCategories,
  getConnectedBranch,
  getDeviceCode,
  getProducts,
  getStoreSettings,
  getTransactions,
  initLocalStorage,
  isBranchDataReady,
  isDeviceConnected,
  isSetupPending,
  performCloudSync,
  saveStoreSettings,
  saveTransaction,
  startNewShift,
  closeCurrentShift,
  isBranchSetupRequired,
  setupEmptyBranch,
} from './storage';
import { verifyPin } from './security';
import { connectEndpoint, googleConnectUrl, loginOwner, selectBranch, verifyToken } from './branch-api';
import type { Transaction } from '../types';

class MemoryStorage {
  private store = new Map<string, string>();
  getItem(k: string) { return this.store.has(k) ? this.store.get(k)! : null; }
  setItem(k: string, v: string) { this.store.set(k, String(v)); }
  removeItem(k: string) { this.store.delete(k); }
  clear() { this.store.clear(); }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage());
  vi.stubGlobal('window', { dispatchEvent: () => true, location: { protocol: 'https:', origin: 'https://kopi.test' } });
  vi.stubGlobal('CustomEvent', class { constructor(public type: string) {} });
  __resetStorageStateForTests();
});

const BRANCH = { id: 'b-1', name: 'Kopi Senja Denpasar' };
const SERVER_CONFIG = {
  products: [{ id: 'srv-1', name: 'Kopi Cabang', categoryId: 'kopi', price: 15000, stock: -1, isAvailable: true }],
  categories: [{ id: 'all', name: 'Semua', iconName: 'Coffee' }, { id: 'kopi', name: 'Kopi', iconName: 'Coffee' }],
  cashiers: [{ id: 'srv-owner', name: 'Owner Senja', role: 'Owner' }],
  settings: { storeName: 'KOPI SENJA' },
};

/** fetch palsu untuk /api/sync: catat POST, GET mengembalikan `config`. */
function stubSync(config: unknown = null) {
  const posts: any[] = [];
  vi.stubGlobal('fetch', async (_url: string, init: any) => {
    if (init?.method === 'GET') {
      return { ok: true, text: async () => '', json: async () => ({
        configUpdatedAt: config ? '2026-11-21T00:00:00.000Z' : null, config, transactions: [], expenses: [], shifts: [],
        deletedExpenseIds: [], hasMore: false, branch: BRANCH,
      }) };
    }
    posts.push(JSON.parse(init.body));
    return { ok: true, text: async () => '', json: async () => ({ success: true, data: { configAccepted: true, configUpdatedAt: '2026-11-21T00:00:00.000Z' }, branch: BRANCH }) };
  });
  return posts;
}

function tx(): Transaction {
  const product = getProducts()[0];
  return {
    id: generateReceiptId(), timestamp: new Date().toISOString(), cashierId: 'c-1', cashierName: 'Budi', orderType: 'Dine In',
    items: [{ cartItemId: `${product.id}--`, product, quantity: 1, selectedOptions: [], unitPrice: product.price, totalPrice: product.price }],
    subtotal: product.price, discountAmount: 0, taxAmount: 0, grandTotal: product.price, paymentType: 'tunai',
    amountPaid: product.price, changeAmount: 0, status: 'completed',
  };
}

describe('perangkat baru wajib terhubung ke cabang', () => {
  it('perangkat baru belum terhubung sehingga kasir tidak bisa dipakai', () => {
    initLocalStorage();
    expect(isDeviceConnected()).toBe(false);
    expect(isSetupPending()).toBe(false);
  });

  it('cabang baru: wajib nama & PIN Owner, mulai dengan menu kosong tanpa data contoh', async () => {
    initLocalStorage(); // data contoh lama (Ruas Kopi) ada di perangkat
    const connection = { token: 'tok-new', branch: BRANCH, hasConfig: false };
    expect(connectionNeedsOwnerPin(connection)).toBe(true);
    expect(connectDevice(connection).ok).toBe(false);
    expect(connectDevice(connection, { ownerName: 'Ayu', ownerPin: '12' }).ok).toBe(false);
    expect(isDeviceConnected()).toBe(false);

    expect(connectDevice(connection, { ownerName: 'Ayu', ownerPin: '246810' }).ok).toBe(true);
    const [owner] = getCashiers();
    expect(getCashiers()).toHaveLength(1);
    expect(owner).toMatchObject({ name: 'Ayu', role: 'Owner' });
    expect(owner.pin).toBeUndefined();
    expect(verifyPin(owner, '246810')).toBe(true);
    expect(verifyPin(owner, '1234')).toBe(false);
    expect(getProducts()).toEqual([]);
    expect(getCategories().some((c) => c.id === 'all')).toBe(true);
    const settings = getStoreSettings();
    expect(settings.storeName).toBe(BRANCH.name);
    expect(settings.bankAccounts).toEqual([]);
    expect(JSON.stringify(settings)).not.toMatch(/RUAS|MANDIRI/i);
    expect(getConnectedBranch()).toEqual(BRANCH);
    expect(isBranchDataReady()).toBe(true);

    // Profil Owner & menu kosong dikirim sebagai data master pertama cabang.
    const posts = stubSync(null);
    expect((await performCloudSync()).success).toBe(true);
    expect(posts[0].config.cashiers).toHaveLength(1);
    expect(posts[0].config.products).toEqual([]);
  });

  it('cabang yang sudah punya data: data contoh dihapus lalu menu & kasir ditarik dari server', async () => {
    initLocalStorage();
    const connection = { token: 'tok-existing', branch: BRANCH, hasConfig: true };
    expect(connectionNeedsOwnerPin(connection)).toBe(false);
    expect(connectDevice(connection).ok).toBe(true);
    expect(getProducts()).toEqual([]);
    expect(isBranchDataReady()).toBe(false); // menunggu tarikan pertama

    const posts = stubSync(SERVER_CONFIG);
    expect((await performCloudSync()).success).toBe(true);
    expect(posts.filter((p) => p.config)).toHaveLength(0); // tidak menimpa data cabang dengan data contoh
    expect(getProducts().map((p) => p.name)).toEqual(['Kopi Cabang']);
    expect(getCashiers().map((c) => c.name)).toEqual(['Owner Senja']);
    expect(getStoreSettings().storeName).toBe('KOPI SENJA');
    expect(getStoreSettings().syncApiKey).toBe('tok-existing');
    expect(isBranchDataReady()).toBe(true);
  });

  it('BUG CDY: data & transaksi lama di perangkat tidak pernah terkirim ke cabang baru yang kosong', async () => {
    initLocalStorage(); // menu & kasir contoh Ruas Kopi
    startNewShift('c-1', 0);
    saveTransaction(tx());
    saveTransaction(tx());
    closeCurrentShift(0);
    const connection = { token: 'tok-needcoffee', branch: { id: 'nc', name: 'Warung Kopi NeedCoffee' }, hasConfig: false };
    expect(connectionNeedsOwnerPin(connection)).toBe(true);

    // Ditolak dulu sampai pengguna setuju menghapus data lama.
    const blocked = connectDevice(connection, { ownerName: 'Fajar', ownerPin: '246810' });
    expect(blocked.ok).toBe(false);
    expect(blocked.leftover).toMatchObject({ transactions: 2, openShift: false });
    expect(isDeviceConnected()).toBe(false);

    expect(connectDevice(connection, { ownerName: 'Fajar', ownerPin: '246810', discardLocalData: true }).ok).toBe(true);
    expect(getTransactions()).toEqual([]);
    expect(getProducts()).toEqual([]);
    expect(getCashiers().map((c) => c.name)).toEqual(['Fajar']);

    const posts = stubSync(null);
    expect((await performCloudSync()).success).toBe(true);
    const sent = posts.flatMap((p) => p.transactions ?? []);
    expect(sent).toEqual([]);
    const config = posts.find((p) => p.config)?.config;
    expect(config.products).toEqual([]);
    expect(config.cashiers.map((c: any) => c.name)).toEqual(['Fajar']);
    expect(config.settings.storeName).toBe('Warung Kopi NeedCoffee');
    expect(JSON.stringify(config)).not.toMatch(/RUAS|Americano|Wulan/i);
  });

  it('cabang yang sudah punya data juga tidak menerima data lama perangkat', async () => {
    initLocalStorage();
    startNewShift('c-1', 0);
    saveTransaction(tx());
    const connection = { token: 'tok', branch: BRANCH, hasConfig: true };
    expect(connectDevice(connection).leftover).toMatchObject({ transactions: 1, openShift: true });
    expect(connectDevice(connection, { discardLocalData: true }).ok).toBe(true);
    const posts = stubSync(SERVER_CONFIG);
    await performCloudSync();
    expect(posts.flatMap((p) => p.transactions ?? [])).toEqual([]);
    expect(posts.filter((p) => p.config)).toHaveLength(0);
    expect(getProducts().map((p) => p.name)).toEqual(['Kopi Cabang']);
  });

  it('Link Kasir tidak bisa memindahkan perangkat yang sudah terhubung ke cabang lain', () => {
    initLocalStorage();
    saveStoreSettings({ ...getStoreSettings(), syncApiKey: 'tok-cabang-a' });
    const alert = vi.fn();
    vi.stubGlobal('window', {
      dispatchEvent: () => true,
      location: { href: 'https://kopi.test/kasir/#token=tok-cabang-b', protocol: 'https:', origin: 'https://kopi.test' },
      history: { replaceState: () => {} },
      alert,
    });
    expect(consumeSyncLinkFromUrl()).toBe(false);
    expect(getStoreSettings().syncApiKey).toBe('tok-cabang-a');
    expect(isSetupPending()).toBe(false);
    expect(alert).toHaveBeenCalledWith(expect.stringMatching(/Keluar dari Cabang/));
  });

  it('Link Kasir di perangkat baru menandai penyiapan cabang yang belum selesai', () => {
    vi.stubGlobal('window', {
      dispatchEvent: () => true,
      location: { href: 'https://kopi.test/kasir/#token=link-tok', protocol: 'https:', origin: 'https://kopi.test' },
      history: { replaceState: () => {} },
      confirm: () => true,
    });
    expect(consumeSyncLinkFromUrl()).toBe(true);
    expect(isDeviceConnected()).toBe(true);
    expect(isSetupPending()).toBe(true);
    const connection = { token: 'link-tok', branch: BRANCH, hasConfig: true };
    expect(connectionNeedsOwnerPin({ hasConfig: false })).toBe(true);
    expect(connectDevice(connection).ok).toBe(true);
    expect(isSetupPending()).toBe(false);
    expect(getProducts()).toEqual([]);
    expect(getStoreSettings().syncApiKey).toBe('link-tok');
  });

  it('perangkat yang sudah terhubung sebelum fitur ini tetap jalan dan mendapat nama cabang dari sync', async () => {
    initLocalStorage();
    saveStoreSettings({ ...getStoreSettings(), syncApiKey: 'tok-lama' });
    expect(isDeviceConnected()).toBe(true);
    expect(isSetupPending()).toBe(false);
    expect(isBranchDataReady()).toBe(true);
    expect(getConnectedBranch()).toBeNull();
    stubSync(SERVER_CONFIG);
    await performCloudSync();
    expect(getConnectedBranch()).toEqual(BRANCH);
  });
});

describe('keluar dari cabang', () => {
  async function connected() {
    initLocalStorage();
    connectDevice({ token: 'tok', branch: BRANCH, hasConfig: false }, { ownerName: 'Ayu', ownerPin: '246810' });
    stubSync(null);
    await performCloudSync();
    saveStoreSettings({ ...getStoreSettings(), printerMethod: 'rawbt', printerPaperWidth: 80 });
  }

  it('menolak PIN salah dan kasir yang bukan Owner', async () => {
    await connected();
    expect(disconnectDevice('000000')).toMatchObject({ ok: false, message: 'PIN Owner salah.' });
    expect(isDeviceConnected()).toBe(true);
  });

  it('menolak bila shift masih terbuka atau ada data belum terkirim', async () => {
    await connected();
    const owner = getCashiers()[0];
    startNewShift(owner.id, 0);
    expect(disconnectDevice('246810').ok).toBe(false);
    expect(disconnectBlocker()).toMatch(/shift/i);
    closeCurrentShift(0);
    expect(disconnectBlocker()).toMatch(/belum terkirim/i);
    expect(disconnectDevice('246810').ok).toBe(false);
    expect(isDeviceConnected()).toBe(true);
    stubSync(null);
    await performCloudSync();
    expect(disconnectBlocker()).toBeNull();
  });

  it('berhasil: data cabang dihapus, pengaturan printer & nomor perangkat dipertahankan', async () => {
    await connected();
    const deviceCode = getDeviceCode();
    expect(disconnectDevice('246810')).toMatchObject({ ok: true });
    expect(isDeviceConnected()).toBe(false);
    expect(isBranchDataReady()).toBe(false);
    expect(getConnectedBranch()).toBeNull();
    expect(getStoreSettings().syncApiKey).toBeUndefined();
    expect(getStoreSettings().printerMethod).toBe('rawbt');
    expect(getStoreSettings().printerPaperWidth).toBe(80);
    expect(getDeviceCode()).toBe(deviceCode);
    expect(getTransactions()).toEqual([]);
    // Bisa langsung dihubungkan ke cabang lain sebagai perangkat bersih.
    expect(connectionNeedsOwnerPin({ hasConfig: false })).toBe(true);
  });
});

describe('API hubungkan kasir', () => {
  it('menurunkan alamat endpoint dari URL sync atau domain yang sama', () => {
    expect(connectEndpoint()).toBe('https://kopi.test/api/kasir/connect');
    expect(connectEndpoint('http://localhost:3000/api/sync')).toBe('http://localhost:3000/api/kasir/connect');
    expect(connectEndpoint('http://localhost:3000/')).toBe('http://localhost:3000/api/kasir/connect');
    expect(googleConnectUrl()).toBe('https://kopi.test/login?next=/kasir-connect');
  });

  it('login, pilih cabang, dan verifikasi token mengirim kredensial yang benar', async () => {
    const calls: { url: string; init: any }[] = [];
    vi.stubGlobal('fetch', async (url: string, init: any) => {
      calls.push({ url, init });
      const body = JSON.parse(init.body ?? '{}');
      if (body.action === 'login') return { ok: true, status: 200, json: async () => ({ success: true, accessToken: 'jwt', branches: [{ id: 'b-1', name: 'A', address: null }] }) };
      if (body.action === 'select') return { ok: true, status: 200, json: async () => ({ success: true, token: 'sync-tok', branch: BRANCH, hasConfig: true }) };
      return { ok: true, status: 200, json: async () => ({ success: true, branch: BRANCH, hasConfig: false }) };
    });
    expect((await loginOwner(' owner@x.id ', 'rahasia')).branches).toHaveLength(1);
    expect(JSON.parse(calls[0].init.body)).toEqual({ action: 'login', email: 'owner@x.id', password: 'rahasia' });
    expect(await selectBranch('jwt', 'b-1')).toEqual({ token: 'sync-tok', branch: BRANCH, hasConfig: true });
    expect(calls[1].init.headers.Authorization).toBe('Bearer jwt');
    expect(await verifyToken('  sync-tok  ')).toEqual({ token: 'sync-tok', branch: BRANCH, hasConfig: false });
    expect(calls[2].init.method).toBe('GET');
    expect(calls[2].init.headers.Authorization).toBe('Bearer sync-tok');
  });

  it('meneruskan pesan error server dan error jaringan', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: false, status: 401, json: async () => ({ success: false, error: 'Token tidak valid.' }) }));
    await expect(verifyToken('salah')).rejects.toThrow('Token tidak valid.');
    await expect(verifyToken('   ')).rejects.toThrow(/Tempel token/);
    vi.stubGlobal('fetch', async () => { throw new TypeError('offline'); });
    await expect(loginOwner('a@b.id', 'x')).rejects.toThrow(/koneksi internet/);
  });
});

describe('data cabang selalu dari server (perangkat yang sudah terhubung)', () => {
  /** Perangkat seperti CDY: terhubung, menyimpan menu/karyawan Ruas Kopi, server cabangnya dikosongkan. */
  async function staleDevice() {
    initLocalStorage();
    saveStoreSettings({ ...getStoreSettings(), syncApiKey: 'tok-nc' });
    localStorage.setItem('warkop_pos_config_version', '2026-11-21T05:23:46.535Z');
    localStorage.setItem('warkop_pos_config_dirty_at', '2026-11-21T06:00:00.000Z'); // edit menu lokal
    const posts = stubSync(null);
    await performCloudSync();
    return posts;
  }

  it('cabang kosong di server: data perangkat tidak dikirim tanpa persetujuan Owner (tanda configSeed)', async () => {
    const posts = await staleDevice();
    // Perangkat yang dulu memegang versi server masih boleh mengirim edit, tapi tanpa configSeed
    // server menolak mengisi cabang kosong (lihat test dashboard). Tidak ada tanda seed:
    expect(posts.every((p) => !p.configSeed)).toBe(true);
    expect(isBranchSetupRequired()).toBe(true);
  });

  it('Mulai kosong: menu kosong + Owner baru, data lama tidak terkirim', async () => {
    await staleDevice();
    expect(setupEmptyBranch('empty', { ownerName: 'Fajar', ownerPin: '12' }).ok).toBe(false);
    expect(setupEmptyBranch('empty', { ownerName: 'Fajar', ownerPin: '135790' }).ok).toBe(true);
    expect(isBranchSetupRequired()).toBe(false);
    expect(getProducts()).toEqual([]);
    expect(getCashiers().map((c) => c.name)).toEqual(['Fajar']);
    expect(getStoreSettings().syncApiKey).toBe('tok-nc');
    const posts = stubSync(null);
    await performCloudSync();
    const seed = posts.find((p) => p.config);
    expect(seed.configSeed).toBe(true);
    expect(seed.config.products).toEqual([]);
    expect(JSON.stringify(seed.config)).not.toMatch(/RUAS|Americano/i);
  });

  it('Mulai kosong ditolak dulu bila ada transaksi yang belum terkirim', async () => {
    await staleDevice();
    startNewShift('c-1', 0);
    saveTransaction(tx());
    const res = setupEmptyBranch('empty', { ownerName: 'Fajar', ownerPin: '135790' });
    expect(res.ok).toBe(false);
    expect(res.leftover).toMatchObject({ transactions: 1, openShift: true });
    expect(setupEmptyBranch('empty', { ownerName: 'Fajar', ownerPin: '135790', discardLocalData: true }).ok).toBe(true);
    expect(getTransactions()).toEqual([]);
  });

  it('Kirim data perangkat: wajib PIN Owner perangkat, lalu dikirim dengan tanda configSeed', async () => {
    await staleDevice();
    const owner = getCashiers().find((c) => c.role === 'Owner')!;
    expect(setupEmptyBranch('device', { ownerPin: '000000' }).ok).toBe(false);
    // PIN Owner data contoh bawaan adalah 1234 (sudah di-hash saat migrasi).
    expect(verifyPin(owner, '1234')).toBe(true);
    expect(setupEmptyBranch('device', { ownerPin: '1234' }).ok).toBe(true);
    const posts = stubSync(null);
    await performCloudSync();
    const seed = posts.find((p) => p.config);
    expect(seed.configSeed).toBe(true);
    expect(seed.config.products.length).toBeGreaterThan(0);
  });

  it('cabang disiapkan dari dashboard: perangkat langsung memakai data server', async () => {
    await staleDevice();
    expect(isBranchSetupRequired()).toBe(true);
    stubSync(SERVER_CONFIG);
    await performCloudSync();
    expect(isBranchSetupRequired()).toBe(false);
    expect(getCashiers().map((c) => c.name)).toEqual(['Owner Senja']);
    expect(getProducts().map((p) => p.name)).toEqual(['Kopi Cabang']);
  });

  it('perangkat tanpa versi server: edit menu lokal tidak pernah menang atas data server', async () => {
    initLocalStorage();
    saveStoreSettings({ ...getStoreSettings(), syncApiKey: 'tok' });
    localStorage.setItem('warkop_pos_config_dirty_at', '2026-11-21T06:00:00.000Z');
    const posts = stubSync(SERVER_CONFIG);
    await performCloudSync();
    expect(posts.filter((p) => p.config)).toHaveLength(0);
    expect(getProducts().map((p) => p.name)).toEqual(['Kopi Cabang']);
    expect(getCashiers().map((c) => c.name)).toEqual(['Owner Senja']);
  });
});
