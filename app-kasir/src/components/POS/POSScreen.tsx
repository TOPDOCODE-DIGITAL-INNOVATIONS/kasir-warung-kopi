import React, { useState, useEffect, useRef } from 'react';
import { Search, Coffee, Lock, AlertTriangle, X } from 'lucide-react';
import { Product, Category, CartItem, SelectedOption, Cashier, Shift, StoreSettings, Transaction, DraftOrder } from '../../types';
import {
  getProducts,
  getCategories,
  saveTransaction,
  getStockIssues,
  getDrafts,
  saveDraft,
  deleteDraft,
  draftItemsForCart,
  POS_UPDATE_EVENT,
} from '../../lib/storage';
import { DraftListModal, SaveDraftModal } from './DraftModals';
import { shouldAutoPrint } from '../../lib/printer';
import { ProductCard } from './ProductCard';
import { OptionModal } from './OptionModal';
import { CartPanel } from './CartPanel';
import { PaymentModal } from './PaymentModal';
import { ReceiptModal } from './ReceiptModal';

/** Kunci baris keranjang: produk + opsi + catatan yang sama digabung dalam satu baris. */
function makeCartItemId(productId: string, selectedOptions: SelectedOption[], notes: string): string {
  const optionsKey = selectedOptions.map((o) => `${o.groupName}:${o.choiceLabel}`).join('|');
  return `${productId}-${optionsKey}-${notes.trim()}`;
}

interface POSScreenProps {
  activeCashier: Cashier;
  activeShift: Shift | null;
  onOpenShiftModal: () => void;
  storeSettings: StoreSettings;
  cart: CartItem[];
  setCart: React.Dispatch<React.SetStateAction<CartItem[]>>;
  activeDraftId: string | null;
  setActiveDraftId: (id: string | null) => void;
}

