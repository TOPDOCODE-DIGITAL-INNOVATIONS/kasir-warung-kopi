import React, { useState, useEffect, useMemo } from 'react';
import {
  BarChart3,
  CreditCard,
  Download,
  Upload,
  RefreshCw,
  Award,
  Database,
  Clock,
  CalendarRange,
  BookOpen,
} from 'lucide-react';
import { Cashier, Expense, Shift, Transaction } from '../types';
import {
  getTransactions,
  getShiftHistory,
  formatIDR,
  exportDataAsJSON,
  importDataFromJSON,
  resetDataToDefaults,
  generatePostgresSqlScript,
  performCloudSync,
  getUnsyncedCount,
  getExpenses,
  POS_UPDATE_EVENT,
} from '../lib/storage';
import {
  DateRangePreset,
  computeSalesReport,
  computeMonthlyRecap,
  getExpectedDrawerCash,
  monthlyRecapToTSV,
  toMonthKey,
  isInRange,
  resolveDateRange,
  toLocalDateKey,
} from '../lib/reports';
import { can } from '../lib/permissions';

interface ReportsScreenProps {
  activeCashier: Cashier;
}

const PRESETS: { id: DateRangePreset; label: string }[] = [
  { id: 'today', label: 'Hari Ini' },
  { id: 'yesterday', label: 'Kemarin' },
  { id: '7d', label: '7 Hari' },
  { id: '30d', label: '30 Hari' },
  { id: 'month', label: 'Bulan Ini' },
  { id: 'all', label: 'Semua' },
  { id: 'custom', label: 'Pilih Tanggal' },
];

