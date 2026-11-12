'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2 } from 'lucide-react'
import AdminModal from '@/components/AdminModal'
import { dayKey, rupiah } from '@/lib/format'
import MoneyInput from '../products/MoneyInput'
import { getExpenseOptions, saveExpenseBatch } from './actions'
import type { ExpenseOptions } from './types'

const input = 'w-full rounded-lg border border-gray-300 bg-white p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
const primary = 'rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50'
type Line = { id: string; product: string; quantity: string; unit: string; category: string; note: string }
const line = (): Line => ({ id: crypto.randomUUID(), product: '', quantity: '', unit: '', category: 'Lain-lain', note: '' })

function ExpenseModal({ businessId, onClose, onSaved }: { businessId: string; onClose: () => void; onSaved: (message: string) => void }) {
  const [operation] = useState(() => crypto.randomUUID())
  const [options, setOptions] = useState<ExpenseOptions | null>(null), [rows, setRows] = useState<Line[]>(() => [line()])
  const [scope, setScope] = useState('daily'), [date, setDate] = useState(() => dayKey(new Date()))
  const [supplier, setSupplier] = useState('')
  const [pending, setPending] = useState(false), [error, setError] = useState(''), [amounts, setAmounts] = useState<Record<string, string>>({})
  const total = rows.reduce((sum, row) => sum + (Number(amounts[row.id]) || 0), 0)
  useEffect(() => {
    let active = true
    getExpenseOptions(businessId).then(data => { if (active) setOptions(data) }).catch(() => { if (active) setError('Gagal memuat pilihan pengeluaran. Tutup lalu buka kembali form.') })
    return () => { active = false }
  }, [businessId])
  function change(id: string, fields: Partial<Line>) { setRows(current => current.map(row => row.id === id ? { ...row, ...fields } : row)) }
  async function submit(form: FormData) {
    if (!options) return
    setPending(true); setError('')
    form.set('operation_id', operation); form.set('business_id', businessId); form.set('scope', scope); form.set('date', date)
    form.set('lines', JSON.stringify(rows.map(row => ({ id: row.id, product_id: row.product || null,
      version: options.products.find(p => p.id === row.product)?.version ?? null, quantity: row.quantity || null,
      item_unit_id: row.quantity ? row.unit || null : null, amount: String(form.get(`amount-${row.id}`) ?? ''), category: row.category, note: row.note,
    }))))
    try { const result = await saveExpenseBatch(form); if (result.success) onSaved(result.message); else setError(result.message) }
    catch { setError('Penyimpanan belum dapat dipastikan. Coba simpan ulang tanpa mengganti isian agar tidak tercatat ganda.') }
    finally { setPending(false) }
  }
  return <AdminModal title="Tambah Pengeluaran" description="Satu form dapat memuat beberapa produk atau Lain-lain. Setiap baris menjadi satu catatan pengeluaran." wide pending={pending} onClose={onClose}>
    <form action={submit} className="space-y-5 p-5">
      <fieldset disabled={pending || !options} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="space-y-2 text-sm text-gray-700"><span>Jenis pengeluaran</span><select value={scope} onChange={event => { setScope(event.target.value); setDate(event.target.value === 'monthly' ? date.slice(0,7) : `${date.slice(0,7)}-01`) }} className={input}><option value="daily">Harian</option><option value="monthly">Bulanan</option></select></label>
          <label className="space-y-2 text-sm text-gray-700"><span>{scope === 'monthly' ? 'Bulan' : 'Tanggal'}</span><input type={scope === 'monthly' ? 'month' : 'date'} required value={date} onChange={event => setDate(event.target.value)} className={input} /></label>
          <label className="space-y-2 text-sm text-gray-700"><span>Supplier (opsional)</span><select name="supplier_id" value={supplier} onChange={event => setSupplier(event.target.value)} className={input}><option value="">Tanpa supplier</option>{options?.suppliers.map(supplier => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>
        </div>
        {!options && !error && <p className="text-sm text-gray-500">Memuat pilihan produk...</p>}
        <div className="space-y-3">{rows.map((row, index) => {
          const product = options?.products.find(p => p.id === row.product), tracked = !!product && product.stock >= 0
          const units = options?.units.filter(unit => unit.productId === row.product) ?? []
          return <section key={row.id} className="space-y-3 rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Item {index + 1}</h3><button type="button" aria-label={`Hapus item ${index + 1}`} disabled={rows.length === 1} onClick={() => setRows(current => current.filter(item => item.id !== row.id))} className="rounded-lg p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-30"><Trash2 className="h-4 w-4" /></button></div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="space-y-2 text-sm text-gray-700"><span>Produk / Lain-lain</span><select value={row.product} onChange={event => {
                const p = options?.products.find(product => product.id === event.target.value)
                change(row.id, { product: event.target.value, quantity: '', unit: '', category: p ? 'Pembelian Barang' : 'Lain-lain' })
              }} className={input}><option value="">Lain-lain</option>{options?.products.map(p => <option key={p.id} value={p.id} disabled={rows.some(other => other.id !== row.id && other.product === p.id)}>{p.name}</option>)}</select></label>
              <label className="space-y-2 text-sm text-gray-700"><span>Kategori</span><input required maxLength={100} value={row.category} onChange={event => change(row.id, { category: event.target.value })} className={input} /></label>
              <div className="space-y-2"><label htmlFor={`expense-amount-${row.id}`} className="text-sm text-gray-700">Nominal total item</label><MoneyInput id={`expense-amount-${row.id}`} name={`amount-${row.id}`} required onValueChange={value => setAmounts(previous => ({ ...previous, [row.id]: value }))} className={input} /></div>
              {product && <>
                <label className="space-y-2 text-sm text-gray-700"><span>Jumlah {tracked ? '(wajib)' : '(opsional)'}</span><input type="number" required={tracked} min="0.000001" max="999999999" step="0.000001" value={row.quantity} onChange={event => change(row.id, { quantity: event.target.value })} className={input} /></label>
                <label className="space-y-2 text-sm text-gray-700"><span>Satuan pembelian</span><select value={row.unit} onChange={event => change(row.id, { unit: event.target.value })} className={input}><option value="">{product.unitCode === 'l' ? 'L' : product.unitCode} (satuan dasar)</option>{units.map(unit => <option key={unit.id} value={unit.id}>{unit.label === 'l' ? 'L' : unit.label}{unit.factor !== 1 ? ` = ${unit.factor} ${product.unitCode === 'l' ? 'L' : product.unitCode}` : ''}</option>)}</select></label>
              </>}
              <label className={`space-y-2 text-sm text-gray-700 ${product ? '' : 'sm:col-span-2 lg:col-span-3'}`}><span>Keterangan {product ? '(opsional)' : '(wajib)'}</span><input required={!product} maxLength={500} value={row.note} onChange={event => change(row.id, { note: event.target.value })} className={input} placeholder={product ? 'Keterangan pembelian' : 'Contoh: transport atau tagihan listrik'} /></label>
            </div>
            {product && <p className="text-xs text-gray-500">{tracked ? 'Jumlah pembelian menambah stok tercatat.' : 'Stok tidak dilacak. Nominal tetap dicatat; jumlah pembelian boleh dikosongkan.'}</p>}
          </section>
        })}</div>
        <button type="button" disabled={rows.length >= 100} onClick={() => setRows(current => [...current, line()])} className="inline-flex items-center gap-2 text-sm font-medium text-blue-600"><Plus className="h-4 w-4" />Tambah Item</button>
        <p className="text-xs text-gray-500">Pengeluaran admin dicatat di luar laci shift kasir.</p>
      </fieldset>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4"><p className="text-sm text-gray-700">Total: <strong>{rupiah(total)}</strong></p><div className="flex gap-3"><button type="button" disabled={pending} onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700">Batal</button><button type="submit" disabled={pending || !options} className={primary}>{pending ? 'Menyimpan...' : 'Simpan Pengeluaran'}</button></div></div>
    </form>
  </AdminModal>
}

export default function ExpenseEntry({ businessId }: { businessId: string | null }) {
  const router = useRouter(), [open, setOpen] = useState(false), [message, setMessage] = useState('')
  return <>
    <button type="button" disabled={!businessId} onClick={() => { setMessage(''); setOpen(true) }} className={`${primary} inline-flex items-center gap-2`}><Plus className="h-4 w-4" />Tambah Pengeluaran</button>
    {message && <p role="status" className="text-sm text-green-700">{message}</p>}
    {open && businessId && <ExpenseModal businessId={businessId} onClose={() => setOpen(false)} onSaved={text => { setOpen(false); setMessage(text); router.refresh() }} />}
  </>
}
