import React, { useEffect, useMemo, useState } from 'react';
import { Wallet, Plus, Trash2, CalendarDays, CalendarRange } from 'lucide-react';
import { RupiahInput } from './RupiahInput';
import { Cashier, Expense, ExpenseScope, Shift } from '../types';
import {
  addExpense,
  deleteExpense,
  EXPENSE_CATEGORIES,
  formatIDR,
  getExpenses,
  POS_UPDATE_EVENT,
} from '../lib/storage';
import { toLocalDateKey, toMonthKey } from '../lib/reports';
import { can } from '../lib/permissions';

interface ExpensesScreenProps {
  activeCashier: Cashier;
  activeShift: Shift | null;
}

const inputCls =
  'w-full bg-white border border-[#D7CCC8] text-[#2C2420] rounded px-3 py-2 text-sm focus:outline-none focus:border-[#3E2723]';

function formatDayLabel(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' });
}

function formatMonthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
}

export const ExpensesScreen: React.FC<ExpensesScreenProps> = ({ activeCashier, activeShift }) => {
  const canManage = can(activeCashier.role, 'manageExpenses');
  const today = toLocalDateKey(new Date());

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [month, setMonth] = useState<string>(toMonthKey(new Date()));
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // Form
  const [scope, setScope] = useState<ExpenseScope>('daily');
  const [date, setDate] = useState<string>(today);
  const [formMonth, setFormMonth] = useState<string>(toMonthKey(new Date()));
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES.daily[0]);
  const [amount, setAmount] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [fromDrawer, setFromDrawer] = useState<boolean>(true);

  useEffect(() => {
    const load = () => setExpenses(getExpenses());
    load();
    window.addEventListener(POS_UPDATE_EVENT, load);
    return () => window.removeEventListener(POS_UPDATE_EVENT, load);
  }, []);

  const canUseDrawer = scope === 'daily' && Boolean(activeShift) && date === today;

  const switchScope = (s: ExpenseScope) => {
    setScope(s);
    setCategory(EXPENSE_CATEGORIES[s][0]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      addExpense({
        scope,
        date: scope === 'daily' ? date : formMonth,
        category,
        amount: Number(amount.replace(/\D/g, '')),
        note,
        fromDrawer: canUseDrawer && fromDrawer,
        createdBy: activeCashier.name,
      });
      setAmount('');
      setNote('');
      setNotice({ type: 'success', msg: 'Pengeluaran tersimpan.' });
    } catch (err: any) {
      setNotice({ type: 'error', msg: err?.message || 'Gagal menyimpan pengeluaran.' });
    }
  };

  const handleDelete = (exp: Expense) => {
    if (!confirm(`Hapus pengeluaran ${exp.category} ${formatIDR(exp.amount)}?`)) return;
    const res = deleteExpense(exp.id);
    setNotice({ type: res.ok ? 'success' : 'error', msg: res.message });
  };

  const { dailyGroups, dailyTotal, monthly, monthlyTotal } = useMemo(() => {
    const daily = expenses.filter((e) => e.scope === 'daily' && e.date.startsWith(month));
    const groups = new Map<string, Expense[]>();
    daily
      .slice()
      .sort((a, b) => (a.date === b.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date)))
      .forEach((e) => {
        if (!groups.has(e.date)) groups.set(e.date, []);
        groups.get(e.date)!.push(e);
      });
    const monthlyList = expenses.filter((e) => e.scope === 'monthly' && e.date === month);
    return {
      dailyGroups: [...groups.entries()],
      dailyTotal: daily.reduce((a, e) => a + e.amount, 0),
      monthly: monthlyList,
      monthlyTotal: monthlyList.reduce((a, e) => a + e.amount, 0),
    };
  }, [expenses, month]);

  const todayTotal = expenses
    .filter((e) => e.scope === 'daily' && e.date === today)
    .reduce((a, e) => a + e.amount, 0);

  const ExpenseRow: React.FC<{ e: Expense }> = ({ e }) => (
    <div className="flex items-start justify-between gap-3 py-2">
      <div className="min-w-0">
        <div className="font-bold text-xs text-[#2C2420]">
          {e.category}
          {e.fromDrawer && (
            <span className="ml-1.5 text-[9px] font-bold uppercase bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">
              Dari laci
            </span>
          )}
        </div>
        {e.note && <div className="text-[11px] text-stone-600 break-words">{e.note}</div>}
        <div className="text-[10px] text-stone-400">oleh {e.createdBy}</div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="font-black text-xs text-rose-700">-{formatIDR(e.amount)}</span>
        {canManage && (
          <button
            onClick={() => handleDelete(e)}
            className="p-1 text-stone-400 hover:text-rose-700"
            aria-label="Hapus pengeluaran"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto p-3 sm:p-6 space-y-4 text-[#2C2420]">
      <div className="bg-white border border-[#D7CCC8] p-3.5 rounded-lg flex flex-wrap items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-[#EFEBE9] text-[#3E2723] rounded border border-[#D7CCC8]">
            <Wallet className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-extrabold text-sm sm:text-base text-[#3E2723] uppercase tracking-tight">
              Catatan Pengeluaran
            </h2>
            <p className="text-xs text-stone-500">Pengeluaran harian & biaya bulanan (sewa, gaji, listrik)</p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-stone-500 font-bold uppercase">Pengeluaran hari ini</div>
          <div className="font-black text-rose-700">{formatIDR(todayTotal)}</div>
        </div>
      </div>

      {notice && (
        <div
          className={`p-2.5 rounded text-xs font-semibold border flex justify-between gap-3 ${
            notice.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
              : 'bg-rose-50 text-rose-900 border-rose-300'
          }`}
        >
          <span>{notice.msg}</span>
          <button onClick={() => setNotice(null)} className="font-bold" aria-label="Tutup">
            ×
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="lg:col-span-5 bg-white border border-[#D7CCC8] p-3.5 rounded-lg shadow-sm space-y-3 h-fit"
        >
          <h3 className="font-extrabold text-xs text-[#3E2723] uppercase tracking-wider flex items-center gap-2 border-b border-[#EFEBE9] pb-2">
            <Plus className="w-4 h-4" />
            <span>Tambah Pengeluaran</span>
          </h3>

          <div className="grid grid-cols-2 gap-2">
            {(['daily', 'monthly'] as ExpenseScope[]).map((s) => {
              const disabled = s === 'monthly' && !canManage;
              return (
                <button
                  key={s}
                  type="button"
                  disabled={disabled}
                  onClick={() => switchScope(s)}
                  className={`py-2 rounded text-xs font-bold border transition-all disabled:opacity-40 ${
                    scope === s
                      ? 'bg-[#3E2723] text-white border-[#3E2723]'
                      : 'bg-[#F9F8F7] text-[#5D4037] border-[#D7CCC8]'
                  }`}
                  title={disabled ? 'Hanya Supervisor / Owner' : undefined}
                >
                  {s === 'daily' ? 'Harian' : 'Bulanan (Global)'}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-bold text-[#3E2723] block mb-1">
                {scope === 'daily' ? 'Tanggal' : 'Bulan'}
              </label>
              {scope === 'daily' ? (
                <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} className={inputCls} required />
              ) : (
                <input type="month" value={formMonth} onChange={(e) => setFormMonth(e.target.value)} className={inputCls} required />
              )}
            </div>
            <div>
              <label className="text-xs font-bold text-[#3E2723] block mb-1">Kategori</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>
                {EXPENSE_CATEGORIES[scope].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-[#3E2723] block mb-1">Nominal</label>
            <RupiahInput
              value={Number(amount) || 0}
              onChange={(v) => setAmount(v ? String(v) : '')}
              className={`${inputCls.replace('px-3', 'pr-3')} font-bold`}
              required
            />
          </div>

          <div>
            <label className="text-xs font-bold text-[#3E2723] block mb-1">Catatan (opsional)</label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={scope === 'daily' ? 'mis. es batu 2 balok' : 'mis. gaji 2 karyawan'}
              className={inputCls}
            />
          </div>

          {scope === 'daily' && (
            <label className={`flex items-start gap-2 text-xs ${canUseDrawer ? '' : 'opacity-50'}`}>
              <input
                type="checkbox"
                checked={canUseDrawer && fromDrawer}
                disabled={!canUseDrawer}
                onChange={(e) => setFromDrawer(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                <strong>Diambil dari laci kas</strong>
                <span className="block text-[10px] text-stone-500">
                  {canUseDrawer
                    ? 'Uang tunai di laci yang seharusnya ada saat tutup shift ikut dikurangi.'
                    : 'Hanya untuk pengeluaran hari ini saat shift sedang terbuka.'}
                </span>
              </span>
            </label>
          )}

          <button
            type="submit"
            className="w-full py-2.5 bg-[#3E2723] hover:bg-[#5D4037] text-white font-bold rounded text-xs uppercase shadow"
          >
            Simpan Pengeluaran
          </button>
        </form>

        {/* Daftar */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white border border-[#D7CCC8] p-3 rounded-lg shadow-sm flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-bold text-[#3E2723]">
              <CalendarRange className="w-4 h-4" />
              <span>Bulan</span>
              <input
                type="month"
                value={month}
                onChange={(e) => e.target.value && setMonth(e.target.value)}
                className="bg-white border border-[#D7CCC8] rounded px-2 py-1 text-xs"
              />
            </div>
            <div className="text-xs text-stone-600">
              Total {formatMonthLabel(month)}:{' '}
              <strong className="text-rose-700">{formatIDR(dailyTotal + monthlyTotal)}</strong>
            </div>
          </div>

          <div className="bg-white border border-[#D7CCC8] p-3.5 rounded-lg shadow-sm">
            <h3 className="font-extrabold text-xs text-[#3E2723] uppercase tracking-wider flex items-center justify-between gap-2 border-b border-[#EFEBE9] pb-2">
              <span className="flex items-center gap-2">
                <CalendarRange className="w-4 h-4" /> Pengeluaran Bulanan (Global)
              </span>
              <span className="text-rose-700">{formatIDR(monthlyTotal)}</span>
            </h3>
            {monthly.length === 0 ? (
              <p className="text-xs text-stone-500 italic py-3 text-center">
                Belum ada biaya bulanan untuk {formatMonthLabel(month)}
              </p>
            ) : (
              <div className="divide-y divide-[#EFEBE9]">
                {monthly.map((e) => (
                  <ExpenseRow key={e.id} e={e} />
                ))}
              </div>
            )}
          </div>

          <div className="bg-white border border-[#D7CCC8] p-3.5 rounded-lg shadow-sm">
            <h3 className="font-extrabold text-xs text-[#3E2723] uppercase tracking-wider flex items-center justify-between gap-2 border-b border-[#EFEBE9] pb-2">
              <span className="flex items-center gap-2">
                <CalendarDays className="w-4 h-4" /> Pengeluaran Harian
              </span>
              <span className="text-rose-700">{formatIDR(dailyTotal)}</span>
            </h3>
            {dailyGroups.length === 0 ? (
              <p className="text-xs text-stone-500 italic py-3 text-center">Belum ada pengeluaran harian</p>
            ) : (
              dailyGroups.map(([day, list]) => (
                <div key={day} className="pt-2">
                  <div className="flex justify-between text-[11px] font-bold text-[#5D4037] bg-[#FAF8F6] px-2 py-1 rounded">
                    <span>{formatDayLabel(day)}</span>
                    <span>{formatIDR(list.reduce((a, e) => a + e.amount, 0))}</span>
                  </div>
                  <div className="divide-y divide-[#EFEBE9] px-1">
                    {list.map((e) => (
                      <ExpenseRow key={e.id} e={e} />
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
