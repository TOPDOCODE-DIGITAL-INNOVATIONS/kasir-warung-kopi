import React, { useEffect, useMemo, useState } from 'react';
import { Calculator, ChevronDown, ChevronUp, Copy, Check, AlertTriangle, CheckCircle2 } from 'lucide-react';
import {
  formatIDR,
  getAllShifts,
  getExpenses,
  getTransactions,
  POS_UPDATE_EVENT,
} from '../lib/storage';
import {
  CLOSING_METHODS,
  CLOSING_METHOD_LABELS,
  computeDailyClosing,
  dailyClosingToText,
} from '../lib/reports';

interface DailyClosingPanelProps {
  date: string; // YYYY-MM-DD
  storeName: string;
}

const Row: React.FC<{ label: React.ReactNode; value: number; sign?: '+' | '-'; tone?: string; bold?: boolean; hint?: string }> = ({
  label,
  value,
  sign,
  tone,
  bold,
  hint,
}) => (
  <div className={`flex justify-between gap-3 ${bold ? 'font-black' : ''}`}>
    <span className="text-stone-600">
      {label}
      {hint && <span className="text-[10px] text-stone-400 ml-1">{hint}</span>}
    </span>
    <span className={`whitespace-nowrap ${tone ?? ''}`}>
      {sign}
      {formatIDR(value)}
    </span>
  </div>
);

