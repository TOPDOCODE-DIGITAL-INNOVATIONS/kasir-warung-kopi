import React, { useState, useEffect } from 'react';
import { Search, Receipt, Filter, Eye, XCircle, CheckCircle2, HandCoins, Lock } from 'lucide-react';
import { Transaction, StoreSettings, Cashier } from '../types';
import {
  getTransactions,
  getCashiers,
  cancelTransaction,
  payDebt,
  formatIDR,
  POS_UPDATE_EVENT,
} from '../lib/storage';
import { verifyPin } from '../lib/security';
import { can } from '../lib/permissions';
import { ReceiptModal } from './POS/ReceiptModal';
import { DailyClosingPanel } from './DailyClosingPanel';
import { toLocalDateKey } from '../lib/reports';

interface TransactionsHistoryProps {
  storeSettings: StoreSettings;
  activeCashier: Cashier;
}

export const TransactionsHistory: React.FC<TransactionsHistoryProps> = ({
  storeSettings,
  activeCashier,
}) => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPaymentFilter, setSelectedPaymentFilter] = useState<string>('all');
  const [selectedOrderTypeFilter, setSelectedOrderTypeFilter] = useState<string>('all');
  // Tanggal untuk rekap closing & filter tabel ('' = semua tanggal)
  const [dateFilter, setDateFilter] = useState<string>(() => toLocalDateKey(new Date()));
  const [selectedTxForReceipt, setSelectedTxForReceipt] = useState<Transaction | null>(null);

  // Cancellation modal state
  const [txToCancel, setTxToCancel] = useState<Transaction | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [approverPin, setApproverPin] = useState('');
  const [cancelError, setCancelError] = useState('');

  // Debt payment modal state
  const [txToPay, setTxToPay] = useState<Transaction | null>(null);
  const [payMethod, setPayMethod] = useState<'tunai' | 'nontunai'>('tunai');

  const [notice, setNotice] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const refreshData = () => {
    setTransactions(getTransactions());
  };

  useEffect(() => {
    refreshData();
    window.addEventListener(POS_UPDATE_EVENT, refreshData);
    return () => window.removeEventListener(POS_UPDATE_EVENT, refreshData);
  }, []);

  const isUnpaidDebt = (tx: Transaction) =>
    tx.status === 'completed' && tx.paymentType === 'hutang' && tx.debtStatus !== 'paid';

  const outstandingDebtTotal = transactions.filter(isUnpaidDebt).reduce((sum, t) => sum + t.grandTotal, 0);

  // Filter logic
  const filteredTransactions = transactions.filter((tx) => {
    const matchesSearch =
      tx.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (tx.customerName && tx.customerName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      tx.cashierName.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesPayment =
      selectedPaymentFilter === 'all' ||
      (selectedPaymentFilter === 'bon_unpaid' ? isUnpaidDebt(tx) : tx.paymentType === selectedPaymentFilter);

    const matchesOrderType =
      selectedOrderTypeFilter === 'all' || tx.orderType === selectedOrderTypeFilter;

    // Bon belum lunas selalu ditampilkan dari semua tanggal
    const matchesDate =
      !dateFilter || selectedPaymentFilter === 'bon_unpaid' || toLocalDateKey(new Date(tx.timestamp)) === dateFilter;

    return matchesSearch && matchesPayment && matchesOrderType && matchesDate;
  });

  const totalRevenue = filteredTransactions
    .filter((t) => t.status === 'completed')
    .reduce((sum, t) => sum + t.grandTotal, 0);

  const closeCancelDialog = () => {
    setTxToCancel(null);
    setCancelReason('');
    setApproverPin('');
    setCancelError('');
  };

  const handleConfirmCancel = () => {
    if (!txToCancel) return;
    if (!cancelReason.trim()) {
      setCancelError('Mohon isi alasan pembatalan transaksi.');
      return;
    }

    // Wajib persetujuan PIN Supervisor/Owner
    const approver = getCashiers().find(
      (c) => can(c.role, 'cancelTransaction') && verifyPin(c, approverPin)
    );
    if (!approver) {
      setCancelError('PIN Supervisor/Owner salah.');
      return;
    }

    const res = cancelTransaction(txToCancel.id, cancelReason.trim(), approver.name);
    if (!res.ok) {
      setCancelError(res.message);
      return;
    }
    closeCancelDialog();
    setNotice({ type: 'success', msg: res.message });
    refreshData();
  };

  const handleConfirmPayDebt = () => {
    if (!txToPay) return;
    const res = payDebt(txToPay.id, payMethod);
    setTxToPay(null);
    setNotice({ type: res.ok ? 'success' : 'error', msg: res.message });
    refreshData();
  };

  return (
    <div className="max-w-7xl mx-auto p-3 sm:p-6 space-y-4 text-[#2C2420]">
      {notice && (
        <div
          className={`p-2.5 rounded text-xs font-semibold border flex justify-between gap-3 ${
            notice.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
              : 'bg-rose-50 text-rose-900 border-rose-300'
          }`}
        >
          <span>{notice.msg}</span>
          <button onClick={() => setNotice(null)} className="font-bold">
            ×
          </button>
        </div>
      )}

      {/* Pilih tanggal + rekap closing harian */}
      <div className="bg-white border border-[#D7CCC8] p-3 rounded-lg flex flex-wrap items-center gap-2 shadow-sm text-xs">
        <span className="font-bold text-[#3E2723] uppercase">Tanggal:</span>
        <input
          type="date"
          value={dateFilter}
          max={toLocalDateKey(new Date())}
          onChange={(e) => setDateFilter(e.target.value)}
          className="bg-[#F9F8F7] border border-[#D7CCC8] rounded px-2 py-1.5 font-bold focus:outline-none focus:border-[#3E2723]"
        />
        <button
          onClick={() => setDateFilter(toLocalDateKey(new Date()))}
          className="px-2.5 py-1.5 rounded border border-[#D7CCC8] font-bold hover:bg-stone-100"
        >
          Hari Ini
        </button>
        <button
          onClick={() => {
            const d = new Date();
            d.setDate(d.getDate() - 1);
            setDateFilter(toLocalDateKey(d));
          }}
          className="px-2.5 py-1.5 rounded border border-[#D7CCC8] font-bold hover:bg-stone-100"
        >
          Kemarin
        </button>
        <button
          onClick={() => setDateFilter('')}
          className={`px-2.5 py-1.5 rounded border font-bold ${
            dateFilter ? 'border-[#D7CCC8] hover:bg-stone-100' : 'bg-[#3E2723] text-white border-[#3E2723]'
          }`}
        >
          Semua Tanggal
        </button>
      </div>

      {dateFilter && <DailyClosingPanel date={dateFilter} storeName={storeSettings.storeName} />}

      {/* Top Banner Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white border border-[#D7CCC8] p-3.5 rounded-lg flex items-center justify-between shadow-sm">
          <div>
            <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Total Omset Terfilter</div>
            <div className="text-xl sm:text-2xl font-black text-[#3E2723]">
              {formatIDR(totalRevenue)}
            </div>
          </div>
          <div className="p-2.5 bg-[#EFEBE9] text-[#3E2723] rounded border border-[#D7CCC8]">
            <Receipt className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-[#D7CCC8] p-3.5 rounded-lg flex items-center justify-between shadow-sm">
          <div>
            <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Jumlah Transaksi</div>
            <div className="text-xl sm:text-2xl font-black text-[#3E2723]">
              {filteredTransactions.filter((t) => t.status === 'completed').length} Nota
            </div>
          </div>
          <div className="p-2.5 bg-emerald-50 text-emerald-800 rounded border border-emerald-200">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-[#D7CCC8] p-3.5 rounded-lg flex items-center justify-between shadow-sm">
          <div>
            <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Dibatalkan / Refund</div>
            <div className="text-xl sm:text-2xl font-black text-rose-800">
              {filteredTransactions.filter((t) => t.status === 'cancelled').length} Nota
            </div>
          </div>
          <div className="p-2.5 bg-rose-50 text-rose-800 rounded border border-rose-200">
            <XCircle className="w-5 h-5" />
          </div>
        </div>

        <button
          onClick={() => setSelectedPaymentFilter('bon_unpaid')}
          className="bg-white border border-[#D7CCC8] p-3.5 rounded-lg flex items-center justify-between shadow-sm text-left hover:bg-amber-50"
          title="Tampilkan bon yang belum lunas"
        >
          <div>
            <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Piutang Bon Belum Lunas</div>
            <div className="text-xl sm:text-2xl font-black text-amber-800">{formatIDR(outstandingDebtTotal)}</div>
          </div>
          <div className="p-2.5 bg-amber-50 text-amber-800 rounded border border-amber-200">
            <HandCoins className="w-5 h-5" />
          </div>
        </button>
      </div>

      {/* Controls & Filter Bar */}
      <div className="bg-white border border-[#D7CCC8] p-3 rounded-lg flex flex-wrap items-center justify-between gap-3 shadow-sm">
        {/* Search */}
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-stone-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Cari No. Struk, Nama Pelanggan, atau Kasir..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-[#F9F8F7] border border-[#D7CCC8] text-[#2C2420] rounded pl-9 pr-3 py-1.5 text-xs focus:outline-none focus:border-[#3E2723]"
          />
        </div>

        {/* Payment Filter */}
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-stone-500 shrink-0" />
          <select
            value={selectedPaymentFilter}
            onChange={(e) => setSelectedPaymentFilter(e.target.value)}
            className="bg-[#F9F8F7] border border-[#D7CCC8] text-[#2C2420] rounded px-3 py-1.5 text-xs focus:outline-none focus:border-[#3E2723] font-bold uppercase"
          >
            <option value="all">Semua Pembayaran</option>
            <option value="tunai">Tunai / Cash</option>
            <option value="qris">QRIS Statis</option>
            <option value="transfer">Transfer Bank</option>
            <option value="ewallet">E-Wallet</option>
            <option value="hutang">Bon / Hutang (semua)</option>
            <option value="bon_unpaid">Bon Belum Lunas</option>
            <option value="debit">EDC Debit</option>
          </select>
        </div>

        {/* Order Type Filter */}
        <div>
          <select
            value={selectedOrderTypeFilter}
            onChange={(e) => setSelectedOrderTypeFilter(e.target.value)}
            className="bg-[#F9F8F7] border border-[#D7CCC8] text-[#2C2420] rounded px-3 py-1.5 text-xs focus:outline-none focus:border-[#3E2723] font-bold uppercase"
          >
            <option value="all">Semua Tipe Order</option>
            <option value="Dine In">Dine In</option>
            <option value="Takeaway">Takeaway</option>
            <option value="Online / Ojol">Online / Ojol</option>
          </select>
        </div>
      </div>

      {/* Transactions Table / Cards */}
      <div className="bg-white border border-[#D7CCC8] rounded-lg overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-[#2C2420]">
            <thead className="bg-[#F9F8F7] text-[#3E2723] font-bold uppercase tracking-wider border-b border-[#D7CCC8]">
              <tr>
                <th className="p-3">No. Struk</th>
                <th className="p-3">Waktu</th>
                <th className="p-3">Pelanggan & Order</th>
                <th className="p-3">Kasir</th>
                <th className="p-3">Pembayaran</th>
                <th className="p-3">Total Tagihan</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EFEBE9]">
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-stone-500">
                    <Receipt className="w-10 h-10 mx-auto mb-2 opacity-50 text-[#3E2723]" />
                    Belum ada riwayat transaksi penjualan.
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-stone-50 transition-colors">
                    <td className="p-3 font-mono font-bold text-[#3E2723]">{tx.id}</td>
                    <td className="p-3 text-stone-600">
                      {new Date(tx.timestamp).toLocaleString('id-ID', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="p-3">
                      <div className="font-bold text-[#2C2420]">
                        {tx.customerName || 'Pelanggan Umum'}
                      </div>
                      <div className="text-[10px] text-stone-500 uppercase font-semibold">{tx.orderType}</div>
                    </td>
                    <td className="p-3 font-medium text-stone-700">{tx.cashierName}</td>
                    <td className="p-3">
                      <span className="bg-[#EFEBE9] text-[#5D4037] px-2 py-0.5 rounded border border-[#D7CCC8] uppercase font-extrabold text-[10px]">
                        {tx.paymentType}
                      </span>
                    </td>
                    <td className="p-3 font-black text-[#3E2723]">{formatIDR(tx.grandTotal)}</td>
                    <td className="p-3">
                      {tx.status === 'completed' && isUnpaidDebt(tx) ? (
                        <span className="bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-full text-[10px] font-bold">
                          Bon Belum Lunas
                        </span>
                      ) : tx.status === 'completed' ? (
                        <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-0.5 rounded-full text-[10px] font-bold">
                          Lunas
                        </span>
                      ) : (
                        <span className="bg-rose-100 text-rose-800 border border-rose-300 px-2 py-0.5 rounded-full text-[10px] font-bold">
                          Batal / Refund
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => setSelectedTxForReceipt(tx)}
                          className="p-1.5 bg-[#3E2723] hover:bg-[#5D4037] text-white rounded transition-colors"
                          title="Lihat & Cetak Struk"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>

                        {isUnpaidDebt(tx) && (
                          <button
                            onClick={() => {
                              setPayMethod('tunai');
                              setTxToPay(tx);
                            }}
                            className="p-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 rounded transition-colors"
                            title="Lunasi Bon"
                            aria-label="Lunasi Bon"
                          >
                            <HandCoins className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {tx.status === 'completed' && (
                          <button
                            onClick={() => setTxToCancel(tx)}
                            className="p-1.5 bg-rose-100 hover:bg-rose-200 text-rose-800 border border-rose-300 rounded transition-colors"
                            title="Batalkan Transaksi / Refund"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* View Receipt Modal */}
      {selectedTxForReceipt && (
        <ReceiptModal
          transaction={selectedTxForReceipt}
          storeSettings={storeSettings}
          onClose={() => setSelectedTxForReceipt(null)}
          onNewTransaction={() => setSelectedTxForReceipt(null)}
        />
      )}

      {/* Cancel Confirmation Dialog */}
      {txToCancel && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#D7CCC8] text-[#2C2420] rounded-xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-800">
              <XCircle className="w-6 h-6 shrink-0" />
              <h3 className="font-extrabold text-sm uppercase tracking-tight">Pembatalan Transaksi #{txToCancel.id}</h3>
            </div>

            <p className="text-xs text-stone-600 leading-relaxed">
              Stok produk dikembalikan otomatis dan rekap shift dikoreksi. Pembatalan butuh persetujuan PIN
              Supervisor/Owner.
            </p>

            <div>
              <label className="text-xs font-bold text-[#3E2723] block mb-1">
                Alasan Pembatalan / Refund
              </label>
              <input
                type="text"
                placeholder="Contoh: Pelanggan salah pesan / Batal beli..."
                value={cancelReason}
                onChange={(e) => {
                  setCancelReason(e.target.value);
                  setCancelError('');
                }}
                className="w-full bg-white border border-[#D7CCC8] text-[#2C2420] rounded px-3 py-2 text-xs focus:outline-none focus:border-[#3E2723]"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-[#3E2723] flex items-center gap-1.5 mb-1">
                <Lock className="w-3.5 h-3.5" />
                <span>
                  PIN Supervisor / Owner
                  {can(activeCashier.role, 'cancelTransaction') ? ' (boleh PIN Anda sendiri)' : ''}
                </span>
              </label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={approverPin}
                onChange={(e) => {
                  setApproverPin(e.target.value);
                  setCancelError('');
                }}
                className="w-full bg-white border border-[#D7CCC8] text-[#2C2420] rounded px-3 py-2 text-xs font-mono tracking-widest focus:outline-none focus:border-[#3E2723]"
              />
            </div>

            {cancelError && <p className="text-xs text-rose-700 font-semibold">{cancelError}</p>}

            <div className="flex gap-2 pt-2">
              <button
                onClick={closeCancelDialog}
                className="w-1/2 py-2 bg-stone-100 hover:bg-stone-200 text-[#2C2420] border border-[#D7CCC8] font-bold rounded text-xs"
              >
                Kembali
              </button>
              <button
                onClick={handleConfirmCancel}
                className="w-1/2 py-2 bg-rose-700 hover:bg-rose-800 text-white font-extrabold rounded text-xs shadow"
              >
                Konfirmasi Batal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Debt Payment Dialog */}
      {txToPay && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#D7CCC8] text-[#2C2420] rounded-xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-amber-900">
              <HandCoins className="w-6 h-6 shrink-0" />
              <h3 className="font-extrabold text-sm uppercase tracking-tight">Pelunasan Bon #{txToPay.id}</h3>
            </div>

            <div className="bg-[#FAF8F6] border border-[#D7CCC8] rounded p-3 text-xs space-y-1">
              <div className="flex justify-between">
                <span>Pelanggan</span>
                <span className="font-bold">{txToPay.customerName || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span>Tanggal Bon</span>
                <span>{new Date(txToPay.timestamp).toLocaleString('id-ID')}</span>
              </div>
              <div className="flex justify-between font-black text-[#3E2723] pt-1 border-t border-[#D7CCC8]">
                <span>Jumlah</span>
                <span>{formatIDR(txToPay.grandTotal)}</span>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-[#3E2723] block mb-1">Dibayar dengan</label>
              <div className="grid grid-cols-2 gap-2">
                {(['tunai', 'nontunai'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setPayMethod(m)}
                    className={`py-2 rounded border text-xs font-bold uppercase ${
                      payMethod === m
                        ? 'bg-[#3E2723] text-white border-[#3E2723]'
                        : 'bg-white text-[#3E2723] border-[#D7CCC8]'
                    }`}
                  >
                    {m === 'tunai' ? 'Tunai (masuk laci)' : 'Non-Tunai'}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-stone-500 mt-1.5">
                Pelunasan dicatat pada shift yang sedang terbuka.
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setTxToPay(null)}
                className="w-1/2 py-2 bg-stone-100 hover:bg-stone-200 text-[#2C2420] border border-[#D7CCC8] font-bold rounded text-xs"
              >
                Kembali
              </button>
              <button
                onClick={handleConfirmPayDebt}
                className="w-1/2 py-2 bg-[#2E7D32] hover:bg-[#1B5E20] text-white font-extrabold rounded text-xs shadow"
              >
                Tandai Lunas
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
