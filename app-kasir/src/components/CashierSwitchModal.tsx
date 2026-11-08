import React, { useState } from 'react';
import {
  X,
  Users,
  UserCheck,
  Lock,
  Plus,
  Clock,
  LogOut,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { RupiahInput } from './RupiahInput';
import { Cashier, Shift } from '../types';
import {
  getCashiers,
  saveCashiers,
  setActiveCashier,
  startNewShift,
  closeCurrentShift,
  formatIDR,
} from '../lib/storage';
import { hasPin, verifyPin, hashPin, isValidPin } from '../lib/security';
import { can, ROLE_LABELS } from '../lib/permissions';
import { getExpectedDrawerCash } from '../lib/reports';
import { CashierRole } from '../types';

interface CashierSwitchModalProps {
  activeCashier: Cashier;
  activeShift: Shift | null;
  onClose: () => void;
  onCashierChanged: (cashier: Cashier) => void;
}

export const CashierSwitchModal: React.FC<CashierSwitchModalProps> = ({
  activeCashier,
  activeShift,
  onClose,
  onCashierChanged,
}) => {
  const [cashiers, setCashiers] = useState<Cashier[]>(getCashiers());
  const [selectedCashier, setSelectedCashier] = useState<Cashier>(activeCashier);
  const [pinInput, setPinInput] = useState<string>('');
  const [pinError, setPinError] = useState<string>('');
  const [viewMode, setViewMode] = useState<'switch' | 'new_shift' | 'close_shift' | 'add_cashier'>(
    'switch'
  );

  // New Shift state
  const [startingCash, setStartingCash] = useState<number>(100000);

  const [shiftError, setShiftError] = useState<string>('');

  // Close Shift state
  const expectedCash = activeShift ? getExpectedDrawerCash(activeShift) : 0;
  const [endingCashActual, setEndingCashActual] = useState<number>(expectedCash);
  const cashDifference = endingCashActual - expectedCash;

  // Add Cashier state (hanya Owner)
  const canManageCashiers = can(activeCashier.role, 'cashiers');
  const [newName, setNewName] = useState<string>('');
  const [newRole, setNewRole] = useState<CashierRole>('Kasir');
  const [newPin, setNewPin] = useState<string>('');
  const [addError, setAddError] = useState<string>('');

  const checkSelectedPin = (): boolean => {
    if (hasPin(selectedCashier) && !verifyPin(selectedCashier, pinInput)) {
      setPinError('PIN Kasir Salah! Mohon periksa kembali.');
      return false;
    }
    return true;
  };

  const handleSelectCashier = (target: Cashier) => {
    setSelectedCashier(target);
    setPinInput('');
    setPinError('');
  };

  const handleConfirmSwitch = () => {
    if (!checkSelectedPin()) return;

    setActiveCashier(selectedCashier.id);
    onCashierChanged(selectedCashier);
    onClose();
  };

  const handleStartShiftSubmit = () => {
    setShiftError('');
    if (!checkSelectedPin()) return;
    if (!Number.isFinite(startingCash) || startingCash < 0) {
      setShiftError('Modal awal tidak valid.');
      return;
    }
    try {
      startNewShift(selectedCashier.id, startingCash);
      onCashierChanged(selectedCashier);
      onClose();
    } catch (err: any) {
      setShiftError(err?.message || 'Gagal membuka shift.');
    }
  };

  const handleCloseShiftSubmit = () => {
    if (!Number.isFinite(endingCashActual) || endingCashActual < 0) {
      setShiftError('Jumlah uang fisik tidak valid.');
      return;
    }
    closeCurrentShift(endingCashActual);
    setViewMode('switch');
    onClose();
  };

  const handleAddCashierSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAddError('');
    if (!canManageCashiers) return;
    if (!newName.trim()) return;
    if (!isValidPin(newPin.trim())) {
      setAddError('PIN wajib 4–6 digit angka.');
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

    const updated = [...cashiers, newC];
    saveCashiers(updated);
    setCashiers(updated);
    setNewName('');
    setNewPin('');
    setViewMode('switch');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white border border-[#D7CCC8] text-[#2C2420] rounded-xl max-w-lg w-full overflow-hidden shadow-2xl flex flex-col my-auto">
        {/* Header */}
        <div className="p-3.5 bg-[#3E2723] text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-[#D7CCC8]" />
            <div>
              <h3 className="font-extrabold text-xs uppercase tracking-tight text-white">
                {viewMode === 'switch' && 'Switch / Ganti Kasir'}
                {viewMode === 'new_shift' && 'Buka Shift Kasir Baru'}
                {viewMode === 'close_shift' && 'Tutup Shift Kasir Hari Ini'}
                {viewMode === 'add_cashier' && 'Tambah Profil Kasir Baru'}
              </h3>
              <p className="text-[10px] text-stone-300">Pilih kasir aktif dan kelola shift kerja</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 text-white/80 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 space-y-4">
          {/* VIEW MODE: SWITCH CASHIER */}
          {viewMode === 'switch' && (
            <div className="space-y-4">
              {/* Shift Status Widget */}
              <div className="bg-[#FAF8F6] border border-[#D7CCC8] p-3 rounded flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded bg-[#EFEBE9] text-[#3E2723]">
                    <Clock className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-[#2C2420]">
                      Shift Saat Ini: {activeShift ? activeShift.cashierName : '—'}
                    </div>
                    <div className="text-[10px] text-stone-500 font-medium">
                      {activeShift
                        ? `Total Tunai Laci: ${formatIDR(getExpectedDrawerCash(activeShift))}`
                        : 'Belum ada shift terbuka'}
                    </div>
                  </div>
                </div>

                <div className="flex gap-1.5">
                  {activeShift && activeShift.status === 'open' ? (
                    <button
                      type="button"
                      onClick={() => setViewMode('close_shift')}
                      className="px-2.5 py-1 bg-rose-100 hover:bg-rose-200 border border-rose-300 text-rose-800 font-bold text-xs rounded flex items-center gap-1 transition-all"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Tutup Shift</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setShiftError('');
                        setViewMode('new_shift');
                      }}
                      className="px-2.5 py-1 bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 text-emerald-800 font-bold text-xs rounded transition-all"
                    >
                      Buka Shift
                    </button>
                  )}
                </div>
              </div>

              {/* Cashiers Selection List */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold uppercase tracking-wider text-[#3E2723]">
                    Pilih Kasir Bertugas
                  </label>

                  {canManageCashiers && (
                    <button
                      onClick={() => setViewMode('add_cashier')}
                      className="text-xs text-[#3E2723] hover:underline font-bold flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Kasir Baru</span>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-2 max-h-52 overflow-y-auto pr-1">
                  {cashiers.map((c) => {
                    const isSelected = selectedCashier.id === c.id;
                    const isCurrent = activeCashier.id === c.id;
                    return (
                      <div
                        key={c.id}
                        onClick={() => handleSelectCashier(c)}
                        className={`p-2.5 rounded border flex items-center justify-between cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-[#EFEBE9] border-[#3E2723] text-[#3E2723] shadow-xs'
                            : 'bg-white border-[#D7CCC8] text-[#2C2420] hover:bg-stone-50'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className="w-8 h-8 rounded-full bg-[#3E2723] text-white flex items-center justify-center font-black text-xs shadow-xs"
                          >
                            {c.name.charAt(0)}
                          </div>

                          <div>
                            <div className="font-bold text-xs text-[#2C2420] flex items-center gap-1.5">
                              <span>{c.name}</span>
                              {isCurrent && (
                                <span className="bg-[#3E2723] text-white text-[9px] px-1.5 py-0.2 rounded font-extrabold uppercase">
                                  Sedang Aktif
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-stone-500 uppercase">{c.role}</div>
                          </div>
                        </div>

                        {isSelected && <UserCheck className="w-4 h-4 text-[#3E2723]" />}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* PIN Verification Input if PIN exists */}
              {hasPin(selectedCashier) && (
                <div className="space-y-1.5 bg-[#FAF8F6] p-3 rounded border border-[#D7CCC8]">
                  <label className="text-xs font-bold text-[#3E2723] flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-[#3E2723]" />
                    <span>Konfirmasi PIN Kasir ({selectedCashier.name})</span>
                  </label>
                  <input
                    type="password"
                    maxLength={6}
                    inputMode="numeric"
                    placeholder="Masukkan PIN"
                    value={pinInput}
                    onChange={(e) => {
                      setPinInput(e.target.value);
                      setPinError('');
                    }}
                    className="w-full bg-white border border-[#D7CCC8] text-[#2C2420] rounded px-3 py-1.5 text-xs font-mono tracking-widest focus:outline-none focus:border-[#3E2723]"
                  />
                  {pinError && <p className="text-xs text-rose-700 font-semibold">{pinError}</p>}
                </div>
              )}

              {/* Confirm Switch Action */}
              <button
                type="button"
                onClick={handleConfirmSwitch}
                className="w-full py-2.5 bg-[#3E2723] hover:bg-[#5D4037] text-white font-bold rounded text-xs uppercase shadow transition-all"
              >
                Ganti Ke Kasir {selectedCashier.name}
              </button>
            </div>
          )}

          {/* VIEW MODE: NEW SHIFT */}
          {viewMode === 'new_shift' && (
            <div className="space-y-4">
              <div className="bg-emerald-50 border border-emerald-200 p-3 rounded text-xs text-emerald-900 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Mulai Shift Kasir Baru</p>
                  <p className="text-[10px] text-emerald-800">
                    Shift dibuka atas nama <strong>{selectedCashier.name}</strong>. Masukkan saldo kasir awal
                    (modal kembalian di laci).
                  </p>
                </div>
              </div>

              {hasPin(selectedCashier) && (
                <div>
                  <label className="text-xs font-bold text-[#3E2723] flex items-center gap-1.5 mb-1">
                    <Lock className="w-3.5 h-3.5" />
                    <span>PIN {selectedCashier.name}</span>
                  </label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    value={pinInput}
                    onChange={(e) => {
                      setPinInput(e.target.value);
                      setPinError('');
                    }}
                    className="w-full bg-white border border-[#D7CCC8] text-[#2C2420] rounded px-3 py-1.5 text-xs font-mono tracking-widest focus:outline-none focus:border-[#3E2723]"
                  />
                  {pinError && <p className="text-xs text-rose-700 font-semibold mt-1">{pinError}</p>}
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-[#3E2723] block mb-1">
                  Saldo Kas Awal di Laci (Modal Kembalian)
                </label>
                <RupiahInput
                  emptyWhenZero={false}
                  value={startingCash}
                  onChange={setStartingCash}
                  className="w-full bg-white border border-[#D7CCC8] text-[#2C2420] rounded pr-3 py-1.5 text-xs font-bold focus:outline-none focus:border-[#3E2723]"
                />
              </div>

              {shiftError && <p className="text-xs text-rose-700 font-semibold">{shiftError}</p>}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setViewMode('switch')}
                  className="w-1/2 py-2 bg-stone-100 hover:bg-stone-200 text-[#2C2420] border border-[#D7CCC8] font-bold rounded text-xs"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleStartShiftSubmit}
                  className="w-1/2 py-2 bg-[#2E7D32] hover:bg-[#1B5E20] text-white font-extrabold rounded text-xs uppercase shadow"
                >
                  Buka Shift Sekarang
                </button>
              </div>
            </div>
          )}

          {/* VIEW MODE: CLOSE SHIFT */}
          {viewMode === 'close_shift' && activeShift && (
            <div className="space-y-3">
              <div className="bg-[#FAF8F6] p-3 rounded border border-[#D7CCC8] space-y-2 text-xs">
                <div className="flex justify-between text-stone-600">
                  <span>Mulai Shift</span>
                  <span className="text-stone-900 font-bold">
                    {new Date(activeShift.startTime).toLocaleTimeString('id-ID', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>

                <div className="flex justify-between text-stone-600">
                  <span>Modal Awal Laci</span>
                  <span className="font-semibold">{formatIDR(activeShift.startingCash)}</span>
                </div>

                <div className="flex justify-between text-stone-600">
                  <span>Total Sales Tunai</span>
                  <span className="font-bold text-emerald-800">
                    +{formatIDR(activeShift.totalSalesCash)}
                  </span>
                </div>

                {(activeShift.overpayCash ?? 0) > 0 && (
                  <div className="flex justify-between text-stone-600">
                    <span>Kelebihan (kembalian permen)</span>
                    <span className="font-bold text-emerald-800">+{formatIDR(activeShift.overpayCash ?? 0)}</span>
                  </div>
                )}

                {(activeShift.debtCollectedCash ?? 0) > 0 && (
                  <div className="flex justify-between text-stone-600">
                    <span>Pelunasan Bon (Tunai)</span>
                    <span className="font-bold text-emerald-800">
                      +{formatIDR(activeShift.debtCollectedCash ?? 0)}
                    </span>
                  </div>
                )}

                {(activeShift.expensesCash ?? 0) > 0 && (
                  <div className="flex justify-between text-stone-600">
                    <span>Pengeluaran dari Laci</span>
                    <span className="font-bold text-rose-700">-{formatIDR(activeShift.expensesCash ?? 0)}</span>
                  </div>
                )}

                <div className="flex justify-between text-stone-600">
                  <span>Total Sales Non-Tunai</span>
                  <span className="font-bold text-blue-800">
                    {formatIDR(activeShift.totalSalesNonCash + (activeShift.debtCollectedNonCash ?? 0))}
                  </span>
                </div>

                {(activeShift.totalSalesDebt ?? 0) > 0 && (
                  <div className="flex justify-between text-stone-600">
                    <span>Penjualan Bon (belum dibayar)</span>
                    <span className="font-bold text-amber-800">{formatIDR(activeShift.totalSalesDebt ?? 0)}</span>
                  </div>
                )}

                <div className="flex justify-between font-black text-[#3E2723] pt-1.5 border-t border-[#D7CCC8]">
                  <span>Ekspektasi Uang Tunai Laci</span>
                  <span>{formatIDR(expectedCash)}</span>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-[#3E2723] block mb-1">
                  Hasil Hitung Uang Fisik Laci
                </label>
                <RupiahInput
                  emptyWhenZero={false}
                  value={endingCashActual}
                  onChange={setEndingCashActual}
                  className="w-full bg-white border border-[#D7CCC8] text-[#2C2420] rounded pr-3 py-1.5 text-xs font-bold focus:outline-none focus:border-[#3E2723]"
                />
                <p
                  className={`text-xs font-bold mt-1.5 ${
                    cashDifference === 0
                      ? 'text-emerald-700'
                      : cashDifference > 0
                        ? 'text-blue-700'
                        : 'text-rose-700'
                  }`}
                >
                  {cashDifference === 0
                    ? 'Kas cocok ✓'
                    : cashDifference > 0
                      ? `Kelebihan kas ${formatIDR(cashDifference)}`
                      : `Kekurangan kas ${formatIDR(-cashDifference)}`}
                </p>
                {shiftError && <p className="text-xs text-rose-700 font-semibold mt-1">{shiftError}</p>}
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setViewMode('switch')}
                  className="w-1/2 py-2 bg-stone-100 hover:bg-stone-200 text-[#2C2420] border border-[#D7CCC8] font-bold rounded text-xs"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleCloseShiftSubmit}
                  className="w-1/2 py-2 bg-rose-700 hover:bg-rose-800 text-white font-extrabold rounded text-xs uppercase shadow"
                >
                  Tutup Shift & Simpan Laporan
                </button>
              </div>
            </div>
          )}

          {/* VIEW MODE: ADD CASHIER */}
          {viewMode === 'add_cashier' && (
            <form onSubmit={handleAddCashierSubmit} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-[#3E2723] block mb-1">Nama Kasir</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Rian Warkop..."
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
              </div>

              <div>
                <label className="text-xs font-bold text-[#3E2723] block mb-1">PIN Akses (4-6 Angka)</label>
                <input
                  type="password"
                  inputMode="numeric"
                  required
                  maxLength={6}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value)}
                  className="w-full bg-white border border-[#D7CCC8] text-[#2C2420] rounded px-3 py-1.5 text-xs focus:outline-none focus:border-[#3E2723]"
                />
                {addError && <p className="text-xs text-rose-700 font-semibold mt-1">{addError}</p>}
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setViewMode('switch')}
                  className="w-1/2 py-2 bg-stone-100 hover:bg-stone-200 text-[#2C2420] border border-[#D7CCC8] font-bold rounded text-xs"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="w-1/2 py-2 bg-[#3E2723] hover:bg-[#5D4037] text-white font-extrabold rounded text-xs uppercase shadow tracking-wider"
                >
                  Simpan Kasir Baru
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
