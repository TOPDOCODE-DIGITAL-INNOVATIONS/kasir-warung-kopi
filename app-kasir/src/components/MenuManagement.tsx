import React, { useState } from 'react';
import {
  Plus,
  Edit2,
  Trash2,
  UtensilsCrossed,
  Search,
  Check,
  X,
  Coffee,
  Package,
} from 'lucide-react';
import { RupiahInput } from './RupiahInput';
import { Category, Product, ProductOption } from '../types';
import {
  getProducts,
  saveProducts,
  getCategories,
  saveCategories,
  formatIDR,
} from '../lib/storage';

export const MenuManagement: React.FC = () => {
  const [products, setProducts] = useState<Product[]>(getProducts());
  const [categories, setCategories] = useState<Category[]>(getCategories());
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Form Fields
  const [formData, setFormData] = useState<{
    name: string;
    categoryId: string;
    price: number;
    costPrice: number;
    stock: number;
    isAvailable: boolean;
    description: string;
    options: ProductOption[];
  }>({
    name: '',
    categoryId: 'kopi',
    price: 10000,
    costPrice: 5000,
    stock: 100,
    isAvailable: true,
    description: '',
    options: [],
  });

  const handleOpenAddModal = () => {
    setEditingProduct(null);
    setFormData({
      name: '',
      categoryId: 'kopi',
      price: 12000,
      costPrice: 5000,
      stock: 100,
      isAvailable: true,
      description: '',
      options: [
        {
          name: 'Suhu',
          choices: [
            { label: 'Es / Iced', extraPrice: 0 },
            { label: 'Panas / Hot', extraPrice: 0 },
          ],
        },
      ],
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (product: Product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      categoryId: product.categoryId,
      price: product.price,
      costPrice: product.costPrice || 0,
      stock: product.stock,
      isAvailable: product.isAvailable,
      description: product.description || '',
      options: product.options ? [...product.options] : [],
    });
    setIsModalOpen(true);
  };

  const handleDeleteProduct = (id: string) => {
    if (confirm('Yakin ingin menghapus menu ini dari katalog?')) {
      const updated = products.filter((p) => p.id !== id);
      saveProducts(updated);
      setProducts(updated);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    if (editingProduct) {
      // Update existing
      const updated = products.map((p) =>
        p.id === editingProduct.id
          ? {
              ...p,
              name: formData.name.trim(),
              categoryId: formData.categoryId,
              price: Number(formData.price),
              costPrice: Number(formData.costPrice),
              stock: Number(formData.stock),
              isAvailable: formData.isAvailable,
              description: formData.description.trim() || undefined,
              options: formData.options,
            }
          : p
      );
      saveProducts(updated);
      setProducts(updated);
    } else {
      // Create new
      const newProduct: Product = {
        id: `p-${Date.now()}`,
        name: formData.name.trim(),
        categoryId: formData.categoryId,
        price: Number(formData.price),
        costPrice: Number(formData.costPrice),
        stock: Number(formData.stock),
        isAvailable: formData.isAvailable,
        description: formData.description.trim() || undefined,
        options: formData.options,
        colorBg: 'bg-amber-800 text-amber-100',
      };
      const updated = [...products, newProduct];
      saveProducts(updated);
      setProducts(updated);
    }

    setIsModalOpen(false);
  };

  // Filter
  const filteredProducts = products.filter((p) => {
    const matchesCat = selectedCategory === 'all' || p.categoryId === selectedCategory;
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCat && matchesSearch;
  });

  return (
    <div className="max-w-7xl mx-auto p-3 sm:p-6 space-y-4 text-[#2C2420]">
      {/* Header Bar */}
      <div className="bg-white border border-[#D7CCC8] p-3.5 rounded-lg flex flex-wrap items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-[#EFEBE9] text-[#3E2723] rounded border border-[#D7CCC8]">
            <UtensilsCrossed className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-extrabold text-sm sm:text-base text-[#3E2723] uppercase tracking-tight">Katalog Menu & Harga</h2>
            <p className="text-xs text-stone-500">Atur daftar menu warung kopi, harga, modal & stok</p>
          </div>
        </div>

        <button
          onClick={handleOpenAddModal}
          className="py-2 px-3 bg-[#3E2723] hover:bg-[#5D4037] text-white font-bold rounded text-xs uppercase flex items-center gap-1.5 shadow transition-all"
        >
          <Plus className="w-4 h-4 stroke-[3]" />
          <span>+ Tambah Menu Baru</span>
        </button>
      </div>

      {/* Search & Category Filter */}
      <div className="bg-white border border-[#D7CCC8] p-3 rounded-lg space-y-2.5 shadow-sm">
        <div className="relative">
          <Search className="w-4 h-4 text-stone-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Cari nama menu kopi / makanan..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-[#F9F8F7] border border-[#D7CCC8] text-[#2C2420] rounded pl-9 pr-3 py-1.5 text-xs focus:outline-none focus:border-[#3E2723]"
          />
        </div>

        {/* Category Chips */}
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none pb-0.5">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1 rounded font-bold text-xs uppercase tracking-tight whitespace-nowrap transition-all ${
                selectedCategory === cat.id
                  ? 'bg-[#3E2723] text-white shadow'
                  : 'bg-white text-[#5D4037] border border-[#D7CCC8] hover:bg-stone-50'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Menu Products Table / Grid */}
      <div className="bg-white border border-[#D7CCC8] rounded-lg overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-[#2C2420]">
            <thead className="bg-[#F9F8F7] text-[#3E2723] font-bold uppercase tracking-wider border-b border-[#D7CCC8]">
              <tr>
                <th className="p-3">Nama Menu</th>
                <th className="p-3">Kategori</th>
                <th className="p-3">Harga Jual</th>
                <th className="p-3">Harga Modal</th>
                <th className="p-3">Estimasi Profit</th>
                <th className="p-3">Stok</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EFEBE9]">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-stone-500">
                    Menu tidak ditemukan.
                  </td>
                </tr>
              ) : (
                filteredProducts.map((p) => {
                  const profit = p.price - (p.costPrice || 0);
                  return (
                    <tr key={p.id} className="hover:bg-stone-50 transition-colors">
                      <td className="p-3 font-bold text-[#2C2420] flex items-center gap-2">
                        <Coffee className="w-4 h-4 text-[#3E2723] shrink-0" />
                        <div>
                          <div>{p.name}</div>
                          {p.description && (
                            <div className="text-[10px] text-stone-500 font-normal line-clamp-1">
                              {p.description}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="p-3">
                        <span className="bg-[#EFEBE9] text-[#5D4037] px-2 py-0.5 rounded border border-[#D7CCC8] uppercase font-bold text-[10px]">
                          {p.categoryId}
                        </span>
                      </td>
                      <td className="p-3 font-black text-[#3E2723]">{formatIDR(p.price)}</td>
                      <td className="p-3 text-stone-600">{formatIDR(p.costPrice || 0)}</td>
                      <td className="p-3 font-bold text-emerald-800">+{formatIDR(profit)}</td>
                      <td className="p-3">
                        {p.stock === -1 ? (
                          <span className="text-stone-500 font-semibold">Unlimited</span>
                        ) : (
                          <span className="font-bold text-[#2C2420]">{p.stock} porsi</span>
                        )}
                      </td>
                      <td className="p-3">
                        {p.isAvailable ? (
                          <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-0.5 rounded-full text-[10px] font-bold">
                            Tersedia
                          </span>
                        ) : (
                          <span className="bg-rose-100 text-rose-800 border border-rose-300 px-2 py-0.5 rounded-full text-[10px] font-bold">
                            Kosong
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleOpenEditModal(p)}
                            className="p-1.5 bg-[#3E2723] hover:bg-[#5D4037] text-white rounded transition-colors"
                            title="Edit Menu"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteProduct(p.id)}
                            className="p-1.5 bg-rose-100 hover:bg-rose-200 text-rose-800 border border-rose-300 rounded transition-colors"
                            title="Hapus Menu"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Product Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white border border-[#D7CCC8] text-[#2C2420] rounded-xl max-w-lg w-full overflow-hidden shadow-2xl flex flex-col my-auto">
            <div className="p-3.5 bg-[#3E2723] text-white flex items-center justify-between">
              <h3 className="font-extrabold text-xs uppercase tracking-tight text-white">
                {editingProduct ? 'Edit Menu' : 'Tambah Menu Baru'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-white/80 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 space-y-3.5">
              <div>
                <label className="text-xs font-bold text-[#3E2723] block mb-1">Nama Menu</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Kopi Susu Aren..."
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-white border border-[#D7CCC8] text-[#2C2420] rounded px-3 py-2 text-xs focus:outline-none focus:border-[#3E2723]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-bold text-[#3E2723] block mb-1">Kategori</label>
                  <select
                    value={formData.categoryId}
                    onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                    className="w-full bg-white border border-[#D7CCC8] text-[#2C2420] rounded px-3 py-2 text-xs focus:outline-none focus:border-[#3E2723] font-bold uppercase"
                  >
                    {categories.filter((c) => c.id !== 'all').map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-[#3E2723] block mb-1">Stok Porsi (-1 = Unlim)</label>
                  <input
                    type="number"
                    value={formData.stock}
                    onChange={(e) => setFormData({ ...formData, stock: Number(e.target.value) })}
                    className="w-full bg-white border border-[#D7CCC8] text-[#2C2420] rounded px-3 py-2 text-xs focus:outline-none focus:border-[#3E2723]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-bold text-[#3E2723] block mb-1">Harga Jual (Rp)</label>
                  <RupiahInput
                    required
                    value={Number(formData.price) || 0}
                    onChange={(v) => setFormData({ ...formData, price: v })}
                    className="w-full bg-white border border-[#D7CCC8] text-[#3E2723] font-black rounded pr-3 py-2 text-xs focus:outline-none focus:border-[#3E2723]"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-[#3E2723] block mb-1">Harga Modal / HPP (Rp)</label>
                  <RupiahInput
                    value={Number(formData.costPrice) || 0}
                    onChange={(v) => setFormData({ ...formData, costPrice: v })}
                    className="w-full bg-white border border-[#D7CCC8] text-[#2C2420] rounded pr-3 py-2 text-xs focus:outline-none focus:border-[#3E2723]"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-[#3E2723] block mb-1">Deskripsi Singkat</label>
                <input
                  type="text"
                  placeholder="Contoh: Espresso + susu segar + gula aren..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full bg-white border border-[#D7CCC8] text-[#2C2420] rounded px-3 py-2 text-xs focus:outline-none focus:border-[#3E2723]"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="availCheck"
                  checked={formData.isAvailable}
                  onChange={(e) => setFormData({ ...formData, isAvailable: e.target.checked })}
                  className="w-4 h-4 rounded accent-[#3E2723]"
                />
                <label htmlFor="availCheck" className="text-xs font-bold text-[#2C2420]">
                  Menu Tersedia Untuk Dijual
                </label>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="w-1/2 py-2 bg-stone-100 hover:bg-stone-200 text-[#2C2420] border border-[#D7CCC8] font-bold rounded text-xs"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="w-1/2 py-2 bg-[#3E2723] hover:bg-[#5D4037] text-white font-extrabold rounded text-xs shadow uppercase tracking-wider"
                >
                  Simpan Menu
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
