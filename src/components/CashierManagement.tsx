import React, { useState } from 'react';
import { Users, Plus, Clock, Trash2, KeyRound } from 'lucide-react';
import { Cashier, CashierRole } from '../types';
import { getCashiers, saveCashiers, getActiveShift } from '../lib/storage';
import { hashPin, hasPin, isValidPin } from '../lib/security';
import { ROLE_LABELS } from '../lib/permissions';

interface CashierManagementProps {
  activeCashier: Cashier;
  onOpenShiftModal: () => void;
}

export const CashierManagement: React.FC<CashierManagementProps> = ({
  activeCashier,
  onOpenShiftModal,
}) => {
  const [cashiers, setCashiers] = useState<Cashier[]>(getCashiers());
  const activeShift = getActiveShift();

  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<CashierRole>('Kasir');
  const [newPin, setNewPin] = useState('');
  const [formError, setFormError] = useState('');
  const [message, setMessage] = useState('');

  // Ganti PIN
  const [pinEditId, setPinEditId] = useState<string | null>(null);
  const [pinEditValue, setPinEditValue] = useState('');

  const persist = (updated: Cashier[]) => {
    saveCashiers(updated);
    setCashiers(updated);
  };

  const handleAddCashier = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setMessage('');
    if (!newName.trim()) return;
    if (!isValidPin(newPin.trim())) {
      setFormError('PIN wajib 4–6 digit angka.');
      return;
    }

    const colors = [
      'bg-amber-600 text-white',
      'bg-indigo-600 text-white',
      'bg-emerald-600 text-white',
      'bg-rose-600 text-white',
      'bg-violet-600 text-white',
    ];

    const newC: Cashier = {
      id: `c-${Date.now()}`,
      name: newName.trim(),
      role: newRole,
      ...hashPin(newPin.trim()),
      avatarColor: colors[Math.floor(Math.random() * colors.length)],
      isActive: false,
    };

    persist([...cashiers, newC]);
    setNewName('');
    setNewPin('');
    setMessage(`Kasir ${newC.name} ditambahkan.`);
  };

  const handleDeleteCashier = (target: Cashier) => {
    setMessage('');
    if (target.id === activeCashier.id) {
      setMessage('Tidak bisa menghapus akun yang sedang aktif.');
      return;
    }
    if (activeShift && activeShift.cashierId === target.id) {
      setMessage('Kasir ini sedang memegang shift terbuka. Tutup shift terlebih dahulu.');
      return;
    }
    if (target.role === 'Owner' && cashiers.filter((c) => c.role === 'Owner').length <= 1) {
      setMessage('Minimal harus ada 1 Owner.');
      return;
    }
    if (confirm(`Hapus ${target.name} dari daftar kasir?`)) {
      persist(cashiers.filter((c) => c.id !== target.id));
    }
  };

  const handleSavePin = (target: Cashier) => {
    if (!isValidPin(pinEditValue.trim())) {
      setMessage('PIN wajib 4–6 digit angka.');
      return;
    }
    persist(
      cashiers.map((c) => {
        if (c.id !== target.id) return c;
        const { pin: _legacy, ...rest } = c;
        return { ...rest, ...hashPin(pinEditValue.trim()) };
      })
    );
    setPinEditId(null);
    setPinEditValue('');
    setMessage(`PIN ${target.name} berhasil diganti.`);
  };

  return (
    <div className="max-w-7xl mx-auto p-3 sm:p-6 space-y-4 text-[#2C2420]">
      {/* Active Shift Info */}
      <div className="bg-white border border-[#D7CCC8] p-3.5 rounded-lg flex flex-wrap items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-[#EFEBE9] text-[#3E2723] rounded border border-[#D7CCC8]">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-extrabold text-sm sm:text-base text-[#3E2723] uppercase tracking-tight">Shift & Akses Kasir</h2>
            <p className="text-xs text-stone-500">
              {activeShift && activeShift.status === 'open'
                ? `Shift Aktif: ${activeShift.cashierName} (Mulai ${new Date(
                    activeShift.startTime
                  ).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })})`
                : 'Belum ada shift kasir yang dibuka hari ini'}
            </p>
          </div>
        </div>

        <button
          onClick={onOpenShiftModal}
          className="py-2 px-3 bg-[#3E2723] hover:bg-[#5D4037] text-white font-bold rounded text-xs uppercase shadow transition-all"
        >
          {activeShift && activeShift.status === 'open' ? 'Kelola / Tutup Shift' : 'Buka Shift Baru'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        {/* Cashier List */}
        <div className="md:col-span-7 bg-white border border-[#D7CCC8] p-3.5 rounded-lg space-y-3 shadow-sm">
          <h3 className="font-extrabold text-xs text-[#3E2723] uppercase tracking-wider flex items-center gap-2 border-b border-[#EFEBE9] pb-2">
            <Users className="w-4 h-4 text-[#3E2723]" />
            <span>Daftar Kasir Terdaftar</span>
          </h3>

          {message && (
            <p className="text-xs font-semibold text-[#3E2723] bg-[#EFEBE9] border border-[#D7CCC8] rounded px-2 py-1.5">
              {message}
            </p>
          )}

          <div className="space-y-2">
            {cashiers.map((c) => (
              <div
                key={c.id}
                className="p-3 bg-[#F9F8F7] rounded border border-[#D7CCC8] flex flex-wrap items-center justify-between gap-2"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-full bg-[#3E2723] text-white flex items-center justify-center font-black text-sm shadow-xs"
                  >
                    {c.name.charAt(0)}
                  </div>
                  <div>
                    <div className="font-bold text-xs text-[#2C2420] flex items-center gap-1.5">
                      <span>{c.name}</span>
                      <span className="bg-[#EFEBE9] text-[#5D4037] text-[10px] px-2 py-0.5 rounded font-extrabold border border-[#D7CCC8] uppercase">
                        {c.role}
                      </span>
                    </div>
                    <div className="text-[11px] text-stone-500 flex items-center gap-2 mt-0.5">
                      <span>PIN: {hasPin(c) ? '••••' : 'Belum diatur'}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  {pinEditId === c.id ? (
                    <>
                      <input
                        type="password"
                        inputMode="numeric"
                        maxLength={6}
                        autoFocus
                        placeholder="PIN baru"
                        value={pinEditValue}
                        onChange={(e) => setPinEditValue(e.target.value)}
                        className="w-24 bg-white border border-[#D7CCC8] rounded px-2 py-1 text-xs font-mono"
                      />
                      <button
                        onClick={() => handleSavePin(c)}
                        className="px-2 py-1 bg-[#3E2723] text-white rounded text-[11px] font-bold"
                      >
                        Simpan
                      </button>
                      <button
                        onClick={() => {
                          setPinEditId(null);
                          setPinEditValue('');
                        }}
                        className="px-2 py-1 bg-stone-100 border border-[#D7CCC8] rounded text-[11px] font-bold"
                      >
                        Batal
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => {
                        setPinEditId(c.id);
                        setPinEditValue('');
                        setMessage('');
                      }}
                      title="Ganti PIN"
                      aria-label={`Ganti PIN ${c.name}`}
                      className="p-1.5 text-stone-500 hover:text-[#3E2723] hover:bg-[#EFEBE9] rounded transition-colors"
                    >
                      <KeyRound className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => handleDeleteCashier(c)}
                    title="Hapus kasir"
                    aria-label={`Hapus ${c.name}`}
                    className="p-1.5 text-stone-400 hover:text-rose-700 hover:bg-rose-50 rounded transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Add Cashier Form */}
        <div className="md:col-span-5 bg-white border border-[#D7CCC8] p-3.5 rounded-lg space-y-3 shadow-sm">
          <h3 className="font-extrabold text-xs text-[#3E2723] uppercase tracking-wider flex items-center gap-2 border-b border-[#EFEBE9] pb-2">
            <Plus className="w-4 h-4 text-[#3E2723]" />
            <span>Tambah Kasir Baru</span>
          </h3>

          <form onSubmit={handleAddCashier} className="space-y-3">
            <div>
              <label className="text-xs font-bold text-[#3E2723] block mb-1">Nama Lengkap</label>
              <input
                type="text"
                required
                placeholder="Contoh: Rian Warkop"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full bg-white border border-[#D7CCC8] text-[#2C2420] rounded px-3 py-1.5 text-xs focus:outline-none focus:border-[#3E2723]"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-[#3E2723] block mb-1">Jabatan / Role</label>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as CashierRole)}
                className="w-full bg-white border border-[#D7CCC8] text-[#2C2420] rounded px-3 py-1.5 text-xs focus:outline-none focus:border-[#3E2723] font-bold uppercase"
              >
                {(Object.keys(ROLE_LABELS) as CashierRole[]).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-stone-500 mt-1">
                Kasir: transaksi & riwayat. Supervisor: + batal nota, menu, laporan. Owner: akses penuh.
              </p>
            </div>

            <div>
              <label className="text-xs font-bold text-[#3E2723] block mb-1">PIN Rahasia (4–6 angka)</label>
              <input
                type="password"
                inputMode="numeric"
                required
                maxLength={6}
                value={newPin}
                onChange={(e) => setNewPin(e.target.value)}
                className="w-full bg-white border border-[#D7CCC8] text-[#2C2420] rounded px-3 py-1.5 text-xs focus:outline-none focus:border-[#3E2723]"
              />
              {formError && <p className="text-xs text-rose-700 font-semibold mt-1">{formError}</p>}
            </div>

            <button
              type="submit"
              className="w-full py-2 bg-[#3E2723] hover:bg-[#5D4037] text-white font-extrabold rounded text-xs uppercase shadow transition-all"
            >
              Simpan Kasir
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
