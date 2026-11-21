import React, { useState } from 'react';
import { LogOut, Store } from 'lucide-react';
import { disconnectBlocker, disconnectDevice, getConnectedBranch, hasPendingPush, performCloudSync } from '../lib/storage';

/** Info cabang yang terhubung + "Keluar dari Cabang" (Owner, PIN, setelah semua data terkirim). */
export function DisconnectBranchPanel() {
  const branch = getConnectedBranch();
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      // Kirim sisa data lebih dulu; logout tetap ditolak bila masih ada yang belum terkirim.
      if (hasPendingPush()) await performCloudSync();
      const res = disconnectDevice(pin);
      if (!res.ok) setMessage(res.message);
    } finally {
      setBusy(false);
      setPin('');
    }
  };

  const blocker = disconnectBlocker();
  return (
    <div className="rounded-lg border border-[#D7CCC8] bg-[#FAF7F5] p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-xs text-[#3E2723]">
          <Store className="h-4 w-4" aria-hidden="true" />
          Terhubung ke cabang: <strong>{branch?.name ?? 'memuat…'}</strong>
        </p>
        {!open && (
          <button type="button" onClick={() => { setOpen(true); setMessage(''); }}
            className="flex items-center gap-1.5 rounded border border-rose-300 bg-white px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50">
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" />Keluar dari Cabang
          </button>
        )}
      </div>
      {open && (
        <form onSubmit={submit} className="space-y-2 rounded border border-rose-200 bg-white p-3">
          <p className="text-xs text-stone-700">
            Semua data cabang di perangkat ini akan dihapus (data di server tetap aman). Perangkat kembali ke layar
            Hubungkan ke Cabang. Masukkan PIN Owner untuk melanjutkan.
          </p>
          {blocker && <p className="text-xs font-medium text-amber-800">{blocker}</p>}
          <input type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} placeholder="PIN Owner" aria-label="PIN Owner"
            className="w-full rounded border border-[#D7CCC8] px-3 py-1.5 text-sm" required />
          <div className="flex gap-2">
            <button type="submit" disabled={busy || pin.length < 4}
              className="rounded bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50">
              {busy ? 'Mengirim data...' : 'Ya, Keluar'}
            </button>
            <button type="button" onClick={() => { setOpen(false); setPin(''); setMessage(''); }}
              className="rounded px-3 py-1.5 text-xs font-bold text-stone-600 hover:bg-stone-100">Batal</button>
          </div>
          {message && <p role="alert" className="text-xs font-medium text-rose-700">{message}</p>}
        </form>
      )}
    </div>
  );
}
