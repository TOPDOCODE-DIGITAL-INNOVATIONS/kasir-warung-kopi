'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import AdminModal from '@/components/AdminModal'
import DataPanel from '@/components/DataPanel'
import FilterForm, { FilterSubmit } from '@/components/FilterForm'
import SubmitButton from '@/components/SubmitButton'
import { useDataTransition } from '@/components/DataLoadingContext'
import { setOwnerStatus } from './actions'
import { Search, Users } from 'lucide-react'
import { Badge, EmptyState, Notice, filterBar, ui } from '@/components/ui'
import type { OwnerAccount, OwnerFilters } from './types'

const route = '/platform/owners'
const dateFormat = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeZone: 'Asia/Makassar' })
const primary = 'rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors'
const secondary = 'rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50'
const field = ui.input

function ownerName(owner: OwnerAccount) {
  return owner.name || owner.email || 'Owner'
}

function OwnerStatusDialog({ owner, onClose, onSaved }: {
  owner: OwnerAccount
  onClose: () => void
  onSaved: (message: string) => void
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const status = owner.status === 'active' ? 'inactive' : 'active'
  const label = status === 'active' ? 'Aktifkan Owner' : 'Nonaktifkan Owner'

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    const data = new FormData(event.currentTarget)
    setPending(true)
    setError('')
    try {
      const result = await setOwnerStatus(data)
      if (result.success) onSaved(result.message)
      else setError(result.message)
    } catch {
      setError('Status akun belum berhasil disimpan. Silakan coba lagi.')
    } finally {
      setPending(false)
    }
  }

  return (
    <AdminModal title={label} description={owner.email || ownerName(owner)} pending={pending} onClose={onClose}>
      <form onSubmit={submit} aria-busy={pending} className="space-y-4 p-5">
        <input type="hidden" name="id" value={owner.id} />
        <input type="hidden" name="previous_status" value={owner.status} />
        <input type="hidden" name="status" value={status} />
        <p className="text-sm text-gray-600">Status ini digunakan sebagai catatan administrasi akun.</p>
        {error && <Notice tone="error">{error}</Notice>}
        <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 pt-4">
          <button type="button" className={secondary} disabled={pending} onClick={onClose}>Batal</button>
          <SubmitButton pending={pending} className={primary}>{label}</SubmitButton>
        </div>
      </form>
    </AdminModal>
  )
}

export default function OwnersClient({ filters, owners, hasNext }: {
  filters: OwnerFilters; owners: OwnerAccount[]; hasNext: boolean
}) {
  const router = useRouter()
  const { startTransition } = useDataTransition()
  const [selected, setSelected] = useState<OwnerAccount | null>(null)
  const [message, setMessage] = useState('')

  function changePage(page: number) {
    const params = new URLSearchParams({ page: String(page) })
    if (filters.search) params.set('q', filters.search)
    if (filters.status) params.set('status', filters.status)
    setMessage('')
    startTransition(() => router.push(`${route}?${params}`, { scroll: false }))
  }

  return (
    <div className="space-y-4">
      <FilterForm key={`${filters.search}:${filters.status}`} action={route} onSubmit={() => setMessage('')}
        className={`${filterBar} grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,12rem)_auto]`}>
        <label className={ui.label}>
          Cari Owner
          <span className="relative block">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 mt-0.5 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input name="q" type="search" maxLength={120} defaultValue={filters.search} placeholder="Nama atau email" className={`${field} pl-9`} />
          </span>
        </label>
        <label className={ui.label}>
          Status
          <select name="status" defaultValue={filters.status} className={field}>
            <option value="">Semua status</option>
            <option value="active">Aktif</option>
            <option value="inactive">Nonaktif</option>
          </select>
        </label>
        <FilterSubmit className={primary}>Terapkan</FilterSubmit>
      </FilterForm>
      {message && <Notice tone="success" role="status">{message}</Notice>}

      <DataPanel label="Memuat akun Owner..." className="overflow-hidden rounded-2xl border border-gray-200/70 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-600">
            <caption className="sr-only">Daftar akun Owner</caption>
            <thead className="bg-gray-50/70 text-[11px] uppercase text-gray-500 tracking-[0.08em] border-b border-gray-100">
              <tr>{['Owner', 'Status', 'Cabang', 'Tanggal daftar', ''].map(label => (
                <th key={label || 'aksi'} scope="col" className={`whitespace-nowrap ${ui.th}`}>{label || <span className="sr-only">Aksi</span>}</th>
              ))}</tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {owners.map(owner => (
                <tr key={owner.id} className="transition-colors hover:bg-blue-50/30">
                  <th scope="row" className="min-w-56 px-5 py-3.5 font-normal">
                    <div className="flex items-center gap-3">
                      <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-espresso-900 text-xs font-semibold text-champagne">{ownerName(owner).slice(0, 1).toLocaleUpperCase('id')}</span>
                      <div className="min-w-0">
                        <Link href={`${route}/${owner.id}`} prefetch={false} title="Lihat detail Owner"
                          className="inline-block max-w-96 break-all font-semibold text-gray-900 hover:text-blue-700">
                          {ownerName(owner)}
                        </Link>
                        {owner.email && owner.name && <p className="mt-0.5 max-w-96 break-all text-xs text-gray-500">{owner.email}</p>}
                        {owner.email && !owner.email_confirmed && <Badge tone="amber" className="mt-1">Email belum terverifikasi</Badge>}
                      </div>
                    </div>
                  </th>
                  <td className="whitespace-nowrap px-5 py-3.5">
                    <Badge tone={owner.status === 'active' ? 'green' : 'gray'}>{owner.status === 'active' ? 'Aktif' : 'Nonaktif'}</Badge>
                  </td>
                  <td className="whitespace-nowrap px-5 py-3.5 tabular-nums">{owner.branch_count.toLocaleString('id-ID')}</td>
                  <td className="whitespace-nowrap px-5 py-3.5">{owner.created_at ? dateFormat.format(new Date(owner.created_at)) : '—'}</td>
                  <td className="whitespace-nowrap px-5 py-3.5 text-right">
                    <button type="button" onClick={() => { setMessage(''); setSelected(owner) }}
                      className={secondary} aria-label={`${owner.status === 'active' ? 'Nonaktifkan' : 'Aktifkan'} ${ownerName(owner)}`}>
                      {owner.status === 'active' ? 'Nonaktifkan' : 'Aktifkan'}
                    </button>
                  </td>
                </tr>
              ))}
              {!owners.length && <tr><td colSpan={5}><EmptyState icon={Users} title="Tidak ada akun Owner" description="Tidak ada akun Owner pada hasil ini. Ubah kata kunci atau filter status." /></td></tr>}
            </tbody>
          </table>
        </div>
        {(filters.page > 1 || hasNext) && <nav aria-label="Halaman akun Owner"
          className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 px-5 py-3.5 text-sm text-gray-600">
          <span>Halaman {filters.page}</span>
          <div className="flex gap-2">
            <button type="button" className={secondary} disabled={filters.page <= 1} onClick={() => changePage(filters.page - 1)}>Sebelumnya</button>
            <button type="button" className={secondary} disabled={!hasNext} onClick={() => changePage(filters.page + 1)}>Berikutnya</button>
          </div>
        </nav>}
      </DataPanel>

      {selected && <OwnerStatusDialog owner={selected} onClose={() => setSelected(null)} onSaved={notice => {
        setSelected(null)
        setMessage(notice)
      }} />}
    </div>
  )
}
