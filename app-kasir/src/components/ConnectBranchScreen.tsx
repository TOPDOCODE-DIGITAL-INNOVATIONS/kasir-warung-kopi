import React, { useEffect, useRef, useState } from 'react';
import { Coffee, KeyRound, Loader2, LogIn, Store, ChevronLeft } from 'lucide-react';
import {
  connectDevice,
  connectionNeedsOwnerPin,
  exportDataAsJSON,
  getConnectedBranch,
  getStoreSettings,
  hasLocalOwnerProfile,
  isBranchSetupRequired,
  setupEmptyBranch,
  type LocalLeftoverData,
  isBranchDataReady,
  isDeviceConnected,
  isSetupPending,
  performCloudSync,
  type BranchConnection,
} from '../lib/storage';
import { googleConnectUrl, loginOwner, selectBranch, verifyToken, type OwnerBranch } from '../lib/branch-api';

type Step =
  | { kind: 'choose' }
  | { kind: 'branches'; accessToken: string; branches: OwnerBranch[] }
  | { kind: 'owner'; connection: BranchConnection }
  | { kind: 'discard'; branchName: string | null; leftover: LocalLeftoverData; confirm: () => Promise<void> }
  | { kind: 'setup' }
  | { kind: 'loading'; message: string }
  | { kind: 'retry'; message: string };

const input = 'w-full rounded-xl border border-[#D7CCC8] bg-white px-4 py-3 text-sm focus:border-[#3E2723] focus:outline-none focus:ring-2 focus:ring-[#3E2723]/20';
const primary = 'w-full rounded-xl bg-[#3E2723] px-4 py-3 font-semibold text-white hover:bg-[#2C1B18] disabled:opacity-50 flex items-center justify-center gap-2';

/**
 * Layar wajib saat perangkat belum terhubung ke cabang: masuk dengan akun Owner (email/password
 * atau Google) lalu pilih cabang, atau tempel token cabang dari dashboard.
 */
