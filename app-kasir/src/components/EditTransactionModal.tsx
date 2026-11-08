import React, { useMemo, useState } from 'react';
import { Pencil, Lock, Minus, Plus, Trash2, Info } from 'lucide-react';
import { CartItem, Cashier, PaymentType, Transaction } from '../types';
import {
  canEditTransactionAmounts,
  editTransaction,
  formatIDR,
  getCashiers,
  getProducts,
} from '../lib/storage';
import { verifyPin } from '../lib/security';
import { can } from '../lib/permissions';

interface EditTransactionModalProps {
  transaction: Transaction;
  activeCashier: Cashier;
  onClose: () => void;
  onSaved: (message: string) => void;
}

const PAYMENT_LABELS: Record<PaymentType, string> = {
  tunai: 'Tunai / Cash',
  qris: 'QRIS',
  transfer: 'Transfer Bank',
  ewallet: 'E-Wallet',
  debit: 'EDC Debit',
  hutang: 'Bon / Hutang',
};

const ORDER_TYPES: Transaction['orderType'][] = ['Dine In', 'Takeaway', 'Online / Ojol'];

const inputCls =
  'w-full bg-white border border-[#D7CCC8] text-[#2C2420] rounded px-3 py-2 text-xs focus:outline-none focus:border-[#3E2723] disabled:bg-stone-100 disabled:text-stone-400';

