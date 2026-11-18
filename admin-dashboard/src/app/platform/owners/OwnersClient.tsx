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
import type { OwnerAccount, OwnerFilters } from './types'

const route = '/platform/owners'
const dateFormat = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeZone: 'Asia/Makassar' })
const primary = 'rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50'
const secondary = 'rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50'
const field = 'mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

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
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
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
        className="grid items-end gap-3 rounded-xl border border-gray-100 bg-white p-4 shadow-sm sm:grid-cols-[minmax(0,1fr)_minmax(0,12rem)_auto]">
        <label className="text-sm font-medium text-gray-700">
          Cari Owner
          <input name="q" type="search" maxLength={120} defaultValue={filters.search} placeholder="Nama atau email" className={field} />
        </label>
        <label className="text-sm font-medium text-gray-700">
          Status
          <select name="status" defaultValue={filters.status} className={field}>
            <option value="">Semua status</option>
            <option value="active">Aktif</option>
            <option value="inactive">Nonaktif</option>
          </select>
        </label>
        <FilterSubmit className={primary}>Terapkan</FilterSubmit>
      </FilterForm>
      {message && <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-700">{message}</p>}

      <DataPanel label="Memuat akun Owner..." className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-600">
            <caption className="sr-only">Daftar akun Owner</caption>
            <thead className="bg-gray-50 text-xs uppercase text-gray-700">
              <tr>{['Nama dan email', 'Status', 'Cabang', 'Tanggal daftar', 'Aksi'].map(label => (
                <th key={label} scope="col" className="whitespace-nowrap px-4 py-3">{label}</th>
              ))}</tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {owners.map(owner => (
                <tr key={owner.id} className="hover:bg-gray-50">
                  <th scope="row" className="min-w-44 px-4 py-3 font-normal">
                    <Link href={`${route}/${owner.id}`} prefetch={false}
                      className="inline-block max-w-96 break-all font-semibold text-blue-600 hover:underline">
                      {ownerName(owner)}
                    </Link>
                    {owner.email && owner.name && <p className="mt-0.5 max-w-96 break-all">{owner.email}</p>}
                    {owner.email && !owner.email_confirmed && <p className="mt-1 text-xs text-gray-500">Email belum terverifikasi</p>}
                  </th>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className={`rounded-md px-2 py-1 text-xs font-medium ${owner.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                      {owner.status === 'active' ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums">{owner.branch_count.toLocaleString('id-ID')}</td>
                  <td className="whitespace-nowrap px-4 py-3">{owner.created_at ? dateFormat.format(new Date(owner.created_at)) : '—'}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <button type="button" onClick={() => { setMessage(''); setSelected(owner) }}
                      className={secondary} aria-label={`${owner.status === 'active' ? 'Nonaktifkan' : 'Aktifkan'} ${ownerName(owner)}`}>
                      {owner.status === 'active' ? 'Nonaktifkan' : 'Aktifkan'}
                    </button>
                  </td>
                </tr>
              ))}
              {!owners.length && <tr><td colSpan={5} className="p-8 text-center text-gray-500">Tidak ada akun Owner pada hasil ini.</td></tr>}
            </tbody>
          </table>
        </div>
        {(filters.page > 1 || hasNext) && <nav aria-label="Halaman akun Owner"
          className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 p-4 text-sm text-gray-600">
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