function downloadFile(content: string, type: string, filename: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const ReportsScreen: React.FC<ReportsScreenProps> = ({ activeCashier }) => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [shiftHistory, setShiftHistory] = useState<Shift[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [recapMonth, setRecapMonth] = useState<string>(toMonthKey(new Date()));
  const [unsyncedCount, setUnsyncedCount] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const today = toLocalDateKey(new Date());
  const [preset, setPreset] = useState<DateRangePreset>('today');
  const [customStart, setCustomStart] = useState<string>(today);
  const [customEnd, setCustomEnd] = useState<string>(today);

  const isOwner = can(activeCashier.role, 'dataAdmin');

  const loadData = () => {
    setTransactions(getTransactions());
    setShiftHistory(getShiftHistory());
    setExpenses(getExpenses());
    setUnsyncedCount(getUnsyncedCount());
  };

  useEffect(() => {
    loadData();
    window.addEventListener(POS_UPDATE_EVENT, loadData);
    return () => window.removeEventListener(POS_UPDATE_EVENT, loadData);
  }, []);

  const range = useMemo(
    () => resolveDateRange(preset, new Date(), customStart, customEnd),
    [preset, customStart, customEnd]
  );

  const report = useMemo(
    () => computeSalesReport(transactions.filter((t) => isInRange(t.timestamp, range))),
    [transactions, range]
  );

  const cancelledCount = transactions.filter(
    (t) => t.status === 'cancelled' && isInRange(t.timestamp, range)
  ).length;

  const shiftsInRange = shiftHistory.filter((s) => isInRange(s.startTime, range));

  const recap = useMemo(
    () => computeMonthlyRecap(recapMonth, transactions, expenses),
    [recapMonth, transactions, expenses]
  );

  const handleExportRecap = () => {
    downloadFile(monthlyRecapToTSV(recap), 'text/plain;charset=utf-8', `rekap_${recapMonth}.txt`);
  };

  const handleCopyRecap = async () => {
    try {
      await navigator.clipboard.writeText(monthlyRecapToTSV(recap));
      setNotice({ type: 'success', msg: 'Rekap disalin. Tempel (paste) langsung ke Excel / Google Sheets.' });
    } catch {
      setNotice({ type: 'error', msg: 'Gagal menyalin. Gunakan tombol Download.' });
    }
  };

  const marginPct = report.revenueExTax > 0 ? (report.grossProfit / report.revenueExTax) * 100 : 0;

  // Backup & Export Handlers
  const dateSuffix = toLocalDateKey(new Date());

  const handleExportBackup = () => {
    downloadFile(exportDataAsJSON(), 'application/json', `backup_warkop_pos_${dateSuffix}.json`);
  };

  const handleExportPostgresSql = () => {
    downloadFile(
      generatePostgresSqlScript(),
      'text/plain;charset=utf-8',
      `warkop_pos_postgres_dump_${dateSuffix}.sql`
    );
  };

  const handleSyncNow = async () => {
    setIsSyncing(true);
    const res = await performCloudSync();
    setIsSyncing(false);
    setNotice({ type: res.success ? 'success' : 'error', msg: res.message });
    loadData();
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (!content) return;
      if (confirm('Import data backup? Data lokal saat ini akan ditimpa.')) {
        const res = importDataFromJSON(content);
        if (res.ok) {
          window.location.reload();
        } else {
          setNotice({ type: 'error', msg: res.message });
        }
      }
    };
    reader.readAsText(file);
  };

  const handleResetData = () => {
    if (
      confirm(
        'Yakin ingin mereset SELURUH data (transaksi, shift, menu, kasir) ke data contoh? Tindakan ini tidak bisa dibatalkan. Disarankan Export JSON dulu.'
      )
    ) {
      resetDataToDefaults();
      window.location.reload();
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-3 sm:p-6 space-y-4 text-[#2C2420]">
      {/* Header Bar */}
      <div className="bg-white border border-[#D7CCC8] p-3.5 rounded-lg flex flex-wrap items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-[#EFEBE9] text-[#3E2723] rounded border border-[#D7CCC8]">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-extrabold text-sm sm:text-base text-[#3E2723] uppercase tracking-tight">
              Laporan Penjualan
            </h2>
            <p className="text-xs text-stone-500">Omset, laba kotor, piutang, dan rekap shift</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleSyncNow}
            disabled={isSyncing}
            className="py-1.5 px-3 bg-[#EFEBE9] hover:bg-[#D7CCC8] text-[#3E2723] border border-[#D7CCC8] font-bold rounded text-xs flex items-center gap-1.5 transition-all uppercase shadow-xs disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>Sync {unsyncedCount > 0 ? `(${unsyncedCount})` : ''}</span>
          </button>

          {isOwner && (
            <>
              <button
                onClick={handleExportPostgresSql}
                className="py-1.5 px-3 bg-emerald-800 hover:bg-emerald-900 text-white font-bold rounded text-xs flex items-center gap-1.5 transition-all uppercase shadow"
                title="Download Script SQL PostgreSQL (Tabel & Insert Data)"
              >
                <Database className="w-3.5 h-3.5" />
                <span>Export SQL</span>
              </button>

              <button
                onClick={handleExportBackup}
                className="py-1.5 px-3 bg-[#3E2723] hover:bg-[#5D4037] text-white font-bold rounded text-xs flex items-center gap-1.5 transition-all uppercase shadow"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export JSON</span>
              </button>

              <label className="py-1.5 px-3 bg-stone-100 hover:bg-stone-200 text-[#2C2420] border border-[#D7CCC8] font-bold rounded text-xs flex items-center gap-1.5 cursor-pointer transition-all uppercase">
                <Upload className="w-3.5 h-3.5" />
                <span>Import</span>
                <input type="file" accept=".json,application/json" onChange={handleImportBackup} className="hidden" />
              </label>
            </>
          )}
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

      {/* Date Range Filter */}
      <div className="bg-white border border-[#D7CCC8] p-3 rounded-lg shadow-sm flex flex-wrap items-center gap-2">
        <CalendarRange className="w-4 h-4 text-[#3E2723]" />
        {PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => setPreset(p.id)}
            className={`px-3 py-1.5 rounded text-xs font-bold transition-all ${
              preset === p.id
                ? 'bg-[#3E2723] text-white'
                : 'bg-[#F9F8F7] text-[#5D4037] border border-[#D7CCC8] hover:bg-stone-100'
            }`}
          >
            {p.label}
          </button>
        ))}
        {preset === 'custom' && (
          <div className="flex items-center gap-1.5 text-xs">
            <input
              type="date"
              value={customStart}
              max={customEnd || undefined}
              onChange={(e) => setCustomStart(e.target.value)}
              className="bg-white border border-[#D7CCC8] rounded px-2 py-1"
            />
            <span>s/d</span>
            <input
              type="date"
              value={customEnd}
              min={customStart || undefined}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="bg-white border border-[#D7CCC8] rounded px-2 py-1"
            />
          </div>
        )}
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white border border-[#D7CCC8] p-3.5 rounded-lg space-y-1 shadow-sm">
          <div className="text-xs text-stone-500 font-bold uppercase tracking-wider">Omset Bersih</div>
          <div className="text-xl sm:text-2xl font-black text-[#3E2723]">{formatIDR(report.netSales)}</div>
          <div className="text-[10px] text-stone-500 font-medium">
            Kotor {formatIDR(report.grossSales)} · Diskon -{formatIDR(report.discounts)} · Pajak{' '}
            {formatIDR(report.tax)}
          </div>
          {report.overpay > 0 && (
            <div className="text-[10px] text-emerald-800 font-semibold">
              + Kelebihan (kembalian permen) {formatIDR(report.overpay)}
            </div>
          )}
        </div>

        <div className="bg-white border border-[#D7CCC8] p-3.5 rounded-lg space-y-1 shadow-sm">
          <div className="text-xs text-stone-500 font-bold uppercase tracking-wider">Laba Kotor</div>
          <div
            className={`text-xl sm:text-2xl font-black ${
              report.grossProfit >= 0 ? 'text-emerald-800' : 'text-rose-700'
            }`}
          >
            {formatIDR(report.grossProfit)}
          </div>
          <div className="text-[10px] text-stone-500 font-medium">
            Modal (HPP) {formatIDR(report.cogs)} · Margin {marginPct.toFixed(1)}%
          </div>
          {report.itemsWithoutCost > 0 && (
            <div className="text-[10px] text-amber-800 font-semibold">
              {report.itemsWithoutCost} porsi tanpa harga modal (dihitung modal 0)
            </div>
          )}
        </div>

        <div className="bg-white border border-[#D7CCC8] p-3.5 rounded-lg space-y-1 shadow-sm">
          <div className="text-xs text-stone-500 font-bold uppercase tracking-wider">Transaksi</div>
          <div className="text-xl sm:text-2xl font-black text-[#3E2723]">{report.orders} Nota</div>
          <div className="text-[10px] text-stone-500 font-medium">
            Rata-rata {formatIDR(Math.round(report.avgTicket))} · {cancelledCount} dibatalkan
          </div>
        </div>

        <div className="bg-white border border-[#D7CCC8] p-3.5 rounded-lg space-y-1 shadow-sm">
          <div className="text-xs text-stone-500 font-bold uppercase tracking-wider">Bon Belum Lunas</div>
          <div className="text-xl sm:text-2xl font-black text-amber-800">{formatIDR(report.outstandingDebt)}</div>
          <div className="text-[10px] text-stone-500 font-medium">
            Bon pada periode ini yang belum dibayar
          </div>
        </div>
      </div>

      {/* Analytics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        <div className="md:col-span-6 bg-white border border-[#D7CCC8] p-3.5 rounded-lg space-y-3 shadow-sm">
          <h3 className="font-extrabold text-xs text-[#3E2723] uppercase tracking-wider flex items-center gap-2 border-b border-[#EFEBE9] pb-2">
            <CreditCard className="w-4 h-4 text-[#3E2723]" />
            <span>Metode Pembayaran</span>
          </h3>

          <div className="space-y-2">
            {Object.keys(report.paymentBreakdown).length === 0 ? (
              <p className="text-xs text-stone-500 italic p-4 text-center">Belum ada transaksi pada periode ini</p>
            ) : (
              Object.entries(report.paymentBreakdown).map(([pt, data]) => (
                <div
                  key={pt}
                  className="p-2.5 bg-[#FAF8F6] rounded border border-[#D7CCC8] flex items-center justify-between"
                >
                  <div>
                    <span className="font-extrabold text-xs text-[#3E2723] uppercase">{pt}</span>
                    <div className="text-[10px] text-stone-500 font-medium">{data.count} Transaksi</div>
                  </div>
                  <div className="font-black text-xs text-[#2C2420]">{formatIDR(data.total)}</div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="md:col-span-6 bg-white border border-[#D7CCC8] p-3.5 rounded-lg space-y-3 shadow-sm">
          <h3 className="font-extrabold text-xs text-[#3E2723] uppercase tracking-wider flex items-center gap-2 border-b border-[#EFEBE9] pb-2">
            <Award className="w-4 h-4 text-[#3E2723]" />
            <span>Top 5 Menu Terlaris</span>
          </h3>

          <div className="space-y-2">
            {report.topProducts.length === 0 ? (
              <p className="text-xs text-stone-500 italic p-4 text-center">Belum ada data penjualan</p>
            ) : (
              report.topProducts.map((p, idx) => (
                <div
                  key={p.name}
                  className="p-2.5 bg-[#FAF8F6] rounded border border-[#D7CCC8] flex items-center justify-between"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-6 h-6 rounded-full bg-[#3E2723] text-white font-black text-[10px] flex items-center justify-center">
                      #{idx + 1}
                    </div>
                    <div>
                      <div className="font-bold text-xs text-[#2C2420]">{p.name}</div>
                      <div className="text-[10px] text-stone-500">{p.qty} porsi terjual</div>
                    </div>
                  </div>

                  <div className="font-black text-xs text-[#3E2723]">{formatIDR(p.revenue)}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Rekap Bulanan */}
      <div className="bg-white border border-[#D7CCC8] rounded-lg shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#EFEBE9] p-3.5 pb-2">
          <h3 className="font-extrabold text-xs text-[#3E2723] uppercase tracking-wider flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-[#3E2723]" />
            <span>Rekap Bulanan (Buku Kas)</span>
          </h3>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="month"
              value={recapMonth}
              onChange={(e) => e.target.value && setRecapMonth(e.target.value)}
              className="bg-white border border-[#D7CCC8] rounded px-2 py-1 text-xs"
            />
            <button
              onClick={handleCopyRecap}
              className="py-1 px-2.5 bg-[#EFEBE9] hover:bg-[#D7CCC8] text-[#3E2723] border border-[#D7CCC8] font-bold rounded text-[11px] uppercase"
            >
              Salin
            </button>
            <button
              onClick={handleExportRecap}
              className="py-1 px-2.5 bg-[#3E2723] hover:bg-[#5D4037] text-white font-bold rounded text-[11px] uppercase flex items-center gap-1"
            >
              <Download className="w-3 h-3" /> Download
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F9F8F7] text-[#3E2723] font-bold uppercase tracking-wider border-b border-[#D7CCC8]">
              <tr>
                <th className="p-2.5">Tanggal</th>
                <th className="p-2.5 text-right">Cash</th>
                <th className="p-2.5 text-right">QRIS / Non-Tunai</th>
                <th className="p-2.5 text-right">Penjualan</th>
                <th className="p-2.5 text-right">Kelebihan</th>
                <th className="p-2.5 text-right">Pengeluaran</th>
                <th className="p-2.5 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EFEBE9]">
              {recap.days.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-stone-500 italic">
                    Bulan ini belum berjalan
                  </td>
                </tr>
              ) : (
                recap.days.map((r) => (
                  <tr key={r.date} className={`hover:bg-stone-50 ${r.sales === 0 && r.overpay === 0 && r.expenses === 0 ? 'text-stone-400' : ''}`}>
                    <td className="p-2.5 whitespace-nowrap font-semibold">
                      {new Date(r.date + 'T00:00:00').toLocaleDateString('id-ID', { weekday: 'short', day: '2-digit', month: 'short' })}
                    </td>
                    <td className="p-2.5 text-right">{formatIDR(r.cash)}</td>
                    <td className="p-2.5 text-right">{formatIDR(r.nonCash)}</td>
                    <td className="p-2.5 text-right font-bold">{formatIDR(r.sales)}</td>
                    <td className="p-2.5 text-right text-emerald-800">{formatIDR(r.overpay)}</td>
                    <td className="p-2.5 text-right text-rose-700">{r.expenses ? `-${formatIDR(r.expenses)}` : formatIDR(0)}</td>
                    <td className={`p-2.5 text-right font-black ${r.total < 0 ? 'text-rose-700' : 'text-[#3E2723]'}`}>
                      {formatIDR(r.total)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot className="bg-[#F9F8F7] font-black text-[#3E2723] border-t-2 border-[#D7CCC8]">
              <tr>
                <td className="p-2.5">TOTAL</td>
                <td className="p-2.5 text-right">{formatIDR(recap.totalCash)}</td>
                <td className="p-2.5 text-right">{formatIDR(recap.totalNonCash)}</td>
                <td className="p-2.5 text-right">{formatIDR(recap.totalSales)}</td>
                <td className="p-2.5 text-right text-emerald-800">{formatIDR(recap.totalOverpay)}</td>
                <td className="p-2.5 text-right text-rose-700">-{formatIDR(recap.totalDailyExpenses)}</td>
                <td className="p-2.5 text-right">{formatIDR(recap.totalAfterDaily)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="p-3.5 border-t border-[#EFEBE9] grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="space-y-1">
            <div className="font-bold text-[#3E2723] uppercase text-[11px]">Pengeluaran Bulanan (Global)</div>
            {recap.monthlyExpenses.length === 0 ? (
              <p className="text-stone-500 italic">Belum ada. Catat di tab Pengeluaran → Bulanan.</p>
            ) : (
              recap.monthlyExpenses.map((e) => (
                <div key={e.id} className="flex justify-between">
                  <span>
                    {e.category}
                    {e.note ? <span className="text-stone-500"> · {e.note}</span> : null}
                  </span>
                  <span className="text-rose-700 font-bold">-{formatIDR(e.amount)}</span>
                </div>
              ))
            )}
          </div>
          <div className="bg-[#FAF8F6] border border-[#D7CCC8] rounded p-2.5 space-y-1">
            <div className="flex justify-between">
              <span>Total setelah pengeluaran harian</span>
              <span className="font-bold">{formatIDR(recap.totalAfterDaily)}</span>
            </div>
            <div className="flex justify-between">
              <span>Pengeluaran bulanan</span>
              <span className="font-bold text-rose-700">-{formatIDR(recap.totalMonthlyExpenses)}</span>
            </div>
            <div className="flex justify-between font-black text-sm pt-1 border-t border-[#D7CCC8]">
              <span>Laba Bersih</span>
              <span className={recap.netProfit >= 0 ? 'text-emerald-800' : 'text-rose-700'}>{formatIDR(recap.netProfit)}</span>
            </div>
            {recap.unpaidDebt > 0 && (
              <div className="text-[10px] text-amber-800">
                + Bon belum lunas {formatIDR(recap.unpaidDebt)} (belum dihitung sampai dibayar)
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Shift History */}
      <div className="bg-white border border-[#D7CCC8] rounded-lg shadow-sm overflow-hidden">
        <h3 className="font-extrabold text-xs text-[#3E2723] uppercase tracking-wider flex items-center gap-2 border-b border-[#EFEBE9] p-3.5 pb-2">
          <Clock className="w-4 h-4 text-[#3E2723]" />
          <span>Riwayat Shift (Tutup Kas)</span>
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F9F8F7] text-[#3E2723] font-bold uppercase tracking-wider border-b border-[#D7CCC8]">
              <tr>
                <th className="p-3">Kasir</th>
                <th className="p-3">Mulai – Selesai</th>
                <th className="p-3 text-right">Nota</th>
                <th className="p-3 text-right">Tunai</th>
                <th className="p-3 text-right">Non-Tunai</th>
                <th className="p-3 text-right">Bon</th>
                <th className="p-3 text-right">Seharusnya</th>
                <th className="p-3 text-right">Fisik</th>
                <th className="p-3 text-right">Selisih</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EFEBE9]">
              {shiftsInRange.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-6 text-center text-stone-500 italic">
                    Belum ada shift yang ditutup pada periode ini
                  </td>
                </tr>
              ) : (
                shiftsInRange.map((s) => {
                  const expected =
                    s.expectedCash ?? getExpectedDrawerCash(s);
                  const actual = s.endingCashActual ?? 0;
                  const diff = actual - expected;
                  const fmtTime = (iso?: string) =>
                    iso
                      ? new Date(iso).toLocaleString('id-ID', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : '-';
                  return (
                    <tr key={s.id} className="hover:bg-stone-50">
                      <td className="p-3 font-bold">{s.cashierName}</td>
                      <td className="p-3 text-stone-600 whitespace-nowrap">
                        {fmtTime(s.startTime)} – {fmtTime(s.endTime)}
                      </td>
                      <td className="p-3 text-right">{s.totalTransactions}</td>
                      <td className="p-3 text-right">
                        {formatIDR(s.totalSalesCash + (s.debtCollectedCash ?? 0))}
                      </td>
                      <td className="p-3 text-right">
                        {formatIDR(s.totalSalesNonCash + (s.debtCollectedNonCash ?? 0))}
                      </td>
                      <td className="p-3 text-right">{formatIDR(s.totalSalesDebt ?? 0)}</td>
                      <td className="p-3 text-right">{formatIDR(expected)}</td>
                      <td className="p-3 text-right">{formatIDR(actual)}</td>
                      <td
                        className={`p-3 text-right font-black ${
                          diff === 0 ? 'text-emerald-700' : diff > 0 ? 'text-blue-700' : 'text-rose-700'
                        }`}
                      >
                        {diff === 0 ? 'Cocok' : `${diff > 0 ? '+' : '-'}${formatIDR(Math.abs(diff))}`}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Danger Zone: Reset Data (Owner only) */}
      {isOwner && (
        <div className="bg-[#FAF8F6] border border-[#D7CCC8] p-3.5 rounded-lg flex items-center justify-between gap-3">
          <div>
            <h4 className="font-bold text-xs text-rose-800 uppercase tracking-tight">Reset System Data</h4>
            <p className="text-[10px] text-stone-500">
              Menghapus semua transaksi & shift, lalu mengembalikan menu dan kasir ke data contoh.
            </p>
          </div>

          <button
            onClick={handleResetData}
            className="py-1.5 px-3 bg-rose-700 hover:bg-rose-800 text-white font-bold rounded text-xs uppercase shadow transition-all shrink-0"
          >
            Reset Data Awal
          </button>
        </div>
      )}
    </div>
  );
};