/** Rekap closing harian: rincian per metode bayar, pengeluaran, dan pencocokan uang laci. */
export const DailyClosingPanel: React.FC<DailyClosingPanelProps> = ({ date, storeName }) => {
  const [tick, setTick] = useState(0);
  const [open, setOpen] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const refresh = () => setTick((t) => t + 1);
    window.addEventListener(POS_UPDATE_EVENT, refresh);
    return () => window.removeEventListener(POS_UPDATE_EVENT, refresh);
  }, []);

  const c = useMemo(() => {
    // Termasuk shift & transaksi dari perangkat lain di cabang yang sama (hasil sync).
    return computeDailyClosing(date, getTransactions(), getExpenses(), getAllShifts());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, tick]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(dailyClosingToText(c, storeName, formatIDR));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard tidak tersedia */
    }
  };

  const balanced = c.shiftDifference === 0;
  const hasActivity = c.orders > 0 || c.cancelled > 0 || c.expenses.length > 0 || c.shifts.length > 0 || c.debtCollectedCash + c.debtCollectedNonCash > 0;

  return (
    <div className="bg-white border border-[#D7CCC8] rounded-lg shadow-sm overflow-hidden text-xs">
      <div className="p-3 bg-[#3E2723] text-white flex items-center justify-between gap-2">
        <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 font-extrabold uppercase tracking-tight text-left">
          <Calculator className="w-4 h-4 text-[#D7CCC8]" />
          <span>Rekap Closing Harian</span>
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        <button
          onClick={handleCopy}
          disabled={!hasActivity}
          className="flex items-center gap-1 px-2.5 py-1 rounded bg-white/10 hover:bg-white/20 font-bold disabled:opacity-40"
          title="Salin rekap untuk dikirim ke owner (WhatsApp)"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? 'Tersalin' : 'Salin Rekap'}
        </button>
      </div>

      {open &&
        (!hasActivity ? (
          <p className="p-4 text-center text-stone-500 italic">Tidak ada transaksi, pengeluaran, atau shift pada tanggal ini.</p>
        ) : (
          <div className="p-3 grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Pemasukan */}
            <div className="space-y-1.5">
              <div className="font-bold uppercase text-[11px] text-[#3E2723]">Pemasukan per Metode</div>
              {CLOSING_METHODS.map((m) => (
                <Row
                  key={m}
                  label={CLOSING_METHOD_LABELS[m]}
                  hint={c.byMethod[m].count ? `${c.byMethod[m].count} nota` : undefined}
                  value={c.byMethod[m].total}
                  tone={c.byMethod[m].total ? 'font-bold text-[#2C2420]' : 'text-stone-400'}
                />
              ))}
              {c.overpay > 0 && <Row label="Kelebihan (permen)" value={c.overpay} sign="+" tone="font-bold text-emerald-800" />}
              {c.debtCollectedCash > 0 && <Row label="Pelunasan bon (tunai)" value={c.debtCollectedCash} sign="+" tone="font-bold text-emerald-800" />}
              {c.debtCollectedNonCash > 0 && (
                <Row label="Pelunasan bon (non-tunai)" value={c.debtCollectedNonCash} sign="+" tone="font-bold text-blue-800" />
              )}
              {c.debtNew.count > 0 && (
                <Row label="Bon baru (belum dibayar)" hint={`${c.debtNew.count} nota`} value={c.debtNew.total} tone="text-amber-800" />
              )}
              <div className="pt-1.5 mt-1 border-t border-[#EFEBE9] space-y-1">
                <Row label="Total tunai masuk" value={c.cashIn} bold />
                <Row label="Total non-tunai masuk" value={c.nonCashIn} bold hint="cocokkan dgn mutasi QRIS/bank" />
                <Row label="Omset (nilai nota)" value={c.sales} hint={`${c.orders} nota${c.cancelled ? `, ${c.cancelled} batal` : ''}`} />
              </div>
            </div>

            {/* Pengeluaran */}
            <div className="space-y-1.5">
              <div className="font-bold uppercase text-[11px] text-[#3E2723]">Pengeluaran Harian</div>
              {c.expenses.length === 0 ? (
                <p className="text-stone-400 italic">Tidak ada pengeluaran.</p>
              ) : (
                c.expenses.map((e, i) => (
                  <Row
                    key={i}
                    label={
                      <>
                        {e.category}
                        {e.note && <span className="text-stone-400"> · {e.note}</span>}
                        {e.fromDrawer && <span className="ml-1 text-[9px] font-bold uppercase bg-rose-100 text-rose-800 px-1 rounded">laci</span>}
                      </>
                    }
                    value={e.amount}
                    sign="-"
                    tone="text-rose-700"
                  />
                ))
              )}
              <div className="pt-1.5 mt-1 border-t border-[#EFEBE9] space-y-1">
                <Row label="Dari laci" value={c.expensesDrawer} sign="-" tone="text-rose-700" />
                <Row label="Di luar laci" value={c.expensesOther} sign="-" tone="text-rose-700" />
                <Row label="Bersih hari ini" value={c.net} bold tone={c.net < 0 ? 'text-rose-700' : 'text-emerald-800'} hint="masuk - pengeluaran" />
              </div>
            </div>

            {/* Uang laci */}
            <div className="space-y-1.5 bg-[#FAF8F6] border border-[#D7CCC8] rounded p-2.5">
              <div className="font-bold uppercase text-[11px] text-[#3E2723]">Uang Tunai di Laci</div>
              <Row label="Modal awal" value={c.startingCash} />
              <Row label="Tunai masuk" value={c.cashIn} sign="+" tone="text-emerald-800" />
              <Row label="Pengeluaran dari laci" value={c.expensesDrawer} sign="-" tone="text-rose-700" />
              <Row label="Seharusnya ada" value={c.expectedCash} bold />

              {c.shifts.length > 0 && (
                <div className="pt-1.5 mt-1 border-t border-[#D7CCC8] space-y-1">
                  <div className="font-bold text-[10px] uppercase text-stone-500">Hitung fisik per shift</div>
                  {c.shifts.map((s) => (
                    <div key={s.id} className="flex justify-between gap-2">
                      <span className="text-stone-600">
                        {s.cashierName}{' '}
                        <span className="text-[10px] text-stone-400">
                          {new Date(s.startTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                          {s.endTime ? `–${new Date(s.endTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}` : ''}
                        </span>
                      </span>
                      {s.open ? (
                        <span className="text-amber-800 font-bold">masih buka</span>
                      ) : (
                        <span className={`font-bold whitespace-nowrap ${s.difference === 0 ? 'text-emerald-800' : 'text-rose-700'}`}>
                          {formatIDR(s.actualCash ?? 0)} ({(s.difference ?? 0) >= 0 ? '+' : ''}
                          {formatIDR(s.difference ?? 0)})
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {c.hasOpenShift ? (
                <p className="mt-1.5 p-2 rounded bg-amber-50 border border-amber-200 text-amber-900 flex gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  Shift masih terbuka. Tutup shift dan hitung uang fisik untuk mencocokkan laci.
                </p>
              ) : c.shiftDifference !== null ? (
                <p
                  className={`mt-1.5 p-2 rounded border flex gap-1.5 font-bold ${
                    balanced ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-rose-50 border-rose-200 text-rose-900'
                  }`}
                >
                  {balanced ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" /> : <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
                  {balanced
                    ? 'Uang laci BALANCE.'
                    : `Selisih ${c.shiftDifference > 0 ? 'lebih' : 'kurang'} ${formatIDR(Math.abs(c.shiftDifference))}. Cek ulang uang fisik, kembalian permen, & pengeluaran laci.`}
                </p>
              ) : (
                <p className="mt-1.5 text-[10px] text-stone-500">Tidak ada shift yang dibuka pada tanggal ini.</p>
              )}
            </div>
          </div>
        ))}
    </div>
  );
};
