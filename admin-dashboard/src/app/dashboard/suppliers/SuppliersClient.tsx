'use client'

import { useState, type FormEvent } from 'react'
import { Edit, Plus, Power } from 'lucide-react'
import AdminModal from '@/components/AdminModal'
import DataPanel from '@/components/DataPanel'
import LoadingSpinner from '@/components/LoadingSpinner'
import { usePendingRefresh } from '@/hooks/usePendingRefresh'
import { saveSupplier, setSupplierStatus } from './actions'
import SupplierDetails from './SupplierDetails'
import type { Supplier } from './types'

const primary = 'rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50'
const secondary = 'rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50'
const input = 'mt-1 w-full rounded-lg border border-gray-300 bg-white p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
const fields = [
  { key: 'name', label: 'Nama supplier', limit: 150 },
  { key: 'code', label: 'Kode supplier', limit: 50 },
  { key: 'contact_name', label: 'Nama kontak', limit: 150 },
  { key: 'phone', label: 'Telepon', limit: 50, type: 'tel' },
  { key: 'email', label: 'Email', limit: 254, type: 'email' },
  { key: 'address', label: 'Alamat', limit: 500, multiline: true },
  { key: 'notes', label: 'Catatan', limit: 1000, multiline: true },
] as const

type Modal = { type: 'create' } | { type: 'edit' | 'status' | 'details'; supplier: Supplier }

function SupplierForm({ supplier, statusOnly, onClose, onSaved }: {
  supplier?: Supplier
  statusOnly: boolean
  onClose: () => void
  onSaved: (message: string) => void
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const statusLabel = supplier?.is_active ? 'Nonaktifkan Supplier' : 'Aktifkan Supplier'
  const title = statusOnly ? statusLabel : supplier ? 'Edit Supplier' : 'Tambah Supplier'

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    const form = new FormData(event.currentTarget)
    setPending(true)
    setError('')
    try {
      const result = await (statusOnly ? setSupplierStatus(form) : saveSupplier(form))
      if (result.success) onSaved(result.message)
      else setError(result.message)
    } catch {
      setError('Perubahan belum berhasil disimpan. Silakan coba kembali.')
    } finally {
      setPending(false)
    }
  }

  return (
    <AdminModal title={title} description={statusOnly ? supplier?.name ?? '' : 'Isi nama supplier dan informasi kontak yang tersedia.'} pending={pending} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4 p-5" aria-busy={pending}>
        {supplier && <>
          <input type="hidden" name="id" value={supplier.id} />
          <input type="hidden" name="version" value={supplier.updated_at} />
        </>}
        {statusOnly ? (
          <>
            <input type="hidden" name="status" value={supplier?.is_active ? 'inactive' : 'active'} />
            <p className="text-sm text-gray-600">
              {supplier?.is_active
                ? 'Supplier akan disembunyikan dari pilihan pengeluaran dan pembelian baru. Riwayat transaksinya tetap tersedia.'
                : 'Supplier akan kembali tersedia untuk pengeluaran dan pembelian baru.'}
            </p>
          </>
        ) : (
          <fieldset disabled={pending} className="grid gap-4 sm:grid-cols-2">
            {fields.map(field => {
              const multiline = 'multiline' in field
              return (
                <label key={field.key} className={`block text-sm font-medium text-gray-700 ${multiline ? 'sm:col-span-2' : ''}`}>
                  {field.label}
                  {multiline
                    ? <textarea className={input} name={field.key} rows={2} maxLength={field.limit} defaultValue={supplier?.[field.key] ?? ''} />
                    : <input className={input} name={field.key} type={'type' in field ? field.type : 'text'} maxLength={field.limit}
                      required={field.key === 'name'} defaultValue={supplier?.[field.key] ?? ''} />}
                </label>
              )
            })}
          </fieldset>
        )}
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>}
        <div className="flex flex-wrap justify-end gap-3 border-t border-gray-100 pt-4">
          <button type="button" onClick={onClose} disabled={pending} className={secondary}>Batal</button>
          <button type="submit" disabled={pending} className={primary}>
            {pending && <LoadingSpinner className="mr-2" />}{statusOnly ? statusLabel : 'Simpan Supplier'}
          </button>
        </div>
      </form>
    </AdminModal>
  )
}

export default function SuppliersClient({ suppliers }: { suppliers: Supplier[] }) {
  const { refreshing, refresh } = usePendingRefresh()
  const [modal, setModal] = useState<Modal | null>(null)
  const [message, setMessage] = useState('')

  function close() {
    setModal(null)
  }

  function saved(message: string) {
    close()
    setMessage(message)
    refresh()
  }

  return (
    <div className="space-y-4">
      {message && <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-700">{message}</p>}
      <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 p-5">
          <h2 className="font-semibold text-gray-900">Daftar Supplier <span className="ml-2 text-sm font-normal text-gray-500">{suppliers.length} supplier</span></h2>
          <button type="button" onClick={() => setModal({ type: 'create' })} disabled={refreshing} className={`${primary} inline-flex items-center gap-2`}>
            <Plus aria-hidden="true" className="h-4 w-4" /> Tambah Supplier
          </button>
        </div>
        <DataPanel loading={refreshing} label="Memuat supplier...">
          {suppliers.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-gray-600">
                <thead className="bg-gray-50 text-xs uppercase text-gray-700">
                  <tr>{['Nama Supplier', 'Nama Kontak', 'Telepon / Email', 'Status', 'Aksi'].map(label => (
                    <th key={label} scope="col" className="px-4 py-3">{label}</th>
                  ))}</tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {suppliers.map(supplier => (
                    <tr key={supplier.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <button type="button" onClick={() => setModal({ type: 'details', supplier })} className="text-left font-semibold text-blue-600 hover:underline">
                          {supplier.name}
                        </button>
                        {supplier.code && <p className="mt-1 text-xs text-gray-500">{supplier.code}</p>}
                      </td>
                      <td className="px-4 py-3">{supplier.contact_name || '—'}</td>
                      <td className="px-4 py-3">
                        <p>{supplier.phone || supplier.email || '—'}</p>
                        {supplier.phone && supplier.email && <p className="mt-1 text-xs text-gray-500">{supplier.email}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-md px-2 py-1 text-xs font-medium ${supplier.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                          {supplier.is_active ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button type="button" title="Edit Supplier" aria-label={`Edit ${supplier.name}`} onClick={() => setModal({ type: 'edit', supplier })} className="rounded-lg p-2 text-blue-600 hover:bg-blue-50">
                            <Edit aria-hidden="true" className="h-4 w-4" />
                          </button>
                          <button type="button" title={supplier.is_active ? 'Nonaktifkan Supplier' : 'Aktifkan Supplier'}
                            aria-label={`${supplier.is_active ? 'Nonaktifkan' : 'Aktifkan'} ${supplier.name}`}
                            onClick={() => setModal({ type: 'status', supplier })} className="rounded-lg p-2 text-gray-600 hover:bg-gray-100">
                            <Power aria-hidden="true" className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="p-8 text-center text-sm text-gray-500">Belum ada supplier. Tambahkan supplier agar bisa dipilih saat mencatat pembelian.</p>}
        </DataPanel>
      </div>
      {modal?.type === 'details' && <SupplierDetails supplier={modal.supplier} onClose={close} />}
      {modal && modal.type !== 'details' && (
        <SupplierForm supplier={'supplier' in modal ? modal.supplier : undefined} statusOnly={modal.type === 'status'} onClose={close} onSaved={saved} />
      )}
    </div>
  )
}
