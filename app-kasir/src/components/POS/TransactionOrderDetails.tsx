import React from 'react';
import { ShoppingBag } from 'lucide-react';
import { Transaction } from '../../types';
import { formatIDR } from '../../lib/storage';

const PAYMENT_LABELS: Record<Transaction['paymentType'], string> = {
  tunai: 'Tunai',
  qris: 'QRIS',
  transfer: 'Transfer Bank',
  ewallet: 'E-Wallet',
  hutang: 'Bon',
  debit: 'EDC Debit',
};

/** Rincian hanya-baca dari snapshot transaksi, tanpa mengambil produk katalog saat ini. */
export const TransactionOrderDetails: React.FC<{ transaction: Transaction }> = ({ transaction }) => {
  const cancelled = transaction.status === 'cancelled';
  const unpaid = transaction.paymentType === 'hutang' && transaction.debtStatus !== 'paid';
  const portions = transaction.items.reduce((total, item) => total + item.quantity, 0);

  return (
    <div className="space-y-3 text-xs">
      <section className="bg-white border border-[#D7CCC8] rounded-lg p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-bold text-[#3E2723] break-all">{transaction.id}</p>
            <p className="text-[11px] text-stone-500 mt-1">
              {new Date(transaction.timestamp).toLocaleString('id-ID', {
                day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
              })}
            </p>
          </div>
          <span className={`shrink-0 text-[10px] font-bold rounded px-2 py-1 ${
            cancelled ? 'bg-rose-50 text-rose-700' : unpaid ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-700'
          }`}>
            {cancelled ? 'Dibatalkan' : unpaid ? 'Bon Belum Lunas' : 'Lunas'}
          </span>
        </div>
        <dl className="grid grid-cols-2 gap-2 pt-2 border-t border-[#EFEBE9]">
          <div className="min-w-0"><dt className="text-[10px] text-stone-500">Pelanggan / Meja</dt><dd className="font-semibold break-words mt-0.5">{transaction.customerName || 'Pelanggan Umum'}</dd></div>
          <div className="min-w-0"><dt className="text-[10px] text-stone-500">Tipe Order</dt><dd className="font-semibold mt-0.5">{transaction.orderType}</dd></div>
          <div className="min-w-0"><dt className="text-[10px] text-stone-500">Kasir</dt><dd className="font-semibold break-words mt-0.5">{transaction.cashierName}</dd></div>
          <div className="min-w-0"><dt className="text-[10px] text-stone-500">Pembayaran</dt><dd className="font-semibold break-words mt-0.5">{PAYMENT_LABELS[transaction.paymentType]}{transaction.paymentDetail ? ` · ${transaction.paymentDetail}` : ''}</dd></div>
        </dl>
        {cancelled && transaction.cancelReason && (
          <p className="text-rose-700 whitespace-pre-wrap break-words">Alasan pembatalan: {transaction.cancelReason}</p>
        )}
      </section>

      <section className="bg-white border border-[#D7CCC8] rounded-lg overflow-hidden">
        <div className="px-3 py-2.5 bg-[#F9F8F7] border-b border-[#D7CCC8] flex items-center justify-between gap-2">
          <h3 className="font-bold text-[#3E2723] flex items-center gap-1.5"><ShoppingBag className="w-3.5 h-3.5" />Detail Pesanan</h3>
          <span className="text-[11px] text-stone-500">{portions} porsi</span>
        </div>
        <ul className="divide-y divide-[#EFEBE9]">
          {transaction.items.map((item, index) => (
            <li key={`${item.cartItemId}-${index}`} className="p-3 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <p className="font-bold min-w-0 break-words">{item.product.name}</p>
                <span className="font-bold shrink-0">{formatIDR(item.totalPrice)}</span>
              </div>
              {!!item.selectedOptions?.length && (
                <div className="flex flex-wrap gap-1">
                  {item.selectedOptions.map((option, optionIndex) => (
                    <span key={optionIndex} className="bg-[#EFEBE9] text-[#5D4037] text-[10px] px-1.5 py-0.5 rounded border border-[#D7CCC8] break-words max-w-full">
                      {option.groupName}: {option.choiceLabel}
                    </span>
                  ))}
                </div>
              )}
              {item.notes?.trim() && (
                <p className="text-[11px] text-amber-900 bg-amber-50 rounded px-2 py-1.5 whitespace-pre-wrap break-words">
                  <span className="font-semibold">Catatan: </span>{item.notes}
                </p>
              )}
              <p className="text-[11px] text-stone-500">{item.quantity} porsi × {formatIDR(item.unitPrice)}</p>
            </li>
          ))}
        </ul>
        {transaction.items.length === 0 && <p className="p-3 text-stone-500">Detail produk tidak tersedia pada transaksi ini.</p>}
      </section>

      {transaction.notes?.trim() && (
        <section className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <h3 className="font-bold text-amber-900 mb-1">Catatan Pesanan</h3>
          <p className="text-amber-900 text-[11px] whitespace-pre-wrap break-words">{transaction.notes}</p>
        </section>
      )}

      <dl className="bg-white border border-[#D7CCC8] rounded-lg p-3 space-y-2">
        <div className="flex justify-between gap-3"><dt className="text-stone-500">Subtotal</dt><dd>{formatIDR(transaction.subtotal)}</dd></div>
        {transaction.discountAmount > 0 && (
          <div className="flex justify-between gap-3"><dt className="text-stone-500 min-w-0 break-words">Diskon{transaction.discountReason ? ` (${transaction.discountReason})` : ''}</dt><dd className="shrink-0">−{formatIDR(transaction.discountAmount)}</dd></div>
        )}
        {transaction.taxAmount > 0 && <div className="flex justify-between gap-3"><dt className="text-stone-500">Pajak</dt><dd>{formatIDR(transaction.taxAmount)}</dd></div>}
        <div className="flex justify-between gap-3 border-t border-[#D7CCC8] pt-2 font-extrabold text-sm text-[#3E2723]"><dt>Total Tagihan</dt><dd>{formatIDR(transaction.grandTotal)}</dd></div>
        {transaction.paymentType !== 'hutang' && (
          <>
            <div className="flex justify-between gap-3"><dt className="text-stone-500">Dibayar</dt><dd>{formatIDR(transaction.amountPaid)}</dd></div>
            {transaction.changeAmount > 0 && <div className="flex justify-between gap-3"><dt className="text-stone-500">Kembalian</dt><dd>{formatIDR(transaction.changeAmount)}</dd></div>}
            {!!transaction.overpayAmount && <div className="flex justify-between gap-3"><dt className="text-stone-500">Kelebihan / Permen</dt><dd>{formatIDR(transaction.overpayAmount)}</dd></div>}
          </>
        )}
      </dl>
    </div>
  );
};
