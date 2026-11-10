'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Edit, Trash2, X } from 'lucide-react'
import { deleteCashier, updateCashier } from './actions'
import { AVATAR_COLORS, CASHIER_ROLES, avatarColor, type CashierRow } from './types'

const inputClassName = 'w-full border border-gray-300 rounded-lg bg-white p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
const cancelClassName = 'px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50'

function UserModal({ title, description, pending, onClose, children }: {
  title: string; description: string; pending: boolean; onClose: () => void; children: ReactNode
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = dialogRef.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])

  return (
    <dialog ref={dialogRef} aria-labelledby="user-dialog-title" aria-describedby="user-dialog-description"
      onCancel={(event) => { event.preventDefault(); if (!pending) onClose() }}
      className="m-auto w-[calc(100%_-_2rem)] max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-gray-100 bg-white p-0 text-gray-900 shadow-xl backdrop:bg-black/40">
      <div className="flex items-start justify-between gap-4 border-b border-gray-100 p-5">
        <div>
          <h2 id="user-dialog-title" className="text-lg font-semibold">{title}</h2>
          <p id="user-dialog-description" className="mt-1 text-sm text-gray-500">{description}</p>
        </div>
        <button type="button" onClick={onClose} disabled={pending} aria-label="Tutup dialog"
          className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"><X className="h-5 w-5" /></button>
      </div>
      {children}
    </dialog>
  )
}

function IdentityFields({ user }: { user: CashierRow }) {
  return <>
    <input type="hidden" name="business_id" value={user.businessId} />
    <input type="hidden" name="cashier_id" value={user.id} />
    <input type="hidden" name="config_version" value={user.configVersion ?? ''} />
  </>
}