export function ConnectBranchScreen() {
  const [step, setStep] = useState<Step>({ kind: 'choose' });
  const [mode, setMode] = useState<'account' | 'token'>('account');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [serverUrl, setServerUrl] = useState(() => getStoreSettings().syncApiUrl ?? '');
  const [ownerName, setOwnerName] = useState('');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [devicePin, setDevicePin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  /** Simpan koneksi lalu tarik/kirim data cabang. */
  const finish = async (connection: BranchConnection, owner?: { name: string; pin: string }, discardLocalData = false) => {
    setError('');
    const res = connectDevice(connection, { ownerName: owner?.name, ownerPin: owner?.pin, syncApiUrl: serverUrl, discardLocalData });
    if (res.leftover) {
      return setStep({ kind: 'discard', branchName: connection.branch.name, leftover: res.leftover, confirm: () => finish(connection, owner, true) });
    }
    if (!res.ok) return setError(res.message);
    await loadBranchData(connection.branch.name);
  };

  const loadBranchData = async (name?: string | null) => {
    setStep({ kind: 'loading', message: `Memuat data ${name ?? 'cabang'}...` });
    const result = await performCloudSync();
    if (result.success && isBranchSetupRequired()) return setStep({ kind: 'setup' });
    if (result.success && isBranchDataReady()) return; // App beralih ke kasir lewat event pembaruan
    setStep({ kind: 'retry', message: result.success ? 'Data cabang belum tersedia. Coba lagi.' : result.message });
  };

  const proceed = (connection: BranchConnection) => {
    if (connectionNeedsOwnerPin(connection)) {
      setOwnerName('');
      setStep({ kind: 'owner', connection });
    } else {
      void finish(connection);
    }
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan. Coba lagi.');
    } finally {
      setBusy(false);
    }
  };

  // Link Kasir / login Google: token sudah ada di perangkat, tinggal diperiksa & disiapkan.
  // Perangkat yang sudah terhubung tetapi datanya belum lengkap: langsung muat ulang.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (isBranchSetupRequired()) {
      setStep({ kind: 'setup' });
    } else if (isSetupPending()) {
      void run(async () => proceed(await verifyToken(getStoreSettings().syncApiKey ?? '', serverUrl)));
    } else if (isDeviceConnected() && !isBranchDataReady()) {
      void loadBranchData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const body = (() => {
    switch (step.kind) {
      case 'loading':
        return (
          <div className="flex flex-col items-center gap-3 py-8 text-sm text-[#5D4037]" role="status">
            <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
            {step.message}
          </div>
        );
      case 'retry':
        return (
          <div className="space-y-4">
            <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{step.message}</p>
            <button type="button" className={primary} onClick={() => void loadBranchData()}>Coba Lagi</button>
          </div>
        );
      case 'branches':
        return (
          <div className="space-y-3">
            <button type="button" onClick={() => setStep({ kind: 'choose' })} className="flex items-center gap-1 text-sm text-[#5D4037] hover:underline">
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />Kembali
            </button>
            {step.branches.length === 0 ? (
              <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
                Akun ini belum punya cabang. Buat cabang di Dashboard Owner → Cabang &amp; Token, lalu masuk lagi.
              </p>
            ) : (
              <ul className="space-y-2" aria-label="Pilih cabang">
                {step.branches.map((b) => (
                  <li key={b.id}>
                    <button type="button" disabled={busy}
                      onClick={() => run(async () => proceed(await selectBranch(step.accessToken, b.id, serverUrl)))}
                      className="flex w-full items-center gap-3 rounded-xl border border-[#D7CCC8] bg-white px-4 py-3 text-left hover:border-[#3E2723] disabled:opacity-50">
                      <Store className="h-5 w-5 shrink-0 text-[#3E2723]" aria-hidden="true" />
                      <span className="min-w-0">
                        <span className="block font-semibold text-[#2C2420]">{b.name}</span>
                        {b.address && <span className="block truncate text-xs text-[#8D6E63]">{b.address}</span>}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      case 'discard': {
        const { leftover } = step;
        const items = [
          leftover.transactions && `${leftover.transactions} transaksi`,
          leftover.expenses && `${leftover.expenses} pengeluaran`,
          leftover.drafts && `${leftover.drafts} draf pesanan`,
          leftover.openShift && 'shift yang masih terbuka',
        ].filter(Boolean).join(', ');
        const download = () => {
          const blob = new Blob([exportDataAsJSON()], { type: 'application/json' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `backup-kasir-lama-${new Date().toISOString().slice(0, 10)}.json`;
          a.click();
          URL.revokeObjectURL(a.href);
        };
        return (
          <div className="space-y-4">
            <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-semibold">Perangkat ini masih menyimpan data lama: {items}.</p>
              <p className="mt-1">Data itu tidak akan dikirim ke cabang <strong>{step.branchName ?? 'ini'}</strong>. Unduh backup bila masih diperlukan, lalu hapus untuk melanjutkan.</p>
            </div>
            <button type="button" onClick={download} className="w-full rounded-xl border border-[#D7CCC8] bg-white px-4 py-3 text-sm font-semibold text-[#2C2420] hover:bg-[#FAF7F5]">
              Unduh Backup Data Lama
            </button>
            <button type="button" className={primary} disabled={busy}
              onClick={() => void run(step.confirm)}>
              Hapus Data Lama &amp; Lanjutkan
            </button>
            <button type="button" onClick={() => setStep({ kind: 'choose' })} className="w-full text-sm text-[#5D4037] hover:underline">Batal</button>
          </div>
        );
      }
      case 'setup': {
        const branchName = getConnectedBranch()?.name ?? 'ini';
        const setupEmpty = async (discardLocalData = false) => {
          if (pin !== pin2) return setError('Konfirmasi PIN tidak sama.');
          const res = setupEmptyBranch('empty', { ownerName, ownerPin: pin, discardLocalData });
          if (res.leftover) {
            return setStep({ kind: 'discard', branchName, leftover: res.leftover, confirm: () => setupEmpty(true) });
          }
          if (!res.ok) return setError(res.message);
          await loadBranchData(branchName);
        };
        return (
          <div className="space-y-5">
            <p className="rounded-xl bg-[#EFEBE9] p-3 text-sm text-[#4E342E]">
              Cabang <strong>{branchName}</strong> belum punya menu &amp; karyawan di server. Data di perangkat ini tidak dipakai
              otomatis. Siapkan cabang dengan salah satu cara berikut, atau tambahkan karyawan dari Dashboard → Kelola User lalu tekan <em>Muat Ulang</em>.
            </p>
            <form className="space-y-3 rounded-xl border border-[#D7CCC8] p-4" onSubmit={(e) => { e.preventDefault(); void run(() => setupEmpty()); }}>
              <p className="font-semibold text-[#2C2420]">Mulai kosong (disarankan)</p>
              <label className="block text-sm font-medium text-[#4E342E]">Nama Owner
                <input className={`${input} mt-1`} value={ownerName} onChange={(e) => setOwnerName(e.target.value)} maxLength={100} required />
              </label>
              <label className="block text-sm font-medium text-[#4E342E]">PIN Owner baru (4–6 angka)
                <input className={`${input} mt-1`} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} inputMode="numeric" type="password" maxLength={6} required />
              </label>
              <label className="block text-sm font-medium text-[#4E342E]">Ulangi PIN
                <input className={`${input} mt-1`} value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, ''))} inputMode="numeric" type="password" maxLength={6} required />
              </label>
              <button type="submit" className={primary} disabled={busy}>Mulai Kosong</button>
            </form>
            {hasLocalOwnerProfile() && (
              <form className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4" onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  const res = setupEmptyBranch('device', { ownerPin: devicePin });
                  if (!res.ok) return setError(res.message);
                  await loadBranchData(branchName);
                });
              }}>
                <p className="font-semibold text-amber-900">Kirim data perangkat ini sebagai data cabang</p>
                <p className="text-xs text-amber-900">Hanya jika menu &amp; karyawan di perangkat ini memang milik cabang {branchName}. Data akan dikirim ke server dan dipakai semua perangkat cabang.</p>
                <input className={input} value={devicePin} onChange={(e) => setDevicePin(e.target.value.replace(/\D/g, ''))} inputMode="numeric" type="password" maxLength={6} placeholder="PIN Owner perangkat ini" aria-label="PIN Owner perangkat ini" required />
                <button type="submit" disabled={busy} className="w-full rounded-xl border border-amber-400 bg-white px-4 py-2.5 text-sm font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50">Kirim Data Perangkat</button>
              </form>
            )}
            <button type="button" onClick={() => void loadBranchData(branchName)} className="w-full text-sm text-[#5D4037] hover:underline">Muat Ulang dari Server</button>
          </div>
        );
      }
      case 'owner':
        return (
          <form className="space-y-4" onSubmit={(e) => {
            e.preventDefault();
            if (pin !== pin2) return setError('Konfirmasi PIN tidak sama.');
            void run(() => finish(step.connection, { name: ownerName, pin }));
          }}>
            <p className="rounded-xl bg-[#EFEBE9] p-3 text-sm text-[#4E342E]">
              Cabang <strong>{step.connection.branch.name}</strong> masih baru. Buat profil Owner untuk kasir ini. Menu bisa ditambahkan setelahnya.
            </p>
            <label className="block text-sm font-medium text-[#4E342E]">Nama Owner
              <input className={`${input} mt-1`} value={ownerName} onChange={(e) => setOwnerName(e.target.value)} maxLength={100} required autoComplete="name" />
            </label>
            <label className="block text-sm font-medium text-[#4E342E]">PIN Owner (4–6 angka)
              <input className={`${input} mt-1`} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} inputMode="numeric" type="password" maxLength={6} required autoComplete="new-password" />
            </label>
            <label className="block text-sm font-medium text-[#4E342E]">Ulangi PIN
              <input className={`${input} mt-1`} value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, ''))} inputMode="numeric" type="password" maxLength={6} required autoComplete="new-password" />
            </label>
            <button type="submit" className={primary} disabled={busy}>Simpan &amp; Mulai</button>
          </form>
        );
      default:
        return (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-[#EFEBE9] p-1 text-sm font-semibold" role="tablist">
              {([['account', 'Akun Owner'], ['token', 'Token Cabang']] as const).map(([value, label]) => (
                <button key={value} type="button" role="tab" aria-selected={mode === value}
                  onClick={() => { setMode(value); setError(''); }}
                  className={`rounded-lg py-2 ${mode === value ? 'bg-white text-[#3E2723] shadow-sm' : 'text-[#8D6E63]'}`}>{label}</button>
              ))}
            </div>

            {mode === 'account' ? (
              <form className="space-y-4" onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  const res = await loginOwner(email, password, serverUrl);
                  setPassword('');
                  setStep({ kind: 'branches', ...res });
                });
              }}>
                <label className="block text-sm font-medium text-[#4E342E]">Email
                  <input className={`${input} mt-1`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" placeholder="owner@example.com" />
                </label>
                <label className="block text-sm font-medium text-[#4E342E]">Password
                  <input className={`${input} mt-1`} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
                </label>
                <button type="submit" className={primary} disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <LogIn className="h-4 w-4" aria-hidden="true" />}Masuk &amp; Pilih Cabang
                </button>
                <a href={googleConnectUrl(serverUrl)} className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#D7CCC8] bg-white px-4 py-3 text-sm font-semibold text-[#2C2420] hover:bg-[#FAF7F5]">
                  Masuk dengan Google
                </a>
              </form>
            ) : (
              <form className="space-y-4" onSubmit={(e) => {
                e.preventDefault();
                void run(async () => proceed(await verifyToken(token, serverUrl)));
              }}>
                <label className="block text-sm font-medium text-[#4E342E]">Token sync cabang
                  <input className={`${input} mt-1 font-mono`} value={token} onChange={(e) => setToken(e.target.value)} required autoComplete="off" spellCheck={false} placeholder="tempel token dari dashboard" />
                </label>
                <p className="text-xs text-[#8D6E63]">Salin dari Dashboard Owner → Cabang &amp; Token, atau buka Link Kasir dari sana.</p>
                <button type="submit" className={primary} disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <KeyRound className="h-4 w-4" aria-hidden="true" />}Hubungkan
                </button>
              </form>
            )}

            <details className="text-xs text-[#8D6E63]">
              <summary className="cursor-pointer">Pengaturan server (opsional)</summary>
              <label className="mt-2 block">URL sync server (kosongkan bila kasir dibuka dari domain yang sama)
                <input className={`${input} mt-1`} value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} placeholder="http://localhost:3000/api/sync" />
              </label>
            </details>
          </div>
        );
    }
  })();

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F4F1EE] p-4 text-[#2C2420]">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl sm:p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 rounded-2xl bg-[#3E2723] p-3 text-white"><Coffee className="h-7 w-7" aria-hidden="true" /></div>
          <h1 className="text-xl font-bold">{step.kind === 'setup' ? 'Siapkan Cabang' : 'Hubungkan ke Cabang'}</h1>
          <p className="mt-1 text-sm text-[#8D6E63]">Kasir ini akan memakai menu, kasir, dan data dari cabang yang Anda pilih.</p>
        </div>
        {body}
        {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      </div>
    </div>
  );
}
