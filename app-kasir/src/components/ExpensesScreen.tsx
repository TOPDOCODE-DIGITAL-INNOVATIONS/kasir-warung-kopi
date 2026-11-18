import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Wallet, Plus, Pencil, Trash2, CalendarDays, CalendarRange, FileDown } from 'lucide-react';
import { printExpenseReport } from '../../../shared/expense-report';
import { RupiahInput } from './RupiahInput';
import ExpenseProductPicker from './ExpenseProductPicker';
import { expenseNoteSuggestions, type ExpensePurchaseProduct } from '../../../shared/expense-products';
import { Cashier, Expense, ExpenseScope, Shift } from '../types';
import {
  addExpenseBatch,
  updateExpense,
  deleteExpense,
  EXPENSE_CATEGORIES,
  formatIDR,
  getExpenses,
  getExpensePurchaseCatalog,
  getStoreSettings,
  POS_UPDATE_EVENT,
  searchExpensePurchaseProducts,
} from '../lib/storage';
import { toLocalDateKey, toMonthKey } from '../lib/reports';
import { can } from '../lib/permissions';

interface ExpensesScreenProps {
  activeCashier: Cashier;
  activeShift: Shift | null;
}

const inputCls =
  'w-full bg-white border border-[#D7CCC8] text-[#2C2420] rounded px-3 py-2 text-sm focus:outline-none focus:border-[#3E2723]';
