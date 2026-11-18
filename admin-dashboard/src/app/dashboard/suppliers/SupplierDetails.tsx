'use client'

import { useId, useRef, useState } from 'react'
import AdminModal from '@/components/AdminModal'
import LoadingSpinner from '@/components/LoadingSpinner'
import { rupiah } from '@/lib/format'
import { getSupplierHistory } from './actions'
import type { HistoryCursor, Supplier, SupplierTransaction } from './types'

const tabs = [
  { value: 'profile', label: 'Profil' },
  { value: 'history', label: 'Riwayat Transaksi' },
] as const

const dateFormat = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeZone: 'UTC' })
const monthFormat = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' })

export default function SupplierDetails({ supplier, onClose }: { supplier: Supplier; onClose: () => void }) {
  const id = useId()
  const [tab, setTab] = useState<'profile' | 'history'>('profile')
  const [rows, setRows] = useState<SupplierTransaction[]>([])
  const [next, setNext] = useState<HistoryCursor | null>({ purchases: 0, expenses: 0 })
  const [loaded, setLoaded] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const busy = useRef(false)

  async function loadHistory() {
    if (!next || busy.current) return
    busy.current = true
    setPending(true)
    setError('')
    try {
      const result = await getSupplierHistory(supplier.id, next)
      if (result.error) {
        setError(result.error)
        return
      }
      setRows(previous => {
        const ids = new Set(previous.map(row => row.id))
        return [...previous, ...result.rows.filter(row => !ids.has(row.id))]
      })
      setNext(result.next)
      setLoaded(true)
    } catch {
      setError('Riwayat transaksi belum berhasil dimuat.')
    } finally {
      busy.current = false
      setPending(false)
    }
  }

  function selectTab(value: typeof tab) {
    setTab(value)
    if (value === 'history' && !loaded && !error) void loadHistory()
  }

  const profile = [
    ['Nama supplier', supplier.name],
    ['Kode supplier', supplier.code],
    ['Nama kontak', supplier.contact_name],
    ['Telepon', supplier.phone],
    ['Email', supplier.email],
    ['Status', supplier.is_active ? 'Aktif' : 'Nonaktif'],
    ['Alamat', supplier.address],
    ['Catatan', supplier.notes],
  ]

  return (
    <AdminModal title={supplier.name} description="Detail Supplier" wide="detail" pending={false} onClose={onClose}
      footer={<div className="flex justify-end"><button type="button" onClick={onClose} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">Tutup</button></div>}>
      <div className="space-y-4 p-5">
        <div role="tablist" aria-label="Detail supplier" className="flex gap-1 border-b border-gray-200">
          {tabs.map(({ value, label }) => (
            <button key={value} type="button" role="tab" id={`${id}-${value}`} aria-selected={tab === value}
              aria-controls={`${id}-panel`} tabIndex={tab === value ? 0 : -1} onClick={() => selectTab(value)}
              onKeyDown={event => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
                event.preventDefault()
                const target = event.key === 'Home' ? 'profile' : event.key === 'End' ? 'history' : value === 'profile' ? 'history' : 'profile'
                selectTab(target)
                document.getElementById(`${id}-${target}`)?.focus()
              }}
              className={`border-b-2 px-3 py-2 text-sm font-medium ${tab === value ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-900'}`}>
              {label}
            </button>
          ))}
        </div>
        <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${tab}`} tabIndex={0}>
          {tab === 'profile' ? (
            <dl className="grid gap-4 rounded-lg border border-gray-100 p-4 sm:grid-cols-2">
              {profile.map(([label, value]) => (
                <div key={label} className={label === 'Alamat' || label === 'Catatan' ? 'sm:col-span-2' : undefined}>
                  <dt className="text-xs font-medium text-gray-500">{label}</dt>
                  <dd className="mt-1 whitespace-pre-wrap break-words text-sm text-gray-900">{value || '—'}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <div className="space-y-3" aria-busy={pending}>
              {loaded && !rows.length && <p className="rounded-lg border border-gray-100 p-4 text-sm text-gray-500">Belum ada transaksi yang tercatat untuk supplier ini.</p>}
              {rows.length > 0 && (
                <ul className="divide-y divide-gray-100 rounded-lg border border-gray-100">
                  {rows.map(row => (
                    <li key={row.id} className="flex flex-wrap justify-between gap-2 p-3 text-sm">
                      <div className="min-w-0">
                        <p className="break-words font-medium">{row.label}</p>
                        <p className="mt-1 text-xs text-gray-500">
                          {(row.monthly ? monthFormat : dateFormat).format(new Date(`${row.date}T00:00:00Z`))} · {row.business}
                          {row.kind === 'expense' && ' · Pengeluaran'}
                        </p>
                        {row.reference && <p className="mt-1 break-all text-xs text-gray-500">{row.reference}</p>}
                      </div>
                      <p className="font-semibold tabular-nums">{row.currency === 'IDR' ? rupiah(row.amount) : `${row.amount.toLocaleString('id-ID')} ${row.currency}`}</p>
                    </li>
                  ))}
                </ul>
              )}
              {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>}
              {pending && <div className="py-2 text-sm text-gray-500"><LoadingSpinner label="Memuat riwayat transaksi..." showLabel /></div>}
              {!pending && next && (loaded || error) && (
                <button type="button" onClick={() => void loadHistory()} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                  {error ? 'Coba Lagi' : 'Muat Lebih Banyak'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </AdminModal>
  )
}
