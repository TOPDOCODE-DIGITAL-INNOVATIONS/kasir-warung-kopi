import React, { useState } from 'react';
import {
  X,
  Banknote,
  QrCode,
  Building2,
  Wallet,
  FileText,
  CreditCard,
  CheckCircle2,
  Copy,
  Check,
  AlertCircle,
} from 'lucide-react';
import { RupiahInput } from '../RupiahInput';
import { PaymentType, StoreSettings, Transaction } from '../../types';
import { formatIDR, generateReceiptId } from '../../lib/storage';

interface PaymentModalProps {
  grandTotal: number;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  orderType: 'Dine In' | 'Takeaway' | 'Online / Ojol';
  customerName: string;
  cartItems: any[];
  activeCashier: { id: string; name: string };
  storeSettings: StoreSettings;
  onClose: () => void;
  onPaymentSuccess: (transaction: Transaction) => void;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  grandTotal,
  subtotal,
  discountAmount,
  taxAmount,
  orderType,
  customerName,
  cartItems,
  activeCashier,
  storeSettings,
  onClose,
  onPaymentSuccess,
}) => {
  const [selectedPaymentType, setSelectedPaymentType] = useState<PaymentType>('tunai');

  // Tunai (Cash) State
  const [cashReceived, setCashReceived] = useState<number>(grandTotal);

  // Bank Transfer / E-Wallet / Hutang State
  const [selectedBank, setSelectedBank] = useState<string>(
    storeSettings.bankAccounts[0]?.bankName || 'BCA'
  );
  const [selectedEWallet, setSelectedEWallet] = useState<string>('GoPay / OVO / Dana');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [paymentNote, setPaymentNote] = useState<string>('');
  const [copiedBankIndex, setCopiedBankIndex] = useState<number | null>(null);

  // Cash change calculation
  const changeDue = Math.max(0, cashReceived - grandTotal);
  // Kelebihan: bagian kembalian yang diganti permen / tidak dikembalikan (tidak ada uang pas)
  const [overpayInput, setOverpayInput] = useState<number>(0);
  const overpay = Math.min(Math.max(0, overpayInput), changeDue);
  const changeAmount = changeDue - overpay;
  // Pilihan cepat: sisa receh yang tidak bisa dikembalikan jika pecahan terkecil di laci 500 / 1.000 / 2.000
  const overpayPresets = [500, 1000, 2000]
    .map((unit) => changeDue % unit)
    .filter((v, i, arr) => v > 0 && arr.indexOf(v) === i);

  // Quick cash suggestion chips
  const quickCashPresets = [
    grandTotal, // Uang Pas
    Math.ceil(grandTotal / 10000) * 10000, // Round to 10k
    Math.ceil(grandTotal / 20000) * 20000, // Round to 20k
    Math.ceil(grandTotal / 50000) * 50000, // Round to 50k
    Math.ceil(grandTotal / 100000) * 100000, // Round to 100k
    200000,
  ].filter((val, idx, self) => val >= grandTotal && self.indexOf(val) === idx);


  const handleSelectPresetCash = (amount: number) => {
    setCashReceived(amount);
  };

  const handleCopyText = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedBankIndex(index);
    setTimeout(() => setCopiedBankIndex(null), 2000);
  };

  const handleProcessTransaction = () => {
    if (selectedPaymentType === 'tunai' && cashReceived < grandTotal) {
      alert('Jumlah uang tunai kurang dari total tagihan!');
      return;
    }

    if (selectedPaymentType === 'hutang' && !customerName.trim()) {
      alert('Mohon isi nama pelanggan untuk transaksi Hutang / Bon!');
      return;
    }

    let detail = '';
    if (selectedPaymentType === 'transfer') detail = `Bank ${selectedBank}`;
    if (selectedPaymentType === 'ewallet') detail = selectedEWallet;
    if (selectedPaymentType === 'qris') detail = `QRIS Statis (${storeSettings.qrisMerchantName})`;
    if (selectedPaymentType === 'hutang') detail = `Bon Hutang - ${customerName}`;
    if (selectedPaymentType === 'debit') detail = paymentNote ? `EDC ${paymentNote}` : 'EDC Debit/Kredit';

    const newTransaction: Transaction = {
      id: generateReceiptId(),
      timestamp: new Date().toISOString(),
      cashierId: activeCashier.id,
      cashierName: activeCashier.name,
      orderType,
      customerName: customerName.trim() || undefined,
      customerPhone: customerPhone.trim() || undefined,
      items: cartItems,
      subtotal,
      discountAmount,
      taxAmount,
      grandTotal,
      paymentType: selectedPaymentType,
      paymentDetail: detail,
      amountPaid: selectedPaymentType === 'tunai' ? cashReceived : grandTotal,
      changeAmount: selectedPaymentType === 'tunai' ? changeAmount : 0,
      overpayAmount: selectedPaymentType === 'tunai' && overpay > 0 ? overpay : undefined,
      status: 'completed',
      notes: paymentNote.trim() || undefined,
    };

    onPaymentSuccess(newTransaction);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white border border-[#D7CCC8] text-[#2C2420] rounded-xl max-w-2xl w-full overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-3.5 bg-[#3E2723] text-white flex items-center justify-between">
          <div>
            <h3 className="font-extrabold text-sm text-white flex items-center gap-2 uppercase tracking-tight">
              <CheckCircle2 className="w-5 h-5 text-[#D7CCC8]" />
              <span>Pembayaran Pesanan</span>
            </h3>
            <p className="text-[11px] text-[#D7CCC8]">Metode pembayaran tanpa gateway external</p>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body Grid */}
        <div className="p-4 overflow-y-auto grid grid-cols-1 md:grid-cols-12 gap-4 flex-1 bg-[#F9F8F7]">
          {/* Left Column: Payment Methods Selection */}
          <div className="md:col-span-5 space-y-2">
            <label className="text-[11px] font-bold uppercase tracking-wider text-[#3E2723]">
              Metode Pembayaran
            </label>

            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => setSelectedPaymentType('tunai')}
                className={`w-full p-2.5 rounded border text-left font-semibold text-xs flex items-center gap-3 transition-all ${
                  selectedPaymentType === 'tunai'
                    ? 'bg-[#3E2723] border-[#3E2723] text-white shadow'
                    : 'bg-white border-[#D7CCC8] text-[#2C2420] hover:bg-stone-50'
                }`}
              >
                <div className={`p-1.5 rounded ${selectedPaymentType === 'tunai' ? 'bg-[#5D4037] text-white' : 'bg-emerald-100 text-emerald-800'}`}>
                  <Banknote className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-xs uppercase">Tunai / Cash</div>
                  <div className={`text-[10px] ${selectedPaymentType === 'tunai' ? 'text-[#D7CCC8]' : 'text-stone-500'}`}>Uang fisik & kembalian</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setSelectedPaymentType('qris')}
                className={`w-full p-2.5 rounded border text-left font-semibold text-xs flex items-center gap-3 transition-all ${
                  selectedPaymentType === 'qris'
                    ? 'bg-[#3E2723] border-[#3E2723] text-white shadow'
                    : 'bg-white border-[#D7CCC8] text-[#2C2420] hover:bg-stone-50'
                }`}
              >
                <div className={`p-1.5 rounded ${selectedPaymentType === 'qris' ? 'bg-[#5D4037] text-white' : 'bg-blue-100 text-blue-800'}`}>
                  <QrCode className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-xs uppercase">QRIS Statis</div>
                  <div className={`text-[10px] ${selectedPaymentType === 'qris' ? 'text-[#D7CCC8]' : 'text-stone-500'}`}>Scan QR toko langsung</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setSelectedPaymentType('transfer')}
                className={`w-full p-2.5 rounded border text-left font-semibold text-xs flex items-center gap-3 transition-all ${
                  selectedPaymentType === 'transfer'
                    ? 'bg-[#3E2723] border-[#3E2723] text-white shadow'
                    : 'bg-white border-[#D7CCC8] text-[#2C2420] hover:bg-stone-50'
                }`}
              >
                <div className={`p-1.5 rounded ${selectedPaymentType === 'transfer' ? 'bg-[#5D4037] text-white' : 'bg-indigo-100 text-indigo-800'}`}>
                  <Building2 className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-xs uppercase">Transfer Bank</div>
                  <div className={`text-[10px] ${selectedPaymentType === 'transfer' ? 'text-[#D7CCC8]' : 'text-stone-500'}`}>BCA / Mandiri / BRI</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setSelectedPaymentType('ewallet')}
                className={`w-full p-2.5 rounded border text-left font-semibold text-xs flex items-center gap-3 transition-all ${
                  selectedPaymentType === 'ewallet'
                    ? 'bg-[#3E2723] border-[#3E2723] text-white shadow'
                    : 'bg-white border-[#D7CCC8] text-[#2C2420] hover:bg-stone-50'
                }`}
              >
                <div className={`p-1.5 rounded ${selectedPaymentType === 'ewallet' ? 'bg-[#5D4037] text-white' : 'bg-violet-100 text-violet-800'}`}>
                  <Wallet className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-xs uppercase">E-Wallet Direct</div>
                  <div className={`text-[10px] ${selectedPaymentType === 'ewallet' ? 'text-[#D7CCC8]' : 'text-stone-500'}`}>GoPay / OVO / Dana</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setSelectedPaymentType('hutang')}
                className={`w-full p-2.5 rounded border text-left font-semibold text-xs flex items-center gap-3 transition-all ${
                  selectedPaymentType === 'hutang'
                    ? 'bg-[#3E2723] border-[#3E2723] text-white shadow'
                    : 'bg-white border-[#D7CCC8] text-[#2C2420] hover:bg-stone-50'
                }`}
              >
                <div className={`p-1.5 rounded ${selectedPaymentType === 'hutang' ? 'bg-[#5D4037] text-white' : 'bg-rose-100 text-rose-800'}`}>
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-xs uppercase">Bon / Hutang</div>
                  <div className={`text-[10px] ${selectedPaymentType === 'hutang' ? 'text-[#D7CCC8]' : 'text-stone-500'}`}>Bayar belakangan</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setSelectedPaymentType('debit')}
                className={`w-full p-2.5 rounded border text-left font-semibold text-xs flex items-center gap-3 transition-all ${
                  selectedPaymentType === 'debit'
                    ? 'bg-[#3E2723] border-[#3E2723] text-white shadow'
                    : 'bg-white border-[#D7CCC8] text-[#2C2420] hover:bg-stone-50'
                }`}
              >
                <div className={`p-1.5 rounded ${selectedPaymentType === 'debit' ? 'bg-[#5D4037] text-white' : 'bg-amber-100 text-amber-800'}`}>
                  <CreditCard className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-xs uppercase">Mesin EDC Debit</div>
                  <div className={`text-[10px] ${selectedPaymentType === 'debit' ? 'text-[#D7CCC8]' : 'text-stone-500'}`}>Gesek kartu debit/kredit</div>
                </div>
              </button>
            </div>
          </div>

          {/* Right Column: Payment Details & Input */}
          <div className="md:col-span-7 bg-white border border-[#D7CCC8] p-4 rounded flex flex-col justify-between space-y-4 shadow-sm">
            {/* Amount Banner */}
            <div className="bg-[#EFEBE9] border border-[#D7CCC8] p-3 rounded text-center">
              <span className="text-[10px] text-[#5D4037] font-bold uppercase tracking-wider">
                Total Tagihan
              </span>
              <div className="text-2xl font-black text-[#3E2723]">{formatIDR(grandTotal)}</div>
            </div>

            {/* TUNAI PAYMENT VIEW */}
            {selectedPaymentType === 'tunai' && (
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-bold text-[#3E2723] block mb-1">
                    Nominal Uang Diterima
                  </label>
                  <RupiahInput
                    value={cashReceived}
                    onChange={setCashReceived}
                    className="w-full bg-white border border-[#D7CCC8] text-[#2C2420] rounded pr-3 py-2 text-base font-extrabold focus:outline-none focus:border-[#3E2723]"
                  />
                </div>

                {/* Quick Suggestion Chips */}
                <div>
                  <label className="text-[10px] text-gray-500 font-bold uppercase block mb-1">
                    Pilihan Uang Pas / Pecahan:
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {quickCashPresets.map((amount) => (
                      <button
                        key={amount}
                        type="button"
                        onClick={() => handleSelectPresetCash(amount)}
                        className={`px-2.5 py-1 rounded text-xs font-bold transition-all ${
                          cashReceived === amount
                            ? 'bg-[#3E2723] text-white'
                            : 'bg-[#F5F5F5] text-[#2C2420] border border-[#D7CCC8] hover:bg-stone-200'
                        }`}
                      >
                        {amount === grandTotal ? 'Uang Pas' : formatIDR(amount)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Change Calculator */}
                <div
                  className={`p-3 rounded border flex items-center justify-between ${
                    cashReceived < grandTotal
                      ? 'bg-rose-50 border-rose-200 text-rose-800'
                      : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  }`}
                >
                  <span className="text-xs font-bold uppercase">
                    {cashReceived < grandTotal ? 'Kurang' : 'Kembalian'}
                  </span>
                  <span className="text-lg font-black">
                    {cashReceived < grandTotal
                      ? formatIDR(grandTotal - cashReceived)
                      : formatIDR(changeAmount)}
                  </span>
                </div>

                {/* Kelebihan / kembalian permen */}
                {changeDue > 0 && (
                  <div className="p-3 rounded border border-amber-200 bg-amber-50 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-xs font-bold text-amber-900">
                        Kembalian permen / kelebihan
                      </label>
                      {overpay > 0 && (
                        <button
                          type="button"
                          onClick={() => setOverpayInput(0)}
                          className="text-[10px] font-bold text-amber-900 underline"
                        >
                          Hapus
                        </button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {overpayPresets.map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setOverpayInput(v)}
                          className={`px-2.5 py-1 rounded text-xs font-bold ${
                            overpay === v
                              ? 'bg-amber-700 text-white'
                              : 'bg-white text-amber-900 border border-amber-300 hover:bg-amber-100'
                          }`}
                        >
                          {formatIDR(v)}
                        </button>
                      ))}
                      <div className="flex-1 min-w-[7rem]">
                        <RupiahInput
                          max={changeDue}
                          placeholder="Lainnya"
                          value={overpayInput}
                          onChange={setOverpayInput}
                          prefixClassName="text-amber-900"
                          className="w-full bg-white border border-amber-300 rounded pr-2 py-1 text-xs font-bold focus:outline-none focus:border-amber-700"
                        />
                      </div>
                    </div>
                    <p className="text-[10px] text-amber-900/80">
                      {overpay > 0
                        ? `Kembalian uang ${formatIDR(changeAmount)} + permen ${formatIDR(overpay)}. Kelebihan ${formatIDR(overpay)} tetap di laci & dicatat terpisah.`
                        : 'Isi jika sebagian kembalian diganti permen karena tidak ada uang pas.'}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* QRIS PAYMENT VIEW */}
            {selectedPaymentType === 'qris' && (
              <div className="space-y-3 text-center py-2">
                <div className="bg-white p-3 rounded-xl inline-block shadow-lg mx-auto">
                  {/* Stylized QRIS Placeholder Graphic */}
                  <div className="w-36 h-36 border-4 border-stone-900 bg-stone-100 flex flex-col items-center justify-center relative p-1">
                    <QrCode className="w-24 h-24 text-stone-900" />
                    <span className="text-[9px] font-black tracking-widest text-stone-900 mt-1">
                      QRIS STATIS WARKOP
                    </span>
                  </div>
                </div>

                <div>
                  <h4 className="font-bold text-sm text-amber-300">
                    {storeSettings.qrisMerchantName}
                  </h4>
                  <p className="text-[11px] text-stone-400">
                    NMID: {storeSettings.qrisNmid || 'ID1020304050'}
                  </p>
                  <p className="text-[11px] text-stone-300 mt-2 bg-stone-800/80 p-2 rounded-lg">
                    Tunjukkan QR ini ke pelanggan untuk di-scan via GoPay, OVO, Dana, ShopeePay, atau Mobile Banking.
                  </p>
                </div>
              </div>
            )}

            {/* TRANSFER BANK VIEW */}
            {selectedPaymentType === 'transfer' && (
              <div className="space-y-3">
                <label className="text-xs font-bold text-stone-300">Rekening Tujuan Transfer</label>
                <div className="space-y-2">
                  {storeSettings.bankAccounts.map((bank, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-stone-800 rounded-xl border border-stone-700 flex items-center justify-between"
                    >
                      <div>
                        <span className="bg-indigo-900 text-indigo-200 text-[10px] font-bold px-1.5 py-0.5 rounded mr-1.5">
                          {bank.bankName}
                        </span>
                        <span className="font-mono font-extrabold text-sm text-stone-100">
                          {bank.accountNumber}
                        </span>
                        <div className="text-[10px] text-stone-400">a.n {bank.accountHolder}</div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleCopyText(bank.accountNumber, idx)}
                        className="p-2 bg-stone-700 hover:bg-stone-600 text-stone-200 rounded-lg text-xs font-semibold flex items-center gap-1"
                      >
                        {copiedBankIndex === idx ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Tersalin</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Salin</span>
                          </>
                        )}
                      </button>
                    </div>
                  ))}
                </div>

                <div className="pt-1">
                  <label className="text-[11px] font-semibold text-stone-400 block mb-1">
                    No. Reff / Catatan Transfer (Opsional)
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: Transfer atas nama Pak Budi..."
                    value={paymentNote}
                    onChange={(e) => setPaymentNote(e.target.value)}
                    className="w-full bg-stone-800 border border-stone-700 text-stone-100 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>
            )}

            {/* E-WALLET VIEW */}
            {selectedPaymentType === 'ewallet' && (
              <div className="space-y-3">
                <label className="text-xs font-bold text-stone-300">Nomor E-Wallet Warkop</label>
                <div className="space-y-2">
                  {storeSettings.eWallets.map((ew, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-stone-800 rounded-xl border border-stone-700 flex items-center justify-between"
                    >
                      <div>
                        <span className="bg-violet-900 text-violet-200 text-[10px] font-bold px-1.5 py-0.5 rounded mr-1.5">
                          {ew.provider}
                        </span>
                        <span className="font-mono font-extrabold text-sm text-stone-100">
                          {ew.phoneNumber}
                        </span>
                        <div className="text-[10px] text-stone-400">a.n {ew.accountHolder}</div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleCopyText(ew.phoneNumber, idx + 10)}
                        className="p-2 bg-stone-700 hover:bg-stone-600 text-stone-200 rounded-lg text-xs font-semibold flex items-center gap-1"
                      >
                        {copiedBankIndex === idx + 10 ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Tersalin</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Salin</span>
                          </>
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* HUTANG / BON VIEW */}
            {selectedPaymentType === 'hutang' && (
              <div className="space-y-2.5">
                <div className="bg-rose-950/40 border border-rose-800/80 p-2.5 rounded-xl text-rose-300 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">Transaksi Bon / Hutang</p>
                    <p className="text-[10px] text-rose-300/80">
                      Pesanan akan dicatat sebagai belum lunas. Wajib memasukkan Nama Pelanggan.
                    </p>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-stone-300 block mb-1">
                    No. Telepon / HP Pelanggan
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: 0812-9988-7766"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className="w-full bg-stone-800 border border-stone-700 text-stone-100 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-stone-300 block mb-1">
                    Catatan Janji Bayar
                  </label>
                  <textarea
                    placeholder="Contoh: Bayar akhir bulan saat gajian..."
                    value={paymentNote}
                    onChange={(e) => setPaymentNote(e.target.value)}
                    className="w-full bg-stone-800 border border-stone-700 text-stone-100 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:border-amber-500 h-16 resize-none"
                  />
                </div>
              </div>
            )}

            {/* DEBIT / EDC VIEW */}
            {selectedPaymentType === 'debit' && (
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-bold text-stone-300 block mb-1">
                    Nomor Reff / Approval Code EDC
                  </label>
                  <input
                    type="text"
                    placeholder="Masukkan kode struk EDC (contoh: EDC-998822)"
                    value={paymentNote}
                    onChange={(e) => setPaymentNote(e.target.value)}
                    className="w-full bg-stone-800 border border-stone-700 text-stone-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>
            )}

            {/* Submit Action Button */}
            <div className="pt-2">
              <button
                type="button"
                onClick={handleProcessTransaction}
                disabled={selectedPaymentType === 'tunai' && cashReceived < grandTotal}
                className={`w-full py-3.5 px-4 rounded font-black text-sm uppercase tracking-wide shadow transition-all flex items-center justify-center gap-2 ${
                  selectedPaymentType === 'tunai' && cashReceived < grandTotal
                    ? 'bg-stone-200 text-stone-400 cursor-not-allowed'
                    : 'bg-[#2E7D32] hover:bg-[#1B5E20] text-white active:scale-[0.99]'
                }`}
              >
                <CheckCircle2 className="w-5 h-5 stroke-[2.5]" />
                <span>SELESAIKAN PEMBAYARAN</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
