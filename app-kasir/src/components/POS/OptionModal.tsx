import React, { useState } from 'react';
import { X, Plus, Coffee, Check } from 'lucide-react';
import { Product, SelectedOption } from '../../types';
import { formatIDR } from '../../lib/storage';

interface OptionModalProps {
  product: Product;
  onClose: () => void;
  onAddToCart: (product: Product, options: SelectedOption[], notes: string, quantity: number) => void;
}

export const OptionModal: React.FC<OptionModalProps> = ({ product, onClose, onAddToCart }) => {
  const [quantity, setQuantity] = useState(1);
  const [itemNotes, setItemNotes] = useState('');
  
  // Default pick first choice of each option group if available
  const [selectedChoices, setSelectedChoices] = useState<Record<string, { choiceLabel: string; extraPrice: number }>>(() => {
    const initial: Record<string, { choiceLabel: string; extraPrice: number }> = {};
    if (product.options) {
      product.options.forEach((opt) => {
        if (opt.choices.length > 0) {
          initial[opt.name] = {
            choiceLabel: opt.choices[0].label,
            extraPrice: opt.choices[0].extraPrice,
          };
        }
      });
    }
    return initial;
  });

  const handleSelectOption = (groupName: string, choiceLabel: string, extraPrice: number) => {
    setSelectedChoices((prev) => ({
      ...prev,
      [groupName]: { choiceLabel, extraPrice },
    }));
  };

  // Calculate total unit price including extras
  const extrasSum = (Object.values(selectedChoices) as { choiceLabel: string; extraPrice: number }[]).reduce((acc, val) => acc + val.extraPrice, 0);
  const unitPrice = product.price + extrasSum;
  const grandTotal = unitPrice * quantity;

  const handleConfirm = () => {
    const formattedOptions: SelectedOption[] = (Object.entries(selectedChoices) as [string, { choiceLabel: string; extraPrice: number }][]).map(
      ([groupName, choice]) => ({
        groupName,
        choiceLabel: choice.choiceLabel,
        extraPrice: choice.extraPrice,
      })
    );
    onAddToCart(product, formattedOptions, itemNotes, quantity);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-[#D7CCC8] text-[#2C2420] rounded-xl max-w-md w-full overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-3.5 bg-[#3E2723] text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#D7CCC8] text-[#3E2723] flex items-center justify-center font-bold">
              <Coffee className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white leading-tight uppercase tracking-tight">{product.name}</h3>
              <p className="text-xs text-[#D7CCC8] font-medium">{formatIDR(product.price)} / porsi</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-4 overflow-y-auto space-y-3 flex-1 bg-[#F9F8F7]">
          {product.description && (
            <p className="text-xs text-stone-600 bg-white p-2.5 rounded border border-[#D7CCC8]">
              {product.description}
            </p>
          )}

          {/* Render Options Groups */}
          {product.options && product.options.length > 0 ? (
            product.options.map((optGroup) => (
              <div key={optGroup.name} className="space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-[#3E2723]">
                  {optGroup.name}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {optGroup.choices.map((choice) => {
                    const isSelected =
                      selectedChoices[optGroup.name]?.choiceLabel === choice.label;
                    return (
                      <button
                        key={choice.label}
                        type="button"
                        onClick={() =>
                          handleSelectOption(optGroup.name, choice.label, choice.extraPrice)
                        }
                        className={`p-2 rounded text-xs font-medium border text-left transition-all flex items-center justify-between ${
                          isSelected
                            ? 'bg-[#3E2723] border-[#3E2723] text-white font-bold'
                            : 'bg-white border-[#D7CCC8] text-[#2C2420] hover:bg-stone-50'
                        }`}
                      >
                        <div>
                          <div>{choice.label}</div>
                          {choice.extraPrice > 0 && (
                            <div className={`text-[10px] ${isSelected ? 'text-[#D7CCC8]' : 'text-[#5D4037]'}`}>
                              +{formatIDR(choice.extraPrice)}
                            </div>
                          )}
                        </div>
                        {isSelected && <Check className="w-4 h-4 text-white shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          ) : (
            <p className="text-xs text-stone-500 italic">Tidak ada varian tambahan untuk produk ini.</p>
          )}

          {/* Item Notes */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold uppercase tracking-wider text-[#3E2723]">
              Catatan Pesanan (Opsional)
            </label>
            <input
              type="text"
              placeholder="Contoh: Tanpa es, sedikit manis..."
              value={itemNotes}
              onChange={(e) => setItemNotes(e.target.value)}
              className="w-full bg-white border border-[#D7CCC8] text-[#2C2420] rounded px-3 py-1.5 text-xs focus:outline-none focus:border-[#3E2723]"
            />
          </div>

          {/* Quantity Controls */}
          <div className="flex items-center justify-between bg-white p-3 rounded border border-[#D7CCC8]">
            <span className="text-xs font-bold text-[#3E2723] uppercase">Jumlah Porsi</span>
            <div className="flex items-center gap-3 bg-[#F5F5F5] border border-[#D7CCC8] rounded px-2 py-1">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="w-6 h-6 rounded bg-white text-[#3E2723] hover:bg-stone-200 border border-[#D7CCC8] flex items-center justify-center font-bold text-sm"
              >
                -
              </button>
              <span className="font-black text-sm text-[#3E2723] w-6 text-center">
                {quantity}
              </span>
              <button
                type="button"
                onClick={() => setQuantity((q) => q + 1)}
                className="w-6 h-6 rounded bg-[#3E2723] text-white font-bold flex items-center justify-center text-sm hover:bg-[#5D4037]"
              >
                +
              </button>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-3.5 bg-[#F9F8F7] border-t border-[#D7CCC8] flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">Subtotal Item</div>
            <div className="text-base font-black text-[#3E2723]">{formatIDR(grandTotal)}</div>
          </div>

          <button
            onClick={handleConfirm}
            className="flex-1 max-w-[200px] bg-[#3E2723] hover:bg-[#5D4037] text-white font-bold py-2.5 px-3 rounded shadow transition-all flex items-center justify-center gap-2 text-xs uppercase"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>Tambah Ke Cart</span>
          </button>
        </div>
      </div>
    </div>
  );
};
