'use client'
import { useState } from 'react'
import { addProduct, updateProduct, deleteProduct } from './actions'
import { Plus, Edit, Trash2 } from 'lucide-react'

export default function ProductClient({ 
  initialProducts, 
  businesses 
}: { 
  initialProducts: any[], 
  businesses: any[] 
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isAdding, setIsAdding] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(formData: FormData) {
    setLoading(true)
    try {
      if (editingId) {
        await updateProduct(editingId, formData)
        setEditingId(null)
      } else {
        await addProduct(formData)
        setIsAdding(false)
      }
    } catch (e: any) {
      alert(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(id: string) {
    if (confirm('Yakin ingin menghapus produk ini?')) {
      setLoading(true)
      try {
        await deleteProduct(id)
      } catch (e: any) {
        alert(e.message)
      } finally {
        setLoading(false)
      }
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="p-6 border-b border-gray-100 flex justify-between items-center">
        <h2 className="font-semibold text-lg text-gray-900">Daftar Produk & Menu</h2>
        <button 
          onClick={() => { setIsAdding(true); setEditingId(null); }}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center"
        >
          <Plus className="w-4 h-4 mr-2" />
          Tambah Produk
        </button>
      </div>

      { (isAdding || editingId) && (
        <div className="p-6 bg-gray-50 border-b border-gray-100">
          <form action={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nama Produk</label>
                <input type="text" name="name" required className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 p-2.5 border" defaultValue={editingId ? initialProducts.find(p => p.id === editingId)?.name : ''} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cabang Usaha</label>
                <select name="business_id" required className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 p-2.5 border bg-white" defaultValue={editingId ? initialProducts.find(p => p.id === editingId)?.business_id : (businesses.length > 0 ? businesses[0].id : '')}>
                  {businesses.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Harga (Rp)</label>
                <input type="number" name="price" required className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 p-2.5 border" defaultValue={editingId ? initialProducts.find(p => p.id === editingId)?.price : ''} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Stok</label>
                <input type="number" name="stock" required className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 p-2.5 border" defaultValue={editingId ? initialProducts.find(p => p.id === editingId)?.stock : 0} />
              </div>
            </div>
            <div className="flex justify-end space-x-3 pt-4">
              <button type="button" onClick={() => {setIsAdding(false); setEditingId(null)}} className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 bg-white border border-gray-300 rounded-lg">Batal</button>
              <button type="submit" disabled={loading} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50">
                {loading ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-gray-500">
          <thead className="bg-gray-50 text-xs uppercase text-gray-700">
            <tr>
              <th className="px-6 py-4 font-medium">Nama Produk</th>
              <th className="px-6 py-4 font-medium">Cabang</th>
              <th className="px-6 py-4 font-medium">Harga</th>
              <th className="px-6 py-4 font-medium">Stok</th>
              <th className="px-6 py-4 font-medium text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {initialProducts.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-gray-500">Belum ada produk.</td>
              </tr>
            ) : initialProducts.map(product => (
              <tr key={product.id} className="hover:bg-gray-50/50">
                <td className="px-6 py-4 font-medium text-gray-900">{product.name}</td>
                <td className="px-6 py-4">{product.businesses?.name || '-'}</td>
                <td className="px-6 py-4">Rp {parseInt(product.price).toLocaleString('id-ID')}</td>
                <td className="px-6 py-4">{product.stock}</td>
                <td className="px-6 py-4 text-right space-x-3">
                  <button onClick={() => {setEditingId(product.id); setIsAdding(false)}} className="text-blue-600 hover:text-blue-800"><Edit className="w-4 h-4 inline" /></button>
                  <button onClick={() => handleDelete(product.id)} className="text-red-600 hover:text-red-800"><Trash2 className="w-4 h-4 inline" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
