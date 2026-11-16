import React from 'react';
import { Printer, Share2, Copy, PlusCircle, CheckCircle2, X, Loader2, ShoppingBag, ReceiptText } from 'lucide-react';
import { StoreSettings, Transaction } from '../../types';
import { formatIDR } from '../../lib/storage';
import {
  buildLinesFor,
  getPaperWidth,
  getPrinterMethod,
  isDirectMethod,
  printLines,
} from '../../lib/printer';
import { ThermalReceiptPreview, ThermalReceiptPrintPortal } from './ThermalReceipt';
import { TransactionOrderDetails } from './TransactionOrderDetails';

interface ReceiptModalProps {
  transaction: Transaction;
  storeSettings: StoreSettings;
  onClose: () => void;
  onNewTransaction: () => void;
  /** Cetak otomatis saat modal dibuka (setelah pembayaran) */
  autoPrint?: boolean;
  variant?: 'payment' | 'history';
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  transaction,
  storeSettings,
  onClose,
  onNewTransaction,
  autoPrint,
  variant = 'payment',
}) => {
  const [view, setView] = React.useState<'details' | 'receipt'>(variant === 'history' ? 'details' : 'receipt');
  const modalId = React.useId();
  const tabRefs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const [isCopied, setIsCopied] = React.useState(false);
  const [isPrinting, setIsPrinting] = React.useState(false);
  const [printError, setPrintError] = React.useState<string | null>(null);
  const [printOk, setPrintOk] = React.useState(false);

  const paper = getPaperWidth(storeSettings);
  const method = getPrinterMethod(storeSettings);
  const lines = React.useMemo(
    () => buildLinesFor(transaction, storeSettings),
    [transaction, storeSettings]
  );

  const formattedDate = new Date(transaction.timestamp).toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const handlePrint = async (interactive = true) => {
    setPrintError(null);
    setPrintOk(false);
    setIsPrinting(true);
    try {
      await printLines(lines, storeSettings, interactive);
      if (isDirectMethod(method)) setPrintOk(true);
    } catch (err: any) {
      // Pengguna menutup dialog pilih perangkat → bukan error
      if (err?.name !== 'NotFoundError') {
        setPrintError(err?.message || 'Gagal mencetak struk.');
      }
    } finally {
      setIsPrinting(false);
    }
  };

  // Cetak otomatis sekali saat struk baru muncul. Penanda di-set di dalam timer agar
  // tidak hilang oleh mount-ganda React StrictMode. Untuk metode langsung, printer yang
  // sudah pernah dihubungkan dipakai tanpa dialog (interactive = false).
  const autoPrinted = React.useRef(false);
  React.useEffect(() => {
    if (!autoPrint || autoPrinted.current) return;
    const t = setTimeout(() => {
      autoPrinted.current = true;
      void handlePrint(false);
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPrint]);

  const generateWhatsAppText = () => {
    let text = `*${storeSettings.storeName}*\n`;
    text += `${storeSettings.address}\n`;
    text += `Telp: ${storeSettings.phone}\n`;
    text += `--------------------------------\n`;
    text += `No. Struk: ${transaction.id}\n`;
    text += `Tanggal: ${formattedDate}\n`;
    text += `Kasir: ${transaction.cashierName}\n`;
    if (transaction.customerName) text += `Pelanggan: ${transaction.customerName}\n`;
    text += `Order: ${transaction.orderType}\n`;
    text += `--------------------------------\n`;

    transaction.items.forEach((item) => {
      text += `• ${item.product.name} x${item.quantity} = ${formatIDR(item.totalPrice)}\n`;
      if (item.selectedOptions && item.selectedOptions.length > 0) {
        text += `  (${item.selectedOptions.map((o) => o.choiceLabel).join(', ')})\n`;
      }
    });

    text += `--------------------------------\n`;
    text += `Subtotal: ${formatIDR(transaction.subtotal)}\n`;
    if (transaction.discountAmount > 0) text += `Diskon: -${formatIDR(transaction.discountAmount)}\n`;
    if (transaction.taxAmount > 0) text += `Pajak: ${formatIDR(transaction.taxAmount)}\n`;
    text += `*TOTAL: ${formatIDR(transaction.grandTotal)}*\n`;
    text += `Bayar (${transaction.paymentType.toUpperCase()}): ${formatIDR(transaction.amountPaid)}\n`;
    if (transaction.changeAmount > 0) text += `Kembali: ${formatIDR(transaction.changeAmount)}\n`;
    if (transaction.overpayAmount) text += `Kembali (permen): ${formatIDR(transaction.overpayAmount)}\n`;
    text += `--------------------------------\n`;
    if (storeSettings.wifiName?.trim() || storeSettings.wifiPassword?.trim()) {
      if (storeSettings.wifiName?.trim()) text += `WiFi: ${storeSettings.wifiName.trim()}\n`;
      if (storeSettings.wifiPassword?.trim()) text += `Password WiFi: *${storeSettings.wifiPassword.trim()}*\n`;
      text += `--------------------------------\n`;
    }
    text += `${storeSettings.receiptFooterMsg || 'Terima Kasih!'}\n`;

    return encodeURIComponent(text);
  };

  const handleWhatsAppShare = () => {
    const phone = transaction.customerPhone ? transaction.customerPhone.replace(/[^0-9]/g, '') : '';
    const url = phone
      ? `https://wa.me/${phone}?text=${generateWhatsAppText()}`
      : `https://wa.me/?text=${generateWhatsAppText()}`;
    window.open(url, '_blank');
  };

  const handleCopyText = () => {
    const rawText = decodeURIComponent(generateWhatsAppText());
    navigator.clipboard.writeText(rawText);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div role="dialog" aria-modal="true" aria-labelledby={`${modalId}-title`} className={`bg-white border border-[#D7CCC8] text-[#2C2420] rounded-xl ${variant === 'history' ? 'max-w-xl' : 'max-w-md'} max-h-[calc(100dvh-2rem)] w-full overflow-hidden shadow-2xl flex flex-col my-auto`}>
        {/* Printable Header Bar (Hidden during print) */}
        <div className="p-3.5 bg-[#3E2723] text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            {variant === 'history' ? <ShoppingBag className="w-5 h-5 text-[#D7CCC8]" /> : <CheckCircle2 className="w-5 h-5 text-[#D7CCC8]" />}
            <span id={`${modalId}-title`} className="font-extrabold text-xs uppercase tracking-tight text-white">{variant === 'history' ? 'Detail Transaksi' : 'Pembayaran Berhasil!'}</span>
          </div>

          <button
            onClick={onClose}
            aria-label="Tutup detail transaksi"
            className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div role="tablist" aria-label="Tampilan transaksi" className="grid grid-cols-2 gap-1 p-2 bg-[#F9F8F7] border-b border-[#D7CCC8] shrink-0">
          {(['details', 'receipt'] as const).map((tab, index) => (
            <button
              key={tab}
              ref={(element) => { tabRefs.current[index] = element; }}
              type="button"
              role="tab"
              id={`${modalId}-${tab}-tab`}
              aria-selected={view === tab}
              aria-controls={`${modalId}-${tab}-panel`}
              tabIndex={view === tab ? 0 : -1}
              onClick={() => setView(tab)}
              onKeyDown={(event) => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                event.preventDefault();
                const next = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1 - index;
                setView(next === 0 ? 'details' : 'receipt');
                tabRefs.current[next]?.focus();
              }}
              className={`flex items-center justify-center gap-1.5 rounded py-2 px-2 text-xs font-bold transition-colors focus-visible:outline-2 focus-visible:outline-[#3E2723] ${view === tab ? 'bg-[#3E2723] text-white shadow-sm' : 'text-stone-500 hover:bg-[#EFEBE9] hover:text-[#3E2723]'}`}
            >
              {tab === 'details' ? <ShoppingBag className="w-3.5 h-3.5" /> : <ReceiptText className="w-3.5 h-3.5" />}
              {tab === 'details' ? 'Detail Pesanan' : 'Pratinjau Struk'}
            </button>
          ))}
        </div>

        <div role="tabpanel" id={`${modalId}-${view}-panel`} aria-labelledby={`${modalId}-${view}-tab`} tabIndex={0} className="p-3 sm:p-4 bg-[#EFEBE9] min-h-0 max-h-[60vh] overflow-y-auto">
          {view === 'details' ? <TransactionOrderDetails transaction={transaction} /> : (
            <>
              <ThermalReceiptPreview lines={lines} paper={paper} />
              <p className="text-center text-[10px] text-stone-500 mt-2">
                Kertas {paper}mm · {method === 'browser' ? 'Cetak via dialog browser' : method === 'rawbt' ? 'Cetak via RawBT' : 'Cetak via Bluetooth'}
              </p>
            </>
          )}
        </div>

        {/* Hanya untuk cetak via browser: elemen ini satu-satunya yang tercetak */}
        {method === 'browser' && <ThermalReceiptPrintPortal lines={lines} paper={paper} />}

        {/* Action Buttons (Hidden when printing) */}
        <div className="p-3.5 bg-[#F9F8F7] border-t border-[#D7CCC8] space-y-2 shrink-0">
          {printOk && !printError && (
            <p className="text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded px-2 py-1.5">
              Struk terkirim ke printer.
            </p>
          )}
          {printError && (
            <p className="text-xs font-semibold text-rose-800 bg-rose-50 border border-rose-200 rounded px-2 py-1.5">
              {printError}
            </p>
          )}
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => void handlePrint(true)}
              disabled={isPrinting}
              className="py-2 px-2 bg-[#3E2723] hover:bg-[#5D4037] text-white font-bold rounded text-xs flex items-center justify-center gap-1 shadow disabled:opacity-60"
            >
              {isPrinting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Printer className="w-3.5 h-3.5" />}
              <span>{isPrinting ? 'Mencetak...' : 'Cetak Struk'}</span>
            </button>

            <button
              onClick={handleWhatsAppShare}
              className="py-2 px-2 bg-[#2E7D32] hover:bg-[#1B5E20] text-white font-bold rounded text-xs flex items-center justify-center gap-1 shadow"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Kirim WA</span>
            </button>

            <button
              onClick={handleCopyText}
              className="py-2 px-2 bg-white hover:bg-stone-100 text-[#3E2723] border border-[#D7CCC8] font-bold rounded text-xs flex items-center justify-center gap-1"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>{isCopied ? 'Tersalin' : 'Salin'}</span>
            </button>
          </div>

          <button
            onClick={variant === 'history' ? onClose : onNewTransaction}
            className="w-full py-2.5 bg-[#3E2723] hover:bg-[#5D4037] text-white font-bold rounded text-xs uppercase flex items-center justify-center gap-2 transition-all shadow"
          >
            {variant === 'history' ? <X className="w-4 h-4" /> : <PlusCircle className="w-4 h-4" />}
            <span>{variant === 'history' ? 'TUTUP DETAIL' : 'TRANSAKSI BARU'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