function EditUserModal({ user, onClose, onSaved }: { user: CashierRow; onClose: () => void; onSaved: (message: string) => void }) {
  const [name, setName] = useState(user.name)
  const [color, setColor] = useState(user.avatarColor)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  async function submit(formData: FormData) {
    setPending(true)
    setError('')
    try {
      const result = await updateCashier(formData)
      if (result.success) onSaved(result.message)
      else setError(result.message)
    } catch {
      setError('Perubahan belum berhasil disimpan. Silakan coba kembali.')
    } finally { setPending(false) }
  }

  return (
    <UserModal title="Edit User" description={`Profil kasir di ${user.businessName}`} pending={pending} onClose={onClose}>
      <form action={submit} className="p-5 space-y-5" aria-busy={pending}>
        <IdentityFields user={user} />
        <fieldset disabled={pending} className="space-y-4">
          <div>
            <label htmlFor="cashier-name" className="block text-sm font-medium text-gray-700 mb-2">Nama</label>
            <input id="cashier-name" name="name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={100} className={inputClassName} />
          </div>
          <div>
            <label htmlFor="cashier-role" className="block text-sm font-medium text-gray-700 mb-2">Role</label>
            <select id="cashier-role" name="role" defaultValue={user.role} className={inputClassName}>
              {CASHIER_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
            </select>
            <p className="mt-2 text-xs text-gray-500">Setiap cabang harus memiliki minimal satu Owner.</p>
          </div>
          <div>
            <label htmlFor="cashier-color" className="block text-sm font-medium text-gray-700 mb-2">Warna avatar</label>
            <div className="flex items-center gap-3">
              <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                style={{ backgroundColor: avatarColor(color).background }}>{name.trim().charAt(0).toUpperCase() || '?'}</span>
              <select id="cashier-color" name="avatar_color" value={color} onChange={(event) => setColor(event.target.value)} className={inputClassName}>
                {AVATAR_COLORS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
          </div>
          <p className="text-xs text-gray-500">PIN tetap dikelola melalui aplikasi kasir. Perubahan profil diterapkan setelah perangkat melakukan sinkronisasi.</p>
        </fieldset>
        {error && <p role="alert" className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{error}</p>}
        <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
          <button type="button" disabled={pending} onClick={onClose} className={cancelClassName}>Batal</button>
          <button type="submit" disabled={pending} className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {pending ? 'Menyimpan...' : 'Simpan Perubahan'}
          </button>
        </div>
      </form>
    </UserModal>
  )
}

function DeleteUserModal({ user, onClose, onSaved }: { user: CashierRow; onClose: () => void; onSaved: (message: string) => void }) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  async function submit(formData: FormData) {
    setPending(true)
    setError('')
    try {
      const result = await deleteCashier(formData)
      if (result.success) onSaved(result.message)
      else setError(result.message)
    } catch { setError('User belum berhasil dihapus. Silakan coba kembali.') }
    finally { setPending(false) }
  }

  return (
    <UserModal title="Hapus User" description={`${user.name} · ${user.businessName}`} pending={pending} onClose={onClose}>
      <form action={submit} className="p-5 space-y-4" aria-busy={pending}>
        <IdentityFields user={user} />
        <p className="text-sm text-gray-600">Hapus profil kasir ini? Riwayat transaksi dan shift yang sudah tercatat tetap disimpan.</p>
        <p className="text-sm text-gray-600">Pastikan perangkat kasir sudah tersinkronisasi dan semua shift user ini sudah ditutup.</p>
        {error && <p role="alert" className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{error}</p>}
        <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
          <button type="button" disabled={pending} onClick={onClose} className={cancelClassName}>Batal</button>
          <button type="submit" disabled={pending} className="px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50">
            {pending ? 'Menghapus...' : 'Hapus User'}
          </button>
        </div>
      </form>
    </UserModal>
  )
}

export default function UsersClient({ users }: { users: CashierRow[] }) {
  const router = useRouter()
  const [editing, setEditing] = useState<CashierRow | null>(null)
  const [deleting, setDeleting] = useState<CashierRow | null>(null)
  const [message, setMessage] = useState('')
  const ownerCounts = new Map<string, number>()
  users.forEach((user) => { if (user.role === 'Owner') ownerCounts.set(user.businessId, (ownerCounts.get(user.businessId) ?? 0) + 1) })
  function saved(value: string) {
    setEditing(null)
    setDeleting(null)
    setMessage(value)
    router.refresh()
  }

  return (
    <div className="space-y-4">
      {message && <p role="status" className="text-sm text-green-700 bg-green-50 p-3 rounded-lg">{message}</p>}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-5 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Daftar User <span className="ml-2 text-sm font-normal text-gray-500">{users.length} user</span></h2>
          <p className="mt-1 text-sm text-gray-500">Profil kasir yang sudah tersinkronisasi dari perangkat. Perubahan akan diterima kasir pada sinkronisasi berikutnya.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-600">
            <thead className="bg-gray-50 text-xs uppercase text-gray-700"><tr>
              {['Nama', 'Cabang', 'Role', 'PIN', 'Aksi'].map((column) => <th key={column} scope="col" className="px-4 py-3 font-medium">{column}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {users.length === 0 ? <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-500">Belum ada user kasir. Sinkronkan aplikasi kasir pada cabang ini terlebih dahulu.</td></tr>
                : users.map((user) => {
                  const lastOwner = user.role === 'Owner' && ownerCounts.get(user.businessId) === 1
                  return <tr key={`${user.businessId}:${user.id}`} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3"><div className="flex items-center gap-3">
                      <span aria-hidden="true" className="h-9 w-9 shrink-0 rounded-full flex items-center justify-center font-semibold text-white" style={{ backgroundColor: avatarColor(user.avatarColor).background }}>{user.name.trim().charAt(0).toUpperCase() || '?'}</span>
                      <span className="font-medium text-gray-900 break-words">{user.name}</span>
                    </div></td>
                    <td className="px-4 py-3">{user.businessName}</td>
                    <td className="px-4 py-3"><span className={`inline-flex rounded-md px-2 py-1 text-xs font-medium ${user.role === 'Owner' ? 'bg-blue-50 text-blue-700' : user.role === 'Supervisor' ? 'bg-purple-50 text-purple-700' : 'bg-gray-100 text-gray-700'}`}>{user.role}</span></td>
                    <td className="px-4 py-3 whitespace-nowrap">{user.hasPin ? 'Sudah diatur' : 'Belum diatur'}</td>
                    <td className="px-4 py-3"><div className="flex items-center gap-2 whitespace-nowrap">
                      <button type="button" aria-label={`Edit ${user.name} di ${user.businessName}`} onClick={() => { setMessage(''); setEditing(user) }} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-blue-600 hover:bg-blue-50"><Edit className="h-4 w-4" />Edit</button>
                      <button type="button" aria-label={`Hapus ${user.name} di ${user.businessName}`} disabled={lastOwner} title={lastOwner ? 'Cabang harus memiliki minimal satu Owner' : `Hapus ${user.name}`}
                        onClick={() => { setMessage(''); setDeleting(user) }} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-red-600 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed"><Trash2 className="h-4 w-4" />Hapus</button>
                    </div></td>
                  </tr>
                })}
            </tbody>
          </table>
        </div>
      </div>
      {editing && <EditUserModal user={editing} onClose={() => setEditing(null)} onSaved={saved} />}
      {deleting && <DeleteUserModal user={deleting} onClose={() => setDeleting(null)} onSaved={saved} />}
    </div>
  )
}
