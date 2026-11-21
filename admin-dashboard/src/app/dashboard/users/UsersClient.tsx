'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { usePendingRefresh } from '@/hooks/usePendingRefresh'
import LoadingSpinner from '@/components/LoadingSpinner'
import { Edit, KeyRound, Plus, Trash2, Users, X } from 'lucide-react'
import Tooltip from '@/components/Tooltip'
import { Badge, EmptyState, Notice, PageHeader, Panel, ui } from '@/components/ui'
import { addCashier, deleteCashier, updateCashier } from './actions'
import { AVATAR_COLORS, CASHIER_ROLES, avatarColor, type CashierConfiguration, type CashierRow } from './types'

const inputClassName = 'rounded-xl border border-gray-200 bg-gray-50/60 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition-colors hover:border-gray-300 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100 w-full'
const cancelClassName = 'px-4 py-2 text-sm font-semibold text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-50'

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
      className="m-auto w-[calc(100%_-_2rem)] max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-gray-200/70 bg-white p-0 text-gray-900 shadow-xl backdrop:bg-espresso-900/45">
      <div className="flex items-start justify-between gap-4 border-b border-gray-100 p-5">
        <div>
          <h2 id="user-dialog-title" className="font-display text-xl font-semibold tracking-tight">{title}</h2>
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