export const POSScreen: React.FC<POSScreenProps> = ({
  activeCashier,
  activeShift,
  onOpenShiftModal,
  storeSettings,
  cart,
  setCart,
  activeDraftId,
  setActiveDraftId,
}) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Selected Product for Option Modal
  const [selectedProductForOptions, setSelectedProductForOptions] = useState<Product | null>(null);

  // Cart Order Metadata
  const [orderType, setOrderType] = useState<'Dine In' | 'Takeaway' | 'Online / Ojol'>('Dine In');
  const [customerName, setCustomerName] = useState('');
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [discountType, setDiscountType] = useState<'rp' | 'percent'>('rp');

  // Checkout Modals State
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [completedTransaction, setCompletedTransaction] = useState<Transaction | null>(null);

  // Pesan peringatan singkat (stok habis, dll.)
  const [notice, setNotice] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Draf pesanan (bayar nanti)
  const [drafts, setDrafts] = useState<DraftOrder[]>(() => getDrafts());
  const [isDraftListOpen, setIsDraftListOpen] = useState(false);
  const [isSaveDraftOpen, setIsSaveDraftOpen] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const activeDraftRef = useRef<string | null>(activeDraftId);
  activeDraftRef.current = activeDraftId;
  const activeDraft = drafts.find((d) => d.id === activeDraftId) ?? null;

  // Kembali ke tab POS dengan draf terbuka: pulihkan info pesanannya.
  useEffect(() => {
    const d = activeDraftId ? getDrafts().find((x) => x.id === activeDraftId) : null;
    if (d) {
      setOrderType(d.orderType);
      setCustomerName(d.label);
      setDiscountAmount(d.discountAmount);
      setDiscountType(d.discountType);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const load = () => {
      setProducts(getProducts());
      setCategories(getCategories());
      const list = getDrafts();
      setDrafts(list);
      // Draf yang sedang dibuka sudah dibayar/dihapus di perangkat lain
      const openId = activeDraftRef.current;
      if (openId && !list.some((d) => d.id === openId)) {
        activeDraftRef.current = null;
        setActiveDraftId(null);
        setNotice('Draf ini sudah dibayar atau dihapus di perangkat lain. Periksa keranjang sebelum melanjutkan.');
      }
    };
    load();
    // Muat ulang saat stok/menu berubah dari layar lain
    window.addEventListener(POS_UPDATE_EVENT, load);
    return () => window.removeEventListener(POS_UPDATE_EVENT, load);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  useEffect(() => {
    if (!successNotice) return;
    const t = setTimeout(() => setSuccessNotice(null), 3000);
    return () => clearTimeout(t);
  }, [successNotice]);

  /** Jumlah produk ini di keranjang (semua varian opsi), opsional tanpa satu baris tertentu. */
  const qtyInCart = (productId: string, excludeCartItemId?: string) =>
    cart
      .filter((it) => it.product.id === productId && it.cartItemId !== excludeCartItemId)
      .reduce((sum, it) => sum + it.quantity, 0);

  /** Cek stok terbaru; tampilkan peringatan & kembalikan false bila melebihi stok. */
  const ensureStock = (productId: string, requestedTotal: number): boolean => {
    const latest = getProducts().find((p) => p.id === productId);
    if (!latest) return false;
    if (latest.stock >= 0 && requestedTotal > latest.stock) {
      setNotice(
        latest.stock === 0
          ? `Stok ${latest.name} habis.`
          : `Stok ${latest.name} hanya tersisa ${latest.stock}.`
      );
      return false;
    }
    return true;
  };

  const handleSelectProduct = (product: Product) => {
    // If product has options, open option modal
    if (product.options && product.options.length > 0) {
      setSelectedProductForOptions(product);
    } else {
      // Direct add to cart
      handleAddToCart(product, [], '', 1);
    }
  };

  const handleAddToCart = (
    product: Product,
    selectedOptions: SelectedOption[],
    notes: string,
    quantity: number
  ) => {
    if (!ensureStock(product.id, qtyInCart(product.id) + quantity)) return;

    const extrasSum = selectedOptions.reduce((acc, opt) => acc + opt.extraPrice, 0);
    const unitPrice = product.price + extrasSum;

    const cartItemId = makeCartItemId(product.id, selectedOptions, notes);

    setCart((prev) => {
      const existingIdx = prev.findIndex((item) => item.cartItemId === cartItemId);
      if (existingIdx !== -1) {
        const updated = [...prev];
        const newQty = updated[existingIdx].quantity + quantity;
        updated[existingIdx] = {
          ...updated[existingIdx],
          quantity: newQty,
          totalPrice: updated[existingIdx].unitPrice * newQty,
        };
        return updated;
      } else {
        const newItem: CartItem = {
          cartItemId,
          product,
          quantity,
          selectedOptions,
          notes: notes.trim() || undefined,
          unitPrice,
          totalPrice: unitPrice * quantity,
        };
        return [...prev, newItem];
      }
    });
  };

  const handleUpdateCartQty = (cartItemId: string, newQty: number) => {
    if (newQty <= 0) {
      handleRemoveCartItem(cartItemId);
      return;
    }

    const item = cart.find((it) => it.cartItemId === cartItemId);
    if (item && newQty > item.quantity) {
      if (!ensureStock(item.product.id, qtyInCart(item.product.id, cartItemId) + newQty)) return;
    }

    setCart((prev) =>
      prev.map((item) =>
        item.cartItemId === cartItemId
          ? { ...item, quantity: newQty, totalPrice: item.unitPrice * newQty }
          : item
      )
    );
  };

  /** Ubah catatan item di keranjang. Jika jadi sama persis dengan baris lain, keduanya digabung. */
  const handleUpdateCartNotes = (cartItemId: string, notes: string) => {
    setCart((prev) => {
      const item = prev.find((it) => it.cartItemId === cartItemId);
      if (!item) return prev;
      const clean = notes.trim();
      const newId = makeCartItemId(item.product.id, item.selectedOptions, clean);
      if (newId === cartItemId && (item.notes ?? '') === clean) return prev;
      const twin = prev.find((it) => it.cartItemId === newId && it !== item);
      if (twin) {
        const qty = twin.quantity + item.quantity;
        return prev
          .filter((it) => it !== item)
          .map((it) => (it === twin ? { ...it, quantity: qty, totalPrice: it.unitPrice * qty } : it));
      }
      return prev.map((it) =>
        it === item ? { ...it, cartItemId: newId, notes: clean || undefined } : it
      );
    });
  };

  const handleRemoveCartItem = (cartItemId: string) => {
    setCart((prev) => prev.filter((item) => item.cartItemId !== cartItemId));
  };

  const handleClearCart = () => {
    setCart([]);
    setCustomerName('');
    setDiscountAmount(0);
    // Draf tetap tersimpan; keranjang hanya dilepas dari draf.
    activeDraftRef.current = null;
    setActiveDraftId(null);
  };

  const handleSaveDraft = (label: string, notes: string) => {
    try {
      const saved = saveDraft(
        {
          id: activeDraftId ?? undefined,
          label,
          notes,
          orderType,
          items: cart,
          discountAmount,
          discountType,
        },
        activeCashier.name
      );
      setIsSaveDraftOpen(false);
      setDraftError(null);
      handleClearCart();
      setOrderType('Dine In');
      setSuccessNotice(`Draf "${saved.label}" tersimpan.`);
    } catch (err: any) {
      setDraftError(err?.message || 'Draf gagal disimpan.');
    }
  };

  const handleOpenDraft = (d: DraftOrder) => {
    if (d.id !== activeDraftId && cart.length > 0) {
      const ok = window.confirm(
        activeDraftId
          ? 'Perubahan draf yang sedang dibuka belum disimpan akan hilang. Buka draf lain?'
          : 'Keranjang saat ini akan diganti dengan draf ini. Lanjutkan?'
      );
      if (!ok) return;
    }
    setCart(draftItemsForCart(d));
    setOrderType(d.orderType);
    setCustomerName(d.label);
    setDiscountAmount(d.discountAmount);
    setDiscountType(d.discountType);
    activeDraftRef.current = d.id;
    setActiveDraftId(d.id);
    setIsDraftListOpen(false);
  };

  const handleDeleteDraft = (d: DraftOrder) => {
    if (!window.confirm(`Hapus draf "${d.label}"? Pesanan ini tidak akan tercatat sebagai penjualan.`)) return;
    if (d.id === activeDraftId) {
      activeDraftRef.current = null;
      setActiveDraftId(null);
    }
    deleteDraft(d.id);
  };

  // Subtotal & GrandTotal calculation for payment modal
  const subtotal = cart.reduce((sum, item) => sum + item.totalPrice, 0);
  let calculatedDiscount = 0;
  if (discountType === 'percent') {
    calculatedDiscount = Math.round((subtotal * (discountAmount || 0)) / 100);
  } else {
    calculatedDiscount = discountAmount || 0;
  }
  calculatedDiscount = Math.min(subtotal, Math.max(0, calculatedDiscount));
  const afterDiscount = subtotal - calculatedDiscount;
  const taxAmount = storeSettings.enableTax
    ? Math.round((afterDiscount * (storeSettings.taxRatePercent || 0)) / 100)
    : 0;
  const grandTotal = afterDiscount + taxAmount;

  const handlePaymentSuccess = (transaction: Transaction) => {
    try {
      const saved = saveTransaction(transaction);
      // Draf yang dibayar dihapus (perangkat lain ikut menghapusnya saat sync).
      if (activeDraftId) {
        const paidDraftId = activeDraftId;
        activeDraftRef.current = null;
        setActiveDraftId(null);
        deleteDraft(paidDraftId);
      }
      setIsPaymentModalOpen(false);
      setCompletedTransaction(saved);
      setProducts(getProducts());
      // Transaksi sudah tersimpan: kosongkan keranjang sekarang juga, supaya menutup struk
      // tidak menyisakan pesanan lama (yang bisa terbayar dua kali).
      handleClearCart();
      setOrderType('Dine In');
    } catch (err: any) {
      setIsPaymentModalOpen(false);
      setNotice(err?.message || 'Transaksi gagal disimpan.');
    }
  };

  // Alasan checkout diblokir: belum buka shift atau stok tidak cukup
  const stockIssues = getStockIssues(cart, products);
  const checkoutBlockedReason = !activeShift
    ? 'Shift belum dibuka. Buka shift terlebih dahulu.'
    : stockIssues.length > 0
      ? stockIssues.join('\n')
      : null;

  const handleNewTransaction = () => {
    setCompletedTransaction(null);
    handleClearCart();
  };

  // Filter products by category and search
  const filteredProducts = products.filter((p) => {
    const matchesCat = selectedCategoryId === 'all' || p.categoryId === selectedCategoryId;
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCat && matchesSearch;
  });

  return (
    <div className="max-w-7xl w-full mx-auto p-3 sm:p-4 lg:p-5 flex flex-col gap-3 flex-1 min-h-0 lg:h-full lg:overflow-hidden">
      {/* Banner: shift belum dibuka */}
      {!activeShift && (
        <div className="shrink-0 bg-amber-50 border border-amber-300 text-amber-900 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Lock className="w-5 h-5 shrink-0" />
            <div>
              <p className="font-bold text-sm">Shift belum dibuka</p>
              <p className="text-xs">
                Isi modal awal laci terlebih dahulu supaya setiap penjualan tercatat di rekap shift.
              </p>
            </div>
          </div>
          <button
            onClick={onOpenShiftModal}
            className="px-3 py-2 bg-[#2E7D32] hover:bg-[#1B5E20] text-white font-bold text-xs rounded uppercase shadow"
          >
            Buka Shift
          </button>
        </div>
      )}

      {successNotice && (
        <div
          role="status"
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 max-w-sm w-[calc(100%-2rem)] bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-xl px-3 py-2.5"
        >
          {successNotice}
        </div>
      )}

      {/* Toast peringatan */}
      {notice && (
        <div
          role="alert"
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 max-w-sm w-[calc(100%-2rem)] bg-rose-700 text-white text-xs font-semibold rounded-lg shadow-xl px-3 py-2.5 flex items-start gap-2 whitespace-pre-line"
        >
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span className="flex-1">{notice}</span>
          <button onClick={() => setNotice(null)} aria-label="Tutup">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 min-h-0">
        {/* Left Column: Category Tabs & Product Catalog (7 or 8 columns) */}
        <div className="lg:col-span-7 xl:col-span-8 flex flex-col gap-3 min-h-0 lg:h-full lg:overflow-hidden">
          {/* Category Filter Chips & Search Bar */}
          <div className="shrink-0 bg-[#EFEBE9] border border-[#D7CCC8] p-3 rounded-xl space-y-2.5 shadow-sm">
            {/* Search Box */}
            <div className="relative">
              <Search className="w-4 h-4 text-stone-500 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Cari kopi, makanan, atau snack..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-white border border-[#D7CCC8] text-[#2C2420] rounded-lg pl-9 pr-3 py-1.5 text-xs focus:outline-none focus:border-[#3E2723] font-medium"
              />
            </div>

            {/* Categories Horizontal Scroll Bar */}
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-0.5">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategoryId(cat.id)}
                  className={`px-3 py-1.5 rounded-lg font-bold text-xs uppercase tracking-tight whitespace-nowrap transition-all ${
                    selectedCategoryId === cat.id
                      ? 'bg-[#3E2723] text-white shadow'
                      : 'bg-white text-[#5D4037] border border-[#D7CCC8] hover:bg-stone-50'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>

          {/* Product Grid */}
          <div className="flex-1 min-h-0 overflow-y-auto pr-1 pb-1">
            {filteredProducts.length === 0 ? (
              <div className="bg-white border border-[#D7CCC8] rounded-xl p-8 text-center text-stone-500">
                <Coffee className="w-10 h-10 mx-auto mb-2 opacity-40 text-[#3E2723]" />
                <p className="font-bold text-sm text-[#3E2723]">Menu tidak ditemukan</p>
                <p className="text-xs text-stone-500 mt-1">Coba gunakan kata kunci lain atau pilih kategori lain.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5 sm:gap-3">
                {filteredProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    onSelect={handleSelectProduct}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Order Cart Panel (4 or 5 columns) */}
        <div className="lg:col-span-5 xl:col-span-4 min-h-0 lg:h-full flex flex-col overflow-hidden">
          <CartPanel
            cart={cart}
            orderType={orderType}
            setOrderType={setOrderType}
            customerName={customerName}
            setCustomerName={setCustomerName}
            discountAmount={discountAmount}
            setDiscountAmount={setDiscountAmount}
            discountType={discountType}
            setDiscountType={setDiscountType}
            storeSettings={storeSettings}
            onUpdateQty={handleUpdateCartQty}
            onRemoveItem={handleRemoveCartItem}
            onUpdateNotes={handleUpdateCartNotes}
            onClearCart={handleClearCart}
            onCheckout={() => setIsPaymentModalOpen(true)}
            checkoutBlockedReason={checkoutBlockedReason}
            activeDraftLabel={activeDraft?.label ?? null}
            draftCount={drafts.length}
            onOpenDrafts={() => setIsDraftListOpen(true)}
            onSaveDraft={() => {
              setDraftError(null);
              setIsSaveDraftOpen(true);
            }}
          />
        </div>
      </div>

      {isDraftListOpen && (
        <DraftListModal
          drafts={drafts}
          activeDraftId={activeDraftId}
          onOpen={handleOpenDraft}
          onDelete={handleDeleteDraft}
          onClose={() => setIsDraftListOpen(false)}
        />
      )}

      {isSaveDraftOpen && (
        <SaveDraftModal
          initialLabel={customerName || activeDraft?.label || ''}
          initialNotes={activeDraft?.notes}
          isUpdate={!!activeDraft}
          error={draftError}
          onSave={handleSaveDraft}
          onClose={() => setIsSaveDraftOpen(false)}
        />
      )}

      {/* Option Selector Modal */}
      {selectedProductForOptions && (
        <OptionModal
          product={selectedProductForOptions}
          onClose={() => setSelectedProductForOptions(null)}
          onAddToCart={handleAddToCart}
        />
      )}

      {/* Payment Gateway-free Modal */}
      {isPaymentModalOpen && (
        <PaymentModal
          grandTotal={grandTotal}
          subtotal={subtotal}
          discountAmount={calculatedDiscount}
          taxAmount={taxAmount}
          orderType={orderType}
          customerName={customerName}
          cartItems={cart}
          activeCashier={activeCashier}
          storeSettings={storeSettings}
          onClose={() => setIsPaymentModalOpen(false)}
          onPaymentSuccess={handlePaymentSuccess}
        />
      )}

      {/* Completed Thermal Receipt Modal */}
      {completedTransaction && (
        <ReceiptModal
          transaction={completedTransaction}
          storeSettings={storeSettings}
          onClose={() => setCompletedTransaction(null)}
          onNewTransaction={handleNewTransaction}
          autoPrint={shouldAutoPrint(storeSettings)}
        />
      )}
    </div>
  );
};