export const EditTransactionModal: React.FC<EditTransactionModalProps> = ({
  transaction: tx,
  activeCashier,
  onClose,
  onSaved,
}) => {
  const amountLock = canEditTransactionAmounts(tx);
  const lockedAmounts = !amountLock.ok;

  const [items, setItems] = useState<CartItem[]>(() => tx.items.map((i) => ({ ...i })));
  const [discount, setDiscount] = useState<number>(tx.discountAmount || 0);
  const [paymentType, setPaymentType] = useState<PaymentType>(tx.paymentType);
  const [paymentDetail, setPaymentDetail] = useState(tx.paymentDetail ?? '');
  const [amountPaid, setAmountPaid] = useState<number>(tx.paymentType === 'tunai' ? tx.amountPaid : tx.grandTotal);
  const [overpay, setOverpay] = useState<number>(tx.overpayAmount ?? 0);
  const [orderType, setOrderType] = useState<Transaction['orderType']>(tx.orderType);
  const [customerName, setCustomerName] = useState(tx.customerName ?? '');
  const [customerPhone, setCustomerPhone] = useState(tx.customerPhone ?? '');
  const [notes, setNotes] = useState(tx.notes ?? '');
  const [reason, setReason] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [addProductId, setAddProductId] = useState('');

  const products = useMemo(() => getProducts().filter((p) => p.isAvailable), []);

  // Hitung ulang total dengan tarif pajak transaksi aslinya (sama seperti di storage).
  const subtotal = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
  const disc = Math.min(subtotal, Math.max(0, discount || 0));
  const oldBase = tx.subtotal - tx.discountAmount;
  const taxRate = tx.taxAmount > 0 && oldBase > 0 ? Math.round((tx.taxAmount / oldBase) * 10000) / 10000 : 0;
  const tax = Math.round((subtotal - disc) * taxRate);
  const grandTotal = subtotal - disc + tax;
  const changeDue = Math.max(0, amountPaid - grandTotal);
  const changeAmount = changeDue - Math.min(overpay, changeDue);

  const clearError = () => setError('');

  const setQty = (cartItemId: string, qty: number) => {
    clearError();
    setItems((list) => list.map((i) => (i.cartItemId === cartItemId ? { ...i, quantity: Math.max(1, qty) } : i)));
  };
  const removeItem = (cartItemId: string) => {
    clearError();
    setItems((list) => list.filter((i) => i.cartItemId !== cartItemId));
  };
  const addItem = () => {
    const p = products.find((x) => x.id === addProductId);
    if (!p) return;
    clearError();
    const key = `${p.id}--edit`;
    setItems((list) => {
      const existing = list.find((i) => i.cartItemId === key);
      if (existing) return list.map((i) => (i === existing ? { ...i, quantity: i.quantity + 1 } : i));
      return [
        ...list,
        { cartItemId: key, product: p, quantity: 1, selectedOptions: [], unitPrice: p.price, totalPrice: p.price },
      ];
    });
    setAddProductId('');
  };

  const handleSave = () => {
    if (!reason.trim()) {
      setError('Mohon isi alasan koreksi.');
      return;
    }
    const approver = getCashiers().find((c) => can(c.role, 'editTransaction') && verifyPin(c, pin));
    if (!approver) {
      setError('PIN Supervisor/Owner salah.');
      return;
    }
    const res = editTransaction(
      tx.id,
      {
        items,
        discountAmount: disc,
        paymentType,
        paymentDetail,
        amountPaid: paymentType === 'tunai' ? amountPaid : undefined,
        overpayAmount: paymentType === 'tunai' ? overpay : undefined,
        orderType,
        customerName,
        customerPhone,
        notes,
      },
      { reason, editedBy: approver.name }
    );
    if (!res.ok) {
      setError(res.message);
      return;
    }
    onSaved(res.message);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-[#D7CCC8] text-[#2C2420] rounded-xl max-w-lg w-full max-h-[92vh] flex flex-col shadow-2xl">
        <div className="p-4 border-b border-[#D7CCC8] flex items-center gap-3 text-[#3E2723]">
          <Pencil className="w-5 h-5 shrink-0" />
          <h3 className="font-extrabold text-sm uppercase tracking-tight">Koreksi Transaksi #{tx.id}</h3>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto text-xs">
          {lockedAmounts && (
            <div className="flex gap-2 p-2.5 rounded border border-amber-300 bg-amber-50 text-amber-900">
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{amountLock.reason}</span>
            </div>
          )}

          {/* Item */}
          <div className="space-y-2">
            <div className="font-bold text-[#3E2723] uppercase">Item</div>
            {items.map((i) => (
              <div key={i.cartItemId} className="flex items-center gap-2 border border-[#EFEBE9] rounded p-2">
                <div className="flex-1 min-w-0">
                  <div className="font-bold truncate">{i.product.name}</div>
                  <div className="text-[10px] text-stone-500">
                    {i.selectedOptions.map((o) => o.choiceLabel).join(', ')}
                    {i.selectedOptions.length ? ' · ' : ''}
                    {formatIDR(i.unitPrice)}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={lockedAmounts || i.quantity <= 1}
                  onClick={() => setQty(i.cartItemId, i.quantity - 1)}
                  className="p-1 rounded border border-[#D7CCC8] disabled:opacity-40"
                  aria-label="Kurangi"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="w-6 text-center font-black">{i.quantity}</span>
                <button
                  type="button"
                  disabled={lockedAmounts}
                  onClick={() => setQty(i.cartItemId, i.quantity + 1)}
                  className="p-1 rounded border border-[#D7CCC8] disabled:opacity-40"
                  aria-label="Tambah"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
                <span className="w-20 text-right font-bold">{formatIDR(i.unitPrice * i.quantity)}</span>
                <button
                  type="button"
                  disabled={lockedAmounts || items.length <= 1}
                  onClick={() => removeItem(i.cartItemId)}
                  className="p-1 rounded text-rose-700 hover:bg-rose-50 disabled:opacity-30"
                  aria-label="Hapus item"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            {!lockedAmounts && (
              <div className="flex gap-2">
                <select value={addProductId} onChange={(e) => setAddProductId(e.target.value)} className={inputCls}>
                  <option value="">+ Tambah item dari menu…</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {formatIDR(p.price)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={addItem}
                  disabled={!addProductId}
                  className="px-3 rounded bg-[#3E2723] text-white font-bold disabled:opacity-40"
                >
                  Tambah
                </button>
              </div>
            )}
          </div>

          {/* Diskon & total */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="font-bold text-[#3E2723] block mb-1">Diskon (Rp)</label>
              <input
                type="number"
                min={0}
                disabled={lockedAmounts}
                value={discount || ''}
                onChange={(e) => {
                  clearError();
                  setDiscount(Number(e.target.value) || 0);
                }}
                className={inputCls}
              />
            </div>
            <div className="bg-[#FAF8F6] border border-[#D7CCC8] rounded p-2 space-y-0.5">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>{formatIDR(subtotal)}</span>
              </div>
              {tax > 0 && (
                <div className="flex justify-between">
                  <span>Pajak</span>
                  <span>{formatIDR(tax)}</span>
                </div>
              )}
              <div className="flex justify-between font-black text-[#3E2723]">
                <span>Total</span>
                <span>{formatIDR(grandTotal)}</span>
              </div>
              {grandTotal !== tx.grandTotal && (
                <div className="text-[10px] text-stone-500 text-right">sebelumnya {formatIDR(tx.grandTotal)}</div>
              )}
            </div>
          </div>

          {/* Pembayaran */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="font-bold text-[#3E2723] block mb-1">Metode Pembayaran</label>
              <select
                value={paymentType}
                disabled={lockedAmounts}
                onChange={(e) => {
                  clearError();
                  const next = e.target.value as PaymentType;
                  setPaymentType(next);
                  if (next === 'tunai') setAmountPaid(Math.max(amountPaid, grandTotal));
                  if (next === 'hutang' && customerName.trim()) setPaymentDetail(`Bon Hutang - ${customerName.trim()}`);
                }}
                className={inputCls}
              >
                {(Object.keys(PAYMENT_LABELS) as PaymentType[]).map((p) => (
                  <option key={p} value={p}>
                    {PAYMENT_LABELS[p]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="font-bold text-[#3E2723] block mb-1">Detail Pembayaran</label>
              <input
                type="text"
                value={paymentDetail}
                placeholder="mis. Bank BCA / GoPay"
                onChange={(e) => setPaymentDetail(e.target.value)}
                className={inputCls}
              />
            </div>
            {paymentType === 'tunai' && (
              <>
                <div>
                  <label className="font-bold text-[#3E2723] block mb-1">Uang Diterima (Rp)</label>
                  <input
                    type="number"
                    min={0}
                    disabled={lockedAmounts}
                    value={amountPaid || ''}
                    onChange={(e) => {
                      clearError();
                      setAmountPaid(Number(e.target.value) || 0);
                    }}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="font-bold text-[#3E2723] block mb-1">Kelebihan / Permen (Rp)</label>
                  <input
                    type="number"
                    min={0}
                    disabled={lockedAmounts}
                    value={overpay || ''}
                    onChange={(e) => {
                      clearError();
                      setOverpay(Number(e.target.value) || 0);
                    }}
                    className={inputCls}
                  />
                </div>
                <div className="col-span-2 text-[11px] text-stone-600">
                  Kembalian: <span className="font-bold">{formatIDR(changeAmount)}</span>
                  {amountPaid < grandTotal && (
                    <span className="text-rose-700 font-semibold"> · uang diterima kurang dari total</span>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Info pelanggan */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="font-bold text-[#3E2723] block mb-1">Tipe Order</label>
              <select
                value={orderType}
                onChange={(e) => setOrderType(e.target.value as Transaction['orderType'])}
                className={inputCls}
              >
                {ORDER_TYPES.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="font-bold text-[#3E2723] block mb-1">
                Nama Pelanggan{paymentType === 'hutang' ? ' (wajib)' : ''}
              </label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => {
                  clearError();
                  setCustomerName(e.target.value);
                }}
                className={inputCls}
              />
            </div>
            <div>
              <label className="font-bold text-[#3E2723] block mb-1">No. HP</label>
              <input type="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="font-bold text-[#3E2723] block mb-1">Catatan</label>
              <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} />
            </div>
          </div>

          {/* Persetujuan */}
          <div>
            <label className="font-bold text-[#3E2723] block mb-1">Alasan Koreksi (wajib)</label>
            <input
              type="text"
              placeholder="Contoh: Salah pilih metode bayar / salah jumlah item"
              value={reason}
              onChange={(e) => {
                clearError();
                setReason(e.target.value);
              }}
              className={inputCls}
            />
          </div>
          <div>
            <label className="font-bold text-[#3E2723] flex items-center gap-1.5 mb-1">
              <Lock className="w-3.5 h-3.5" />
              <span>
                PIN Supervisor / Owner
                {can(activeCashier.role, 'editTransaction') ? ' (boleh PIN Anda sendiri)' : ''}
              </span>
            </label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={(e) => {
                clearError();
                setPin(e.target.value);
              }}
              className={`${inputCls} font-mono tracking-widest`}
            />
          </div>

          {tx.editHistory && tx.editHistory.length > 0 && (
            <div className="space-y-1">
              <div className="font-bold text-[#3E2723] uppercase">Riwayat Koreksi</div>
              {tx.editHistory.map((h, i) => (
                <div key={i} className="text-[11px] text-stone-600 border-l-2 border-[#D7CCC8] pl-2">
                  <div className="font-semibold">
                    {new Date(h.at).toLocaleString('id-ID')} · {h.by} — {h.reason}
                  </div>
                  <div>{h.summary}</div>
                </div>
              ))}
            </div>
          )}

          {error && <p className="text-rose-700 font-semibold whitespace-pre-line">{error}</p>}
        </div>

        <div className="p-4 border-t border-[#D7CCC8] flex gap-2">
          <button
            onClick={onClose}
            className="w-1/2 py-2 bg-stone-100 hover:bg-stone-200 text-[#2C2420] border border-[#D7CCC8] font-bold rounded text-xs"
          >
            Kembali
          </button>
          <button
            onClick={handleSave}
            className="w-1/2 py-2 bg-[#3E2723] hover:bg-[#5D4037] text-white font-extrabold rounded text-xs shadow"
          >
            Simpan Koreksi
          </button>
        </div>
      </div>
    </div>
  );
};
