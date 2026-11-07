'use client'
import { useState } from 'react'
import { addBusiness, updateBusiness, deleteBusiness } from './actions'
import { Plus, Edit, Trash2 } from 'lucide-react'

export default function BusinessClient({ initialBusinesses }: { initialBusinesses: any[] }) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isAdding, setIsAdding] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(formData: FormData) {
    setLoading(true)
    try {
      if (editingId) {
        await updateBusiness(editingId, formData)
        setEditingId(null)
      } else {
        await addBusiness(formData)
        setIsAdding(false)
      }
    } catch (e: any) {
      alert(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(id: string) {
    if (confirm('Yakin ingin menghapus cabang ini?')) {
      setLoading(true)
      try {
        await deleteBusiness(id)
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
        <h2 className="font-semibold text-lg text-gray-900">Daftar Cabang</h2>
        <button 
          onClick={() => { setIsAdding(true); setEditingId(null); }}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center"
        >
          <Plus className="w-4 h-4 mr-2" />
          Tambah Cabang
        </button>
      </div>

      { (isAdding || editingId) && (
        <div className="p-6 bg-gray-50 border-b border-gray-100">
          <form action={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nama Cabang</label>
              <input type="text" name="name" required className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 p-2.5 border" defaultValue={editingId ? initialBusinesses.find(b => b.id === editingId)?.name : ''} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Alamat</label>
              <textarea name="address" className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 p-2.5 border" defaultValue={editingId ? initialBusinesses.find(b => b.id === editingId)?.address : ''} />
            </div>
            <div className="flex justify-end space-x-3">
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
              <th className="px-6 py-4 font-medium">Nama Cabang</th>
              <th className="px-6 py-4 font-medium">Alamat</th>
              <th className="px-6 py-4 font-medium text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {initialBusinesses.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-6 py-8 text-center text-gray-500">Belum ada cabang usaha.</td>
              </tr>
            ) : initialBusinesses.map(business => (
              <tr key={business.id} className="hover:bg-gray-50/50">
                <td className="px-6 py-4 font-medium text-gray-900">{business.name}</td>
                <td className="px-6 py-4">{business.address || '-'}</td>
                <td className="px-6 py-4 text-right space-x-3">
                  <button onClick={() => {setEditingId(business.id); setIsAdding(false)}} className="text-blue-600 hover:text-blue-800"><Edit className="w-4 h-4 inline" /></button>
                  <button onClick={() => handleDelete(business.id)} className="text-red-600 hover:text-red-800"><Trash2 className="w-4 h-4 inline" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