function AddUserModal({ configuration, onClose, onSaved }: {
  configuration: CashierConfiguration; onClose: () => void; onSaved: (message: string) => void
}) {
  const [name, setName] = useState('')
  const [color, setColor] = useState<string>(AVATAR_COLORS[0].value)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  async function submit(formData: FormData) {
    setPending(true)
    setError('')
    try {
      const result = await addCashier(formData)
      if (result.success) onSaved(result.message)
      else setError(result.message)
    } catch { setError('User belum berhasil ditambahkan. Silakan coba kembali.') }
    finally { setPending(false) }
  }

  return <UserModal title="Tambah User Kasir" description={`Profil kasir di ${configuration.businessName}`} pending={pending} onClose={onClose}>
    <form action={submit} className="space-y-5 p-5" aria-busy={pending}>
      <input type="hidden" name="business_id" value={configuration.businessId} />
      <input type="hidden" name="config_version" value={configuration.configVersion ?? ''} />
      <fieldset disabled={pending} className="space-y-4">
        <div>
          <label htmlFor="new-cashier-name" className="mb-2 block text-sm font-medium text-gray-700">Nama</label>
          <input id="new-cashier-name" name="name" required maxLength={100} value={name} onChange={event => setName(event.target.value)} className={inputClassName} />
        </div>
        <div>
          <label htmlFor="new-cashier-role" className="mb-2 block text-sm font-medium text-gray-700">Role kasir</label>
          <select id="new-cashier-role" name="role" defaultValue={configuration.empty ? 'Owner' : 'Kasir'} className={inputClassName}>
            {CASHIER_ROLES.map(role => <option key={role} value={role}>{role}</option>)}
          </select>
          <p className="mt-2 text-xs text-gray-500">Role ini berlaku di aplikasi kasir dan tidak memberikan akun login dashboard.</p>
        </div>
        <div>
          <label htmlFor="new-cashier-color" className="mb-2 block text-sm font-medium text-gray-700">Warna avatar</label>
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white" style={{ backgroundColor: avatarColor(color).background }}>{name.trim().charAt(0).toUpperCase() || '?'}</span>
            <select id="new-cashier-color" name="avatar_color" value={color} onChange={event => setColor(event.target.value)} className={inputClassName}>
              {AVATAR_COLORS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="new-cashier-pin" className="mb-2 block text-sm font-medium text-gray-700">PIN kasir</label>
            <input id="new-cashier-pin" name="pin" type="password" inputMode="numeric" autoComplete="new-password" required pattern="[0-9]{4,6}" minLength={4} maxLength={6} aria-describedby="new-cashier-pin-help" className={inputClassName} />
          </div>
          <div>
            <label htmlFor="new-cashier-confirmation" className="mb-2 block text-sm font-medium text-gray-700">Konfirmasi PIN</label>
            <input id="new-cashier-confirmation" name="pin_confirmation" type="password" inputMode="numeric" autoComplete="new-password" required pattern="[0-9]{4,6}" minLength={4} maxLength={6} className={inputClassName} />
          </div>
        </div>
        <p id="new-cashier-pin-help" className="text-xs text-gray-500">Gunakan 4–6 digit angka. Profil dan PIN tersedia di perangkat kasir setelah sinkronisasi.</p>
      </fieldset>
      {error && <p role="alert" className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
        <button type="button" disabled={pending} onClick={onClose} className={cancelClassName}>Batal</button>
        <button type="submit" disabled={pending} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors">
          {pending && <LoadingSpinner className="mr-2" />}{pending ? 'Menyimpan...' : 'Tambah User'}
        </button>
      </div>
    </form>
  </UserModal>
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
        {error && <p role="alert" className="text-sm text-red-700 bg-red-50 p-3 rounded-xl border border-red-100">{error}</p>}
        <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
          <button type="button" disabled={pending} onClick={onClose} className={cancelClassName}>Batal</button>
          <button type="submit" disabled={pending} className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {pending && <LoadingSpinner className="mr-2" />}{pending ? 'Menyimpan...' : 'Simpan Perubahan'}
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
        {error && <p role="alert" className="text-sm text-red-700 bg-red-50 p-3 rounded-xl border border-red-100">{error}</p>}
        <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
          <button type="button" disabled={pending} onClick={onClose} className={cancelClassName}>Batal</button>
          <button type="submit" disabled={pending} className="px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-xl hover:bg-red-700 disabled:opacity-50">
            {pending && <LoadingSpinner className="mr-2" />}{pending ? 'Menghapus...' : 'Hapus User'}
          </button>
        </div>
      </form>
    </UserModal>
  )
}

export default function UsersClient({ users, configuration }: { users: CashierRow[]; configuration: CashierConfiguration | null }) {
  const { refreshing, refresh } = usePendingRefresh()
  const [editing, setEditing] = useState<CashierRow | null>(null)
  const [deleting, setDeleting] = useState<CashierRow | null>(null)
  const [message, setMessage] = useState('')
  const [adding, setAdding] = useState(false)
  const ownerCounts = new Map<string, number>()
  users.forEach((user) => { if (user.role === 'Owner') ownerCounts.set(user.businessId, (ownerCounts.get(user.businessId) ?? 0) + 1) })
  function saved(value: string) {
    setEditing(null)
    setDeleting(null)
    setAdding(false)
    setMessage(value)
    refresh()
  }

  const canAdd = !!(configuration?.ready || configuration?.empty) && !refreshing
  const roleTone = (role: string) => role === 'Owner' ? 'gold' as const : role === 'Supervisor' ? 'sky' as const : 'gray' as const
  const roleCounts = ['Owner', 'Supervisor', 'Kasir'].map(role => ({ role, count: users.filter(user => user.role === role).length }))

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Usaha & Tim" title="Kelola User" description="Kelola profil dan hak akses kasir pada setiap cabang usaha Anda. Perubahan diterima perangkat pada sinkronisasi berikutnya."
        actions={<button type="button" disabled={!canAdd} onClick={() => { setMessage(''); setAdding(true) }} className={ui.btnPrimary}><Plus aria-hidden="true" className="h-4 w-4" />Tambah User</button>} />
      {message && <Notice tone="success" role="status">{message}</Notice>}
      {configuration?.empty && <Notice tone="info">Cabang ini belum punya user kasir. Tambahkan user pertama dengan role <strong>Owner</strong>; menu kasir dimulai kosong dan perangkat kasir cabang ini akan memakai data dari sini.</Notice>}
      {configuration && !configuration.ready && !configuration.empty && <Notice tone="warning">Konfigurasi kasir cabang tidak valid. Sinkronkan aplikasi kasir lalu muat ulang halaman.</Notice>}

      <Panel loading={refreshing} title={<>Tim Kasir <span className="ml-1 text-sm font-normal text-gray-400">{users.length} user</span></>}
        description="Owner dapat mengelola semua fitur kasir; setiap cabang wajib punya minimal satu Owner."
        actions={<ul aria-label="Jumlah per role" className="flex flex-wrap gap-1.5">{roleCounts.map(({ role, count }) => <li key={role}><Badge tone={roleTone(role)}>{role} · {count}</Badge></li>)}</ul>}>
        {users.length === 0
          ? <EmptyState icon={Users} title="Belum ada user kasir" description="Sinkronkan aplikasi kasir pada cabang ini atau tambahkan user pertama." />
          : <ul aria-busy={refreshing} className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {users.map((user) => {
              const lastOwner = user.role === 'Owner' && ownerCounts.get(user.businessId) === 1
              return <li key={`${user.businessId}:${user.id}`} className="group flex flex-col rounded-2xl border border-gray-200/70 bg-white p-4 transition-all hover:border-blue-200 hover:shadow-md">
                <div className="flex items-start gap-3">
                  <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-base font-semibold text-white ring-4 ring-gray-50" style={{ backgroundColor: avatarColor(user.avatarColor).background }}>{user.name.trim().charAt(0).toUpperCase() || '?'}</span>
                  <div className="min-w-0 flex-1">
                    <p className="break-words font-semibold text-gray-900">{user.name}</p>
                    <p className="mt-0.5 truncate text-xs text-gray-500">{user.businessName}</p>
                  </div>
                  <Badge tone={roleTone(user.role)}>{user.role}</Badge>
                </div>
                <div className="mt-4 flex items-center justify-between gap-2 border-t border-gray-100 pt-3">
                  <span className={`inline-flex items-center gap-1.5 text-xs ${user.hasPin ? 'text-emerald-700' : 'text-amber-700'}`}>
                    <KeyRound aria-hidden="true" className="h-3.5 w-3.5" />{user.hasPin ? 'PIN sudah diatur' : 'PIN belum diatur'}
                  </span>
                  <div className="flex items-center gap-1">
                    <Tooltip content={`Edit profil ${user.name}`}>
                      <button type="button" aria-label={`Edit ${user.name} di ${user.businessName}`} onClick={() => { setMessage(''); setEditing(user) }} className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-blue-50 hover:text-blue-700"><Edit className="h-4 w-4" /></button>
                    </Tooltip>
                    <Tooltip content={lastOwner ? 'Cabang harus memiliki minimal satu Owner' : `Hapus ${user.name}`}>
                      <button type="button" aria-label={`Hapus ${user.name} di ${user.businessName}`} disabled={lastOwner}
                        onClick={() => { setMessage(''); setDeleting(user) }} className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"><Trash2 className="h-4 w-4" /></button>
                    </Tooltip>
                  </div>
                </div>
              </li>
            })}
          </ul>}
      </Panel>
      {editing && <EditUserModal user={editing} onClose={() => setEditing(null)} onSaved={saved} />}
      {deleting && <DeleteUserModal user={deleting} onClose={() => setDeleting(null)} onSaved={saved} />}
      {adding && (configuration?.ready || configuration?.empty) && <AddUserModal configuration={configuration} onClose={() => setAdding(false)} onSaved={saved} />}
    </div>
  )
}
