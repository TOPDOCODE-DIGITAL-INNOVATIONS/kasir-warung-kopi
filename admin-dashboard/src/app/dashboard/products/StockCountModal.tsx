'use client'

import { useState } from 'react'
import AdminModal from '@/components/AdminModal'
import { recordStockCount } from './actions'
import { stockChange } from './domain'
import type { ProductRow } from './types'

const input = 'w-full rounded-lg border border-gray-300 bg-white p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
const modes = { count: 'Isi sisa fisik', usage: 'Pemakaian', damage: 'Rusak / terbuang', addition: 'Penambahan lainnya' }
type Draft = { mode: string; quantity: string; reason: string }
const empty: Draft = { mode: 'count', quantity: '', reason: '' }
const qty = (value: number) => value.toLocaleString('id-ID', { maximumFractionDigits: 6 })

export default function StockCountModal({ products, businessId, onClose, onSaved, single = false }: {
  products: ProductRow[]; businessId: string; onClose: () => void; onSaved: (message: string) => void; single?: boolean
}) {
  const [operation] = useState(() => crypto.randomUUID())
  const [drafts, setDrafts] = useState<Record<string, Draft>>({}), [search, setSearch] = useState('')
  const [pending, setPending] = useState(false), [error, setError] = useState(''), [preview, setPreview] = useState(false), [note, setNote] = useState('')
  const tracked = products.filter(product => product.stock >= 0)
  const shown = tracked.filter(product => `${product.name} ${product.sku}`.toLocaleLowerCase('id').includes(search.toLocaleLowerCase('id')))
  const selected = tracked.filter(product => (drafts[product.inventoryId]?.quantity ?? '').trim() !== '')
  function change(id: string, fields: Partial<Draft>) { setDrafts(previous => ({ ...previous, [id]: { ...(previous[id] ?? empty), ...fields } })); setError(''); setPreview(false) }
  function validate() {
    if (!selected.length) throw new Error('Isi minimal satu produk. Isian kosong dilewati; angka 0 berarti stok habis.')
    for (const product of selected) {
      const row = drafts[product.inventoryId]
      stockChange(product.stock, row.mode, row.quantity)
      if (row.mode !== 'count' && !row.reason.trim()) throw new Error(`${product.name}: alasan wajib diisi.`)
      if (product.pendingOperation) throw new Error(`${product.name}: selesaikan pembelian tertunda melalui Riwayat.`)
    }
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('')
    try {
      validate()
      if (!preview) { setPreview(true); return }
      setPending(true)
      const form = new FormData()
      form.set('business_id', businessId); form.set('operation_id', operation); form.set('note', note)
      form.set('lines', JSON.stringify(selected.map(product => ({ product_id: product.inventoryId, version: product.version, ...drafts[product.inventoryId] }))))
      const result = await recordStockCount(form)
      if (result.success) onSaved(result.message)
      else { setError(result.message); setPreview(false) }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Perubahan belum berhasil disimpan.') }
    finally { setPending(false) }
  }
  return <AdminModal title={single ? 'Kelola Stok' : 'Stok Opname'} description="Isi sisa fisik atau pilih jenis penyesuaian. Semua baris disimpan sekaligus." wide pending={pending} onClose={onClose}>
    <form onSubmit={submit} className="space-y-4 p-5">
      <fieldset disabled={pending} className="space-y-4">
        {!single && <input type="search" aria-label="Cari produk opname" placeholder="Cari nama / SKU..." value={search} onChange={event => setSearch(event.target.value)} className={input} />}
        <p className="text-xs text-gray-500">Isian kosong tidak mengubah stok. Isi 0 hanya jika barang sudah habis. {selected.length} produk terisi, termasuk yang tidak terlihat pada pencarian.</p>
        {!preview ? <div className="max-h-[45vh] overflow-auto rounded-lg border border-gray-200"><table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-gray-50 text-xs text-gray-500"><tr>{['Produk', 'Stok tercatat', 'Jenis pencatatan', 'Jumlah', 'Alasan / Catatan'].map(label => <th key={label} className="whitespace-nowrap p-3">{label}</th>)}</tr></thead>
          <tbody className="divide-y divide-gray-100">{shown.map(product => {
            const row = drafts[product.inventoryId] ?? empty
            return <tr key={product.inventoryId}><td className="min-w-36 p-3 font-medium">{product.name}</td><td className="p-3 whitespace-nowrap">{qty(product.stock)} {product.unitCode === 'l' ? 'L' : product.unitCode}</td>
              <td className="min-w-44 p-3"><select aria-label={`Jenis pencatatan ${product.name}`} value={row.mode} onChange={event => change(product.inventoryId, { mode: event.target.value })} className={input}>{Object.entries(modes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td>
              <td className="min-w-32 p-3"><input aria-label={`Jumlah ${product.name}`} type="number" min="0" max="999999999" step="0.000001" value={row.quantity} onChange={event => change(product.inventoryId, { quantity: event.target.value })} placeholder={row.mode === 'count' ? 'Sisa fisik' : 'Jumlah'} className={input} /></td>
              <td className="min-w-44 p-3"><input aria-label={`Alasan ${product.name}`} value={row.reason} maxLength={500} onChange={event => change(product.inventoryId, { reason: event.target.value })} className={input} placeholder={row.mode === 'count' ? 'Opsional' : 'Wajib diisi'} /></td></tr>
          })}{!shown.length && <tr><td colSpan={5} className="p-6 text-center text-gray-500">Tidak ada produk dengan pelacakan stok yang sesuai.</td></tr>}</tbody>
        </table></div> : <div className="max-h-[45vh] overflow-auto rounded-lg border border-blue-100"><table className="w-full text-left text-sm"><thead className="bg-blue-50"><tr>{['Produk', 'Jenis', 'Sebelum', 'Sesudah', 'Selisih'].map(label => <th key={label} className="p-3">{label}</th>)}</tr></thead><tbody>{selected.map(product => {
          const row = drafts[product.inventoryId], after = stockChange(product.stock, row.mode, row.quantity), delta = after - product.stock
          return <tr key={product.inventoryId} className="border-t border-gray-100"><td className="p-3">{product.name}</td><td className="p-3">{modes[row.mode as keyof typeof modes]}</td><td className="p-3">{qty(product.stock)}</td><td className="p-3 font-semibold">{qty(after)}</td><td className="p-3">{delta > 0 ? '+' : ''}{qty(delta)}</td></tr>
        })}</tbody></table></div>}
        <label className="block text-sm text-gray-700">Catatan umum (opsional)<textarea rows={2} value={note} maxLength={500} onChange={event => setNote(event.target.value)} className={`${input} mt-2`} /></label>
      </fieldset>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
        <button type="button" disabled={pending} onClick={preview ? () => setPreview(false) : onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700">{preview ? 'Kembali' : 'Batal'}</button>
        <button type="submit" disabled={pending || !selected.length} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{pending ? 'Menyimpan...' : preview ? 'Simpan Perubahan' : 'Tinjau Perubahan'}</button>
      </div>
    </form>
  </AdminModal>
}
