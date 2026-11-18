'use client'

import { useState } from 'react'
import { usePendingRefresh } from '@/hooks/usePendingRefresh'
import LoadingSpinner from '@/components/LoadingSpinner'
import { Pencil, Trash2 } from 'lucide-react'
import AdminModal from '@/components/AdminModal'
import MoneyInput from '../products/MoneyInput'
import { deleteExpense, updateExpense } from './actions'
import { rupiah } from '@/lib/format'
import type { EditableExpense } from './types'
import { EXPENSE_CATEGORIES } from '../../../../../shared/expense-categories'

const input = 'w-full rounded-lg border border-gray-300 bg-white p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500'

function EditModal({ expense, onClose, onSaved }: { expense: EditableExpense; onClose: () => void; onSaved: () => void }) {
  const [scope, setScope] = useState(expense.scope), [date, setDate] = useState(expense.date)
  const [category, setCategory] = useState(expense.category)
  const [pending, setPending] = useState(false), [error, setError] = useState('')
  async function save(form: FormData) {
    setPending(true); setError('')
    form.set('business_id', expense.businessId); form.set('id', expense.id); form.set('version', expense.version)
    form.set('scope', scope); form.set('date', date)
    if (expense.financialLock) form.set('amount', String(expense.amount))
    try {
      const result = await updateExpense(form)
      if (result.success) onSaved(); else setError(result.message)
    } catch { setError('Pengeluaran belum berhasil diperbarui. Silakan coba kembali.') }
    finally { setPending(false) }
  }
  return <AdminModal title="Edit Pengeluaran" description="Perbaiki isian pengeluaran tanpa membuat catatan baru." pending={pending} onClose={onClose}>
    <form action={save} className="space-y-4 p-5">
      <fieldset disabled={pending} className="space-y-4">
        {expense.financialLock && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{expense.financialLock}</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2 text-sm text-gray-700"><span>Jenis pengeluaran</span>
            <select disabled={!!expense.financialLock} className={input} value={scope} onChange={event => {
              const next = event.target.value as typeof scope
              setScope(next)
              setDate(next === 'monthly' ? date.slice(0, 7) : `${date.slice(0, 7)}-01`)
              if (!EXPENSE_CATEGORIES[next].includes(category)) setCategory(EXPENSE_CATEGORIES[next][0])
            }}><option value="daily">Harian</option><option value="monthly">Bulanan</option></select>
          </label>
          <label className="space-y-2 text-sm text-gray-700"><span>{scope === 'monthly' ? 'Bulan' : 'Tanggal'}</span><input disabled={!!expense.financialLock} required type={scope === 'monthly' ? 'month' : 'date'} value={date} onChange={e => setDate(e.target.value)} className={input} /></label>
        </div>
        <label className="block space-y-2 text-sm text-gray-700"><span>Kategori</span>
          <select name="category" value={category} onChange={event => setCategory(event.target.value)} className={input} required>
            {!EXPENSE_CATEGORIES[scope].includes(category) && <option value={category}>{category}</option>}
            {EXPENSE_CATEGORIES[scope].map(option => <option key={option}>{option}</option>)}
          </select>
        </label>
        <fieldset disabled={!!expense.financialLock}><label htmlFor="edit-expense-amount" className="mb-2 block text-sm text-gray-700">Nominal</label><MoneyInput id="edit-expense-amount" name="amount" defaultValue={expense.amount} required className={input} /></fieldset>
        <label className="block space-y-2 text-sm text-gray-700"><span>Catatan (opsional)</span><textarea name="note" defaultValue={expense.note} maxLength={500} rows={3} className={input} /></label>
      </fieldset>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-3 border-t border-gray-100 pt-4"><button type="button" disabled={pending} onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 disabled:opacity-50">Batal</button><button disabled={pending} type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">{pending && <LoadingSpinner className="mr-2" />}{pending ? 'Menyimpan...' : 'Simpan Perubahan'}</button></div>
    </form>
  </AdminModal>
}

function DeleteModal({ expense, onClose, onSaved }: { expense: EditableExpense; onClose: () => void; onSaved: () => void }) {
  const [pending, setPending] = useState(false), [error, setError] = useState('')
  async function remove(form: FormData) {
    setPending(true); setError('')
    form.set('business_id', expense.businessId); form.set('id', expense.id); form.set('version', expense.version)
    try { const result = await deleteExpense(form); if (result.success) onSaved(); else setError(result.message) }
    catch { setError('Pengeluaran belum berhasil dihapus. Silakan coba kembali.') }
    finally { setPending(false) }
  }
  return <AdminModal title="Hapus Pengeluaran" description="Pengeluaran yang dihapus tidak dapat dikembalikan melalui aplikasi." pending={pending} onClose={onClose}>
    <form action={remove} className="space-y-4 p-5">
      <p className="text-sm text-gray-700">Hapus pengeluaran <strong>{expense.category}</strong> tanggal <strong>{expense.date}</strong> sebesar <strong>{rupiah(expense.amount)}</strong>?</p>
      {expense.note && <p className="break-words rounded-lg bg-gray-50 p-3 text-sm text-gray-600">{expense.note}</p>}
      {expense.fromDrawer && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Saldo laci pada shift kasir yang masih aktif akan disesuaikan saat kasir melakukan sinkronisasi. Rekap shift yang sudah ditutup tetap dipertahankan.</p>}
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-3 border-t border-gray-100 pt-4"><button type="button" disabled={pending} onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 disabled:opacity-50">Batal</button><button type="submit" disabled={pending} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">{pending && <LoadingSpinner className="mr-2" />}{pending ? 'Menghapus...' : 'Hapus Pengeluaran'}</button></div>
    </form>
  </AdminModal>
}

export default function ExpenseActions({ expense }: { expense: EditableExpense }) {
  const [open, setOpen] = useState<'edit' | 'delete' | null>(null)
  const { refreshing, refresh } = usePendingRefresh()
  const saved = () => { setOpen(null); refresh() }
  return <div className="flex items-center" aria-busy={refreshing}><button type="button" disabled={refreshing} onClick={() => setOpen('edit')} aria-label={`Edit pengeluaran ${expense.category}`} title="Edit pengeluaran" className="rounded-lg p-2 text-blue-600 hover:bg-blue-50 disabled:opacity-50"><Pencil className="h-4 w-4" /></button>
    <button type="button" disabled={expense.purchaseLinked || refreshing} onClick={() => setOpen('delete')} aria-label={`Hapus pengeluaran ${expense.category}`} title={expense.purchaseLinked ? 'Pengeluaran terkait pembelian/stok tidak dapat dihapus dari sini.' : 'Hapus pengeluaran'} className="rounded-lg p-2 text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-30"><Trash2 className="h-4 w-4" /></button>
    {open === 'edit' && <EditModal expense={expense} onClose={() => setOpen(null)} onSaved={saved} />}{open === 'delete' && <DeleteModal expense={expense} onClose={() => setOpen(null)} onSaved={saved} />}
  </div>
}
