import React, { useState } from 'react';
import {
  Trash2,
  Plus,
  Minus,
  ShoppingBag,
  Tag,
  User,
  Coffee,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { CartItem, StoreSettings } from '../../types';
import { formatIDR } from '../../lib/storage';

interface CartPanelProps {
  cart: CartItem[];
  orderType: 'Dine In' | 'Takeaway' | 'Online / Ojol';
  setOrderType: (type: 'Dine In' | 'Takeaway' | 'Online / Ojol') => void;
  customerName: string;
  setCustomerName: (name: string) => void;
  discountAmount: number;
  setDiscountAmount: (discount: number) => void;
  discountType: 'rp' | 'percent';
  setDiscountType: (type: 'rp' | 'percent') => void;
  storeSettings: StoreSettings;
  onUpdateQty: (cartItemId: string, newQty: number) => void;
  onRemoveItem: (cartItemId: string) => void;
  onClearCart: () => void;
  onCheckout: () => void;
  /** Jika diisi, tombol checkout dinonaktifkan dan alasan ini ditampilkan */
  checkoutBlockedReason?: string | null;
}

export const CartPanel: React.FC<CartPanelProps> = ({
  cart,
  orderType,
  setOrderType,
  customerName,
  setCustomerName,
  discountAmount,
  setDiscountAmount,
  discountType,
  setDiscountType,
  storeSettings,
  onUpdateQty,
  onRemoveItem,
  onClearCart,
  onCheckout,
  checkoutBlockedReason,
}) => {
  const checkoutDisabled = cart.length === 0 || Boolean(checkoutBlockedReason);
  const [showDiscountInput, setShowDiscountInput] = useState(false);

  // Subtotal calculation
  const subtotal = cart.reduce((sum, item) => sum + item.totalPrice, 0);

  // Discount calculation
  let calculatedDiscount = 0;
  if (discountType === 'percent') {
    calculatedDiscount = Math.round((subtotal * (discountAmount || 0)) / 100);
  } else {
    calculatedDiscount = discountAmount || 0;
  }
  calculatedDiscount = Math.min(subtotal, Math.max(0, calculatedDiscount));

  const afterDiscount = subtotal - calculatedDiscount;

  // Tax calculation if enabled
  const taxAmount = storeSettings.enableTax
    ? Math.round((afterDiscount * (storeSettings.taxRatePercent || 0)) / 100)
    : 0;

  const grandTotal = afterDiscount + taxAmount;

  return (
    <div className="bg-white border border-[#D7CCC8] rounded-xl flex flex-col flex-1 h-full min-h-0 shadow-md overflow-hidden text-[#2C2420]">
      {/* Cart Top Title & Header */}
      <div className="shrink-0 p-3.5 bg-[#F9F8F7] border-b border-[#D7CCC8] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShoppingBag className="w-5 h-5 text-[#3E2723]" />
          <h2 className="font-black text-xs uppercase tracking-tight text-[#3E2723]">Pesanan Aktif</h2>
          <span className="bg-[#EFEBE9] text-[#3E2723] border border-[#D7CCC8] px-2 py-0.5 rounded-full text-[10px] font-extrabold">
            {cart.reduce((a, b) => a + b.quantity, 0)} item
          </span>
        </div>

        {cart.length > 0 && (
          <button
            onClick={onClearCart}
            className="text-[10px] text-[#8D6E63] hover:text-[#3E2723] font-bold border border-[#D7CCC8] px-2 py-0.5 rounded hover:bg-stone-100 transition-colors flex items-center gap-1"
          >
            <Trash2 className="w-3 h-3" />
            <span>KOSONGKAN</span>
          </button>
        )}
      </div>
      

      {/* Order Type Tabs & Customer Input */}
      <div className="shrink-0 p-3 bg-white border-b border-[#D7CCC8] space-y-2">
        {/* Order Type Selection */}
        <div className="grid grid-cols-3 gap-1 p-0.5 bg-[#F9F8F7] rounded-lg border border-[#D7CCC8] text-xs">
          {(['Dine In', 'Takeaway', 'Online / Ojol'] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setOrderType(type)}
              className={`py-1 px-1.5 rounded font-bold transition-all text-[10px] text-center uppercase tracking-tight ${
                orderType === type
                  ? 'bg-[#3E2723] text-white shadow-sm'
                  : 'text-[#5D4037] hover:bg-stone-100'
              }`}
            >
              {type === 'Dine In' ? '☕ Dine In' : type === 'Takeaway' ? '🛍️ Dibungkus' : '🛵 Ojol'}
            </button>
          ))}
        </div>

        {/* Customer / Table Name Input */}
        <div className="relative">
          <User className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-2.5" />
          <input
            type="text"
            placeholder="Nama Pelanggan / No. Meja (opsional)..."
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            className="w-full bg-[#F9F8F7] border border-[#D7CCC8] text-[#2C2420] rounded-lg pl-8 pr-2 py-1.5 text-xs focus:outline-none focus:border-[#3E2723]"
          />
        </div>
      </div>

      {/* Cart Items Scroll List */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2 divide-y divide-[#EFEBE9]">
        {cart.length === 0 ? (
          <div className="h-full min-h-[200px] flex flex-col items-center justify-center text-center p-6 text-stone-400">
            <div className="w-12 h-12 rounded-full bg-[#F5F5F5] border border-[#D7CCC8] flex items-center justify-center mb-2 text-[#3E2723]">
              <Coffee className="w-6 h-6 opacity-60 stroke-[1.5]" />
            </div>
            <p className="font-bold text-[#3E2723] text-xs uppercase tracking-tight">Keranjang Kosong</p>
            <p className="text-[11px] text-stone-500 mt-0.5 max-w-[180px]">
              Klik menu kopi atau makanan di katalog untuk menambahkan.
            </p>
          </div>
        ) : (
          cart.map((item) => (
            <div key={item.cartItemId} className="pt-2 first:pt-0 flex flex-col gap-1">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h4 className="font-bold text-xs text-[#2C2420] leading-tight">
                    {item.product.name}
                  </h4>

                  {/* Selected Options Badges */}
                  {item.selectedOptions && item.selectedOptions.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {item.selectedOptions.map((opt, idx) => (
                        <span
                          key={idx}
                          className="bg-[#EFEBE9] text-[#5D4037] text-[9px] px-1 py-0.5 rounded border border-[#D7CCC8]"
                        >
                          {opt.groupName}: {opt.choiceLabel}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Notes */}
                  {item.notes && (
                    <p className="text-[10px] text-amber-800 italic mt-0.5">
                      Catatan: "{item.notes}"
                    </p>
                  )}

                  <div className="text-[11px] font-semibold text-[#5D4037] mt-0.5">
                    {formatIDR(item.unitPrice)}
                  </div>
                </div>

                {/* Quantity Controls & Delete */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <div className="flex items-center gap-1 bg-[#F5F5F5] border border-[#D7CCC8] rounded p-0.5">
                    <button
                      onClick={() => onUpdateQty(item.cartItemId, item.quantity - 1)}
                      className="w-5 h-5 rounded bg-white text-[#3E2723] hover:bg-stone-200 border border-[#D7CCC8] flex items-center justify-center text-xs font-bold"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="w-5 text-center font-black text-xs text-[#3E2723]">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => onUpdateQty(item.cartItemId, item.quantity + 1)}
                      className="w-5 h-5 rounded bg-[#3E2723] text-white hover:bg-[#5D4037] flex items-center justify-center text-xs font-bold"
                    >
                      <Plus className="w-3 h-3 stroke-[3]" />
                    </button>
                  </div>

                  <button
                    onClick={() => onRemoveItem(item.cartItemId)}
                    className="p-1 text-stone-400 hover:text-rose-600 rounded transition-colors"
                    title="Hapus Item"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Total Price for line item */}
              <div className="text-right text-xs font-extrabold text-[#3E2723]">
                Total: {formatIDR(item.totalPrice)}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Cart Calculation Footer & Checkout */}
      <div className="shrink-0 mt-auto p-3 bg-[#F9F8F7] border-t border-[#D7CCC8] space-y-2">
        {/* Discount Toggle & Input */}
        <div>
          {!showDiscountInput ? (
            <button
              onClick={() => setShowDiscountInput(true)}
              className="text-[11px] text-[#5D4037] hover:text-[#3E2723] font-bold flex items-center gap-1"
            >
              <Tag className="w-3 h-3" />
              <span>
                {discountAmount > 0
                  ? `Diskon: ${discountType === 'percent' ? `${discountAmount}%` : formatIDR(discountAmount)}`
                  : '+ Tambah Diskon'}
              </span>
            </button>
          ) : (
            <div className="bg-white p-2 rounded border border-[#D7CCC8] space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-[#3E2723] flex items-center gap-1">
                  <Tag className="w-3 h-3 text-[#3E2723]" /> Diskon Transaksi
                </span>
                <button
                  onClick={() => setShowDiscountInput(false)}
                  className="text-[10px] text-stone-500 hover:text-stone-800"
                >
                  Tutup
                </button>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex border border-[#D7CCC8] rounded overflow-hidden text-xs shrink-0">
                  <button
                    onClick={() => setDiscountType('rp')}
                    className={`px-2 py-0.5 font-bold ${
                      discountType === 'rp' ? 'bg-[#3E2723] text-white' : 'bg-stone-100 text-stone-700'
                    }`}
                  >
                    Rp
                  </button>
                  <button
                    onClick={() => setDiscountType('percent')}
                    className={`px-2 py-0.5 font-bold ${
                      discountType === 'percent' ? 'bg-[#3E2723] text-white' : 'bg-stone-100 text-stone-700'
                    }`}
                  >
                    %
                  </button>
                </div>

                <input
                  type="number"
                  placeholder={discountType === 'rp' ? 'Nominal' : 'Persen'}
                  value={discountAmount || ''}
                  onChange={(e) => setDiscountAmount(Number(e.target.value))}
                  className="w-full bg-white border border-[#D7CCC8] text-[#2C2420] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#3E2723]"
                />
              </div>
            </div>
          )}
        </div>

        {/* Breakdown */}
        <div className="space-y-1 text-xs text-[#2C2420] border-t border-[#D7CCC8] pt-2">
          <div className="flex justify-between">
            <span className="text-gray-500 uppercase text-[10px]">Subtotal</span>
            <span className="font-bold">{formatIDR(subtotal)}</span>
          </div>

          {calculatedDiscount > 0 && (
            <div className="flex justify-between text-rose-700">
              <span className="uppercase text-[10px]">Diskon</span>
              <span className="font-bold">-{formatIDR(calculatedDiscount)}</span>
            </div>
          )}

          {storeSettings.enableTax && (
            <div className="flex justify-between">
              <span className="text-gray-500 uppercase text-[10px]">Pajak ({storeSettings.taxRatePercent}%)</span>
              <span className="font-bold">{formatIDR(taxAmount)}</span>
            </div>
          )}

          <div className="flex justify-between items-center text-sm font-black text-[#3E2723] border-t border-[#D7CCC8] pt-1.5 mt-1">
            <span className="uppercase">TOTAL</span>
            <span className="text-lg font-black text-[#3E2723]">{formatIDR(grandTotal)}</span>
          </div>
        </div>

        {/* Checkout Button */}
        {checkoutBlockedReason && cart.length > 0 && (
          <p className="text-[11px] font-semibold text-rose-800 bg-rose-50 border border-rose-200 rounded px-2 py-1.5 whitespace-pre-line">
            {checkoutBlockedReason}
          </p>
        )}
        <button
          onClick={onCheckout}
          disabled={checkoutDisabled}
          className={`w-full py-3.5 bg-[#2E7D32] hover:bg-[#1B5E20] text-white font-black text-sm rounded shadow-lg transition-all flex items-center justify-center gap-2 ${
            checkoutDisabled ? 'opacity-50 cursor-not-allowed' : 'active:scale-[0.99]'
          }`}
        >
          <span>COMPLETE TRANSACTION</span>
          <ChevronRight className="w-4 h-4 stroke-[3]" />
        </button>
      </div>
    </div>
  );
};