const unitLabel = (unit?: string) => unit === 'l' ? 'L' : unit ?? '';
type ExpenseItem = {
  id: number;
  category: string;
  amount: number;
  note: string;
  purchase: { product: ExpensePurchaseProduct; businessId: string } | null;
  quantity: string;
  unit: string;
};
const newExpenseItem = (id: number, scope: ExpenseScope): ExpenseItem => ({
  id, category: EXPENSE_CATEGORIES[scope][0], amount: 0, note: '', purchase: null, quantity: '', unit: '',
});

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
  const [exporting, setExporting] = useState(false);

  // Form
  const [scope, setScope] = useState<ExpenseScope>('daily');
  const [date, setDate] = useState<string>(today);
  const [formMonth, setFormMonth] = useState<string>(toMonthKey(new Date()));
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES.daily[0]);
  const [amount, setAmount] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [fromDrawer, setFromDrawer] = useState<boolean>(true);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [items, setItems] = useState(() => [newExpenseItem(0, 'daily')]);
  const nextItemId = useRef(1);
  const [catalog, setCatalog] = useState(getExpensePurchaseCatalog);
  const [supplierId, setSupplierId] = useState('');
  const formRef = useRef<HTMLFormElement>(null);
  const financialLocked = !!editing && (!!editing.purchaseLineId || (!!editing.fromDrawer && editing.shiftId !== activeShift?.id));
  const dateLocked = financialLocked || !!editing?.fromDrawer;

  const resetForm = () => {
    setEditing(null); setScope('daily'); setDate(today); setFormMonth(toMonthKey(new Date()));
    setCategory(EXPENSE_CATEGORIES.daily[0]); setAmount(''); setNote(''); setFromDrawer(true);
    setItems([newExpenseItem(nextItemId.current++, 'daily')]);
    setSupplierId('');
  };

  const startEdit = (expense: Expense) => {
    setEditing(expense); setScope(expense.scope); setDate(expense.scope === 'daily' ? expense.date : today);
    setFormMonth(expense.date.slice(0, 7)); setCategory(expense.category); setAmount(String(expense.amount));
    setNote(expense.note ?? ''); setFromDrawer(!!expense.fromDrawer); setNotice(null);
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  useEffect(() => {
    const load = () => { setExpenses(getExpenses()); setCatalog(getExpensePurchaseCatalog()); };
    const controller = new AbortController();
    if (navigator.onLine && !getExpensePurchaseCatalog()?.suppliers && getStoreSettings().syncApiKey) {
      void searchExpensePurchaseProducts('', controller.signal).then(result => {
        if (!controller.signal.aborted) setCatalog(result);
      }).catch(() => undefined);
    }
    load();
    window.addEventListener(POS_UPDATE_EVENT, load);
    return () => { controller.abort(); window.removeEventListener(POS_UPDATE_EVENT, load); };
  }, []);

  const canUseDrawer = scope === 'daily' && Boolean(activeShift) && date === today;
  const historicalNotes = useMemo(() => [
    ...expenses.filter(expense => !expense.productName && (!catalog || expense.businessId === catalog.businessId)).map(expense => expense.note),
    ...(catalog?.notes ?? []),
  ], [expenses, catalog]);

  const changeItem = (id: number, values: Partial<ExpenseItem>) => setItems(previous =>
    previous.map(item => item.id === id ? { ...item, ...values } : item));

  const switchScope = (s: ExpenseScope) => {
    setScope(s);
    setCategory(EXPENSE_CATEGORIES[s][0]);
    if (!editing) setItems(previous => previous.map(item => ({
      ...item, category: EXPENSE_CATEGORIES[s].includes(item.category) ? item.category : EXPENSE_CATEGORIES[s][0],
    })));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const transactionDate = scope === 'daily' ? date : formMonth;
      let queued = false;
      if (editing) {
        if (!canManage) throw new Error('Hanya Supervisor / Owner yang dapat mengedit pengeluaran.');
        updateExpense(editing.id, { scope, date: transactionDate, category, amount: Number(amount), note }, editing);
      } else {
        const supplier = catalog?.suppliers?.find(option => option.id === supplierId);
        if (supplierId && !supplier) throw new Error('Supplier sudah berubah. Pilih kembali supplier yang tersedia.');
        const branch = catalog?.businessId ?? items.find(item => item.purchase)?.purchase?.businessId;
        const saved = addExpenseBatch(items.map(item => {
          const purchase = item.purchase;
          return {
            scope, date: transactionDate, category: item.category, amount: item.amount, note: item.note,
            fromDrawer: canUseDrawer && fromDrawer, createdBy: activeCashier.name,
            quantity: item.quantity ? Number(item.quantity) : undefined,
            ...(purchase && {
              pendingPurchase: { businessId: purchase.businessId, productId: purchase.product.id, itemUnitId: item.unit || undefined },
              productName: purchase.product.name,
              unitLabel: item.quantity ? purchase.product.units.find(option => option.id === item.unit)?.label ?? purchase.product.unitCode : undefined,
            }),
          };
        }), branch, supplier);
        queued = saved.some(expense => expense.pendingPurchase);
      }
      setMonth(transactionDate.slice(0, 7));
      setNotice({ type: 'success', msg: editing ? 'Pengeluaran diperbarui. Perubahan akan ikut sinkronisasi.'
        : queued ? 'Pengeluaran tersimpan di perangkat dan akan dikirim saat sinkronisasi.' : 'Pengeluaran tersimpan.' });
      resetForm();
    } catch (err: unknown) {
      setNotice({ type: 'error', msg: err instanceof Error ? err.message : 'Gagal menyimpan pengeluaran.' });
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

  const exportPdf = async () => {
    setExporting(true);
    try {
      await printExpenseReport({ branchName: getStoreSettings().storeName, period: formatMonthLabel(month),
        rows: [...monthly, ...dailyGroups.flatMap(([, rows]) => rows)] });
    } catch { setNotice({ type: 'error', msg: 'Pratinjau PDF belum berhasil dibuka. Silakan coba kembali.' }); }
    finally { setExporting(false); }
  };

  const ExpenseRow: React.FC<{ e: Expense }> = ({ e }) => (
    <div className="flex items-start justify-between gap-3 py-2">
      <div className="min-w-0">
        <div className="font-bold text-xs text-[#2C2420]">
          {e.productName || e.note || e.category}
          {e.fromDrawer && (
            <span className="ml-1.5 text-[9px] font-bold uppercase bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">
              Dari laci
            </span>
          )}
        </div>
        {(e.productName || e.note) && <div className="text-[11px] text-stone-600">
          {e.category}{e.quantity != null && ` · ${e.productName ? '' : 'Jumlah: '}${e.quantity.toLocaleString('id-ID', { maximumFractionDigits: 6 })}${e.unitLabel ? ` ${unitLabel(e.unitLabel)}` : ''}`}{e.supplierName && ` · ${e.supplierName}`}
        </div>}
        {e.productName && e.note && <div className="text-[11px] text-stone-600 break-words">{e.note}</div>}
        {e.pendingPurchase && <div className="text-[10px] text-amber-800">{e.purchaseSyncError ?? 'Menunggu sinkronisasi pengeluaran'}</div>}
        <div className="text-[10px] text-stone-400">oleh {e.createdBy}</div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="font-black text-xs text-rose-700">-{formatIDR(e.amount)}</span>
        {canManage && !e.pendingPurchase && (
          <button type="button" onClick={() => startEdit(e)} className="p-1 text-stone-400 hover:text-[#3E2723]" aria-label={`Edit pengeluaran ${e.category}`} title="Edit pengeluaran"><Pencil className="w-3.5 h-3.5" /></button>
        )}
        {canManage && !e.pendingPurchase && (
          <button
            disabled={!!e.purchaseLineId}
            onClick={() => handleDelete(e)}
            className="p-1 text-stone-400 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-30"
            title={e.purchaseLineId ? 'Pengeluaran terkait pembelian/stok tidak dapat dihapus dari sini.' : 'Hapus pengeluaran'}
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
          ref={formRef}
          onSubmit={handleSubmit}
          className="lg:col-span-5 bg-white border border-[#D7CCC8] p-3.5 rounded-lg shadow-sm space-y-3 h-fit"
        >
          <h3 className="font-extrabold text-xs text-[#3E2723] uppercase tracking-wider flex items-center gap-2 border-b border-[#EFEBE9] pb-2">
            {editing ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            <span>{editing ? 'Edit Pengeluaran' : 'Tambah Pengeluaran'}</span>
          </h3>

          {editing && <p className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">{financialLocked
            ? editing.purchaseLineId ? 'Terkait pembelian dan stok. Hanya kategori dan catatan yang dapat diperbaiki.' : 'Shift asal sudah ditutup atau tidak aktif di perangkat ini. Hanya kategori dan catatan yang dapat diperbaiki.'
            : editing.fromDrawer ? 'Koreksi nominal akan memperbarui pengeluaran laci pada shift aktif. Tanggal dan sumber dana tetap mengikuti catatan asal.' : 'Perbaiki isian lalu simpan perubahan. Sumber dana dan pencatat tetap dipertahankan.'}</p>}

          <div className="grid grid-cols-2 gap-2">
            {(['daily', 'monthly'] as ExpenseScope[]).map((s) => {
              const disabled = dateLocked || (s === 'monthly' && !canManage);
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
                <input type="date" disabled={dateLocked} value={date} max={today} onChange={(e) => setDate(e.target.value)} className={inputCls} required />
              ) : (
                <input type="month" disabled={dateLocked} value={formMonth} onChange={(e) => setFormMonth(e.target.value)} className={inputCls} required />
              )}
            </div>
            {editing ? <div>
              <label className="text-xs font-bold text-[#3E2723] block mb-1">Kategori</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>
                {!EXPENSE_CATEGORIES[scope].includes(category) && <option value={category}>{category}</option>}
                {EXPENSE_CATEGORIES[scope].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div> : <label className="block text-xs font-bold text-[#3E2723]">Supplier (opsional)
              <select value={supplierId} onChange={event => setSupplierId(event.target.value)} className={`mt-1 ${inputCls}`}>
                <option value="">Tanpa supplier</option>
                {catalog?.suppliers?.map(supplier => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
              </select>
            </label>}
          </div>

          {editing ? (
            <>
              {editing.productName && <p className="text-xs text-stone-600">Produk: {editing.productName}{editing.quantity != null && ` · ${editing.quantity} ${unitLabel(editing.unitLabel)}`}</p>}
              <fieldset disabled={financialLocked}>
                <label className="mb-1 block text-xs font-bold text-[#3E2723]">Nominal</label>
                <RupiahInput value={Number(amount) || 0} onChange={value => setAmount(String(value))}
                  className={inputCls.replace('px-3', 'pr-3')} aria-label="Nominal" required />
              </fieldset>
              <label className="block text-xs font-bold text-[#3E2723]">{editing.productName ? 'Catatan (opsional)' : 'Nama pembelian'}
                <input value={note} onChange={event => setNote(event.target.value)} maxLength={500} className={`mt-1 ${inputCls}`} />
              </label>
            </>
          ) : (
            <div className="space-y-3">
              {items.map((item, index) => {
                const product = item.purchase?.product;
                const listId = `pos-purchase-notes-${item.id}`;
                const suggestions = product ? [] : expenseNoteSuggestions(historicalNotes, item.note);
                return (
                  <section key={item.id} aria-label={`Item ${index + 1}`} className="space-y-2 rounded border border-[#EFEBE9] p-2.5">
                    {items.length > 1 && <div className="flex justify-between">
                      <span className="text-xs font-semibold text-stone-600">Item {index + 1}</span>
                      <button type="button" aria-label={`Hapus item ${index + 1}`}
                        onClick={() => setItems(previous => previous.filter(row => row.id !== item.id))}
                        className="text-rose-700"><Trash2 className="h-4 w-4" /></button>
                    </div>}
                    <ExpenseProductPicker inputClass={inputCls}
                      excludedIds={items.flatMap(row => row.id !== item.id && row.purchase ? [row.purchase.product.id] : [])}
                      onSelect={(selected, businessId, fallbackName) => changeItem(item.id, {
                        purchase: selected && businessId ? { product: selected, businessId } : null,
                        quantity: '', unit: '', note: item.note || fallbackName || '',
                      })} />
                    <div className="grid grid-cols-2 gap-2">
                      <label className="block text-xs font-bold text-[#3E2723]">Kategori
                        <select className={`mt-1 ${inputCls}`} value={item.category} onChange={event => changeItem(item.id, { category: event.target.value })}>
                          {EXPENSE_CATEGORIES[scope].map(option => <option key={option}>{option}</option>)}
                        </select>
                      </label>
                      <label className="block text-xs font-bold text-[#3E2723]">Nominal
                        <RupiahInput value={item.amount} onChange={value => changeItem(item.id, { amount: value })}
                          className={`mt-1 ${inputCls.replace('px-3', 'pr-3')} font-bold`} aria-label="Nominal" required />
                      </label>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="block text-xs font-bold text-[#3E2723]">Jumlah {(!product || product.stock < 0) && '(opsional)'}
                        <input className={`mt-1 ${inputCls}`} type="number" inputMode="decimal" value={item.quantity} required={!!product && product.stock >= 0}
                          min="0.000001" max="999999999" step="0.000001" onChange={event => changeItem(item.id, { quantity: event.target.value })} />
                      </label>
                      {product && <label className="block text-xs font-bold text-[#3E2723]">Satuan pembelian
                        <select className={`mt-1 ${inputCls}`} value={item.unit} onChange={event => changeItem(item.id, { unit: event.target.value })}>
                          <option value="">{unitLabel(product.unitCode)} (satuan dasar)</option>
                          {product.units.map(option => <option key={option.id} value={option.id}>
                            {unitLabel(option.label)}{option.factor !== 1 ? ` = ${option.factor} ${unitLabel(product.unitCode)}` : ''}
                          </option>)}
                        </select>
                      </label>}
                    </div>
                    <label className="block text-xs font-bold text-[#3E2723]">{product ? 'Catatan (opsional)' : 'Nama pembelian'}
                      <input value={item.note} onChange={event => changeItem(item.id, { note: event.target.value })}
                        list={!product ? listId : undefined} required={!product} maxLength={500}
                        placeholder={product ? undefined : 'Contoh: Pokcoy atau ongkir'} className={`mt-1 ${inputCls}`} />
                    </label>
                    {!product && <datalist id={listId}>{suggestions.map(suggestion => <option key={suggestion} value={suggestion} />)}</datalist>}
                  </section>
                );
              })}
              <div className="flex flex-wrap justify-between gap-2 text-sm">
                <button type="button" disabled={items.length >= 100}
                  onClick={() => { const item = newExpenseItem(nextItemId.current++, scope); setItems(previous => [...previous, item]); }}
                  className="inline-flex items-center gap-1 font-semibold text-[#5D4037] disabled:opacity-50">
                  <Plus className="h-4 w-4" /> Tambah Item
                </button>
                <strong>Total {formatIDR(items.reduce((sum, item) => sum + item.amount, 0))}</strong>
              </div>
            </div>
          )}

          {scope === 'daily' && (
            <label className={`flex items-start gap-2 text-xs ${canUseDrawer ? '' : 'opacity-50'}`}>
              <input
                type="checkbox"
                checked={editing ? fromDrawer : canUseDrawer && fromDrawer}
                disabled={!!editing || !canUseDrawer}
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
            {editing ? 'Simpan Perubahan' : 'Simpan Pengeluaran'}
          </button>
          {editing && <button type="button" onClick={resetForm} className="w-full rounded border border-[#D7CCC8] py-2 text-xs font-bold text-[#5D4037]">Batal Edit</button>}
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
            <div className="flex flex-wrap items-center gap-3 text-xs text-stone-600">
              <button type="button" disabled={exporting || dailyGroups.length + monthly.length === 0} onClick={exportPdf} title="Ekspor sesuai bulan dipilih. Pada dialog cetak, pilih Simpan sebagai PDF."
                className="inline-flex items-center gap-1.5 rounded border border-[#D7CCC8] bg-white px-2.5 py-1.5 text-xs font-bold text-[#5D4037] hover:bg-[#FAF8F6] disabled:opacity-40"><FileDown className="h-3.5 w-3.5" />{exporting ? 'Menyiapkan...' : 'Ekspor PDF'}</button>
              <span>
              Total {formatMonthLabel(month)}:{' '}
              <strong className="text-rose-700">{formatIDR(dailyTotal + monthlyTotal)}</strong>
              </span>
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
