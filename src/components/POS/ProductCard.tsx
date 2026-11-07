import React from 'react';
import { Product } from '../../types';
import { formatIDR } from '../../lib/storage';
import { Coffee, CupSoda, Utensils, Cookie, Plus } from 'lucide-react';

interface ProductCardProps {
  product: Product;
  onSelect: (product: Product) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({ product, onSelect }) => {
  const isOutOfStock = product.stock === 0 || !product.isAvailable;

  const renderDefaultIcon = () => {
    switch (product.categoryId) {
      case 'kopi':
        return <Coffee className="w-8 h-8 opacity-80" />;
      case 'non-kopi':
        return <CupSoda className="w-8 h-8 opacity-80" />;
      case 'makanan':
        return <Utensils className="w-8 h-8 opacity-80" />;
      case 'camilan':
        return <Cookie className="w-8 h-8 opacity-80" />;
      default:
        return <Coffee className="w-8 h-8 opacity-80" />;
    }
  };

  return (
    <div
      onClick={() => !isOutOfStock && onSelect(product)}
      className={`group relative bg-white border border-[#D7CCC8] rounded-lg p-3 flex flex-col justify-between transition-all duration-200 shadow-sm ${
        isOutOfStock
          ? 'opacity-50 cursor-not-allowed bg-stone-100'
          : 'hover:border-[#3E2723] hover:shadow-md cursor-pointer'
      }`}
    >
      {/* Top Graphic Header / Badge */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div
          className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm transition-transform group-hover:scale-105 ${
            product.colorBg || 'bg-[#F5F5F5] text-[#3E2723]'
          }`}
        >
          {renderDefaultIcon()}
        </div>

        {/* Stock Badge */}
        <div className="text-right">
          {product.stock === -1 ? (
            <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#EFEBE9] text-[#5D4037] border border-[#D7CCC8]">
              Stok Tersedia
            </span>
          ) : product.stock === 0 ? (
            <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
              Habis
            </span>
          ) : (
            <span
              className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                product.stock < 10
                  ? 'bg-amber-100 text-amber-900 border-amber-300'
                  : 'bg-[#EFEBE9] text-[#5D4037] border border-[#D7CCC8]'
              }`}
            >
              Stok: {product.stock}
            </span>
          )}
        </div>
      </div>

      {/* Product Information */}
      <div className="space-y-0.5 mb-2">
        <h4 className="font-bold text-xs uppercase text-[#3E2723] group-hover:text-[#5D4037] transition-colors line-clamp-1">
          {product.name}
        </h4>
        {product.description && (
          <p className="text-[10px] text-gray-500 line-clamp-2 leading-tight">
            {product.description}
          </p>
        )}
      </div>

      {/* Footer Price & Add Button */}
      <div className="flex items-center justify-between border-t border-[#EFEBE9] pt-2 mt-auto">
        <div>
          <div className="text-sm font-black text-[#5D4037]">
            {formatIDR(product.price)}
          </div>
          {product.options && product.options.length > 0 && (
            <div className="text-[9px] text-stone-500 font-medium">+ Custom Option</div>
          )}
        </div>

        <button
          type="button"
          disabled={isOutOfStock}
          className={`p-1.5 rounded transition-all ${
            isOutOfStock
              ? 'bg-stone-200 text-stone-400'
              : 'bg-[#3E2723] group-hover:bg-[#5D4037] text-white font-bold shadow'
          }`}
        >
          <Plus className="w-3.5 h-3.5 stroke-[3]" />
        </button>
      </div>
    </div>
  );
};
