'use client'

import LoadingSpinner from '@/components/LoadingSpinner'
import DataPanel from '@/components/DataPanel'
import { useDataLoading } from '@/components/DataLoadingContext'

import { useState, useTransition } from 'react'
import { addBusiness, updateBusiness, deleteBusiness, regenerateSyncToken } from './actions'
import { Plus, Edit, Trash2, Copy, Eye, EyeOff, RotateCw, Check, Link2, ExternalLink, Server, Store } from 'lucide-react'
import Tooltip from '@/components/Tooltip'
import InfoTip from '@/components/InfoTip'
import { EmptyState, ui } from '@/components/ui'
import { formatDateTime } from '@/lib/format'

type Business = {
  id: string
  name: string
  address: string | null
  sync_token: string
  last_synced_at: string | null
  last_device_code: string | null
}

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      title="Salin"
      onClick={async () => {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      aria-label={label ?? 'Salin'}
      className={label ? 'inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50' : 'rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900'}
    >
      {copied ? <Check className="w-4 h-4 text-emerald-600" /> : label ? <Link2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
      {label && <span>{copied ? 'Tersalin' : label}</span>}
    </button>
  )
}

export default function BusinessClient({
  initialBusinesses,
  syncUrl,
  kasirUrl,
}: {
  initialBusinesses: Business[]
  syncUrl: string
  kasirUrl: string
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isAdding, setIsAdding] = useState(initialBusinesses.length === 0)
  const [loading, startTransition] = useTransition()
  const routePending = useDataLoading()
  const [operationKey, setOperationKey] = useState('save')
  const [shownToken, setShownToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const editing = editingId ? initialBusinesses.find((b) => b.id === editingId) : undefined

  function run(fn: () => Promise<void>, key = 'save') {
    setOperationKey(key)
    setError(null)
    return new Promise<void>(resolve => {
      startTransition(async () => {
        try { await fn() } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
        finally { resolve() }
      })
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-blue-100 bg-linear-to-r from-blue-50 to-white p-4 sm:flex-row sm:items-center sm:p-5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-blue-700 shadow-sm ring-1 ring-blue-100"><Server aria-hidden="true" className="h-[18px] w-[18px]" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900">URL Sync untuk kasir</p>
          <p className="mt-0.5 text-xs text-gray-500">Kasir yang dibuka dari domain ini (/kasir) otomatis memakai URL ini; cukup isi tokennya.</p>
        </div>
        <div className="flex min-w-0 items-center gap-1 rounded-xl bg-white px-3 py-1.5 ring-1 ring-gray-200">
          <code className="min-w-0 truncate font-mono text-xs text-gray-700" title={syncUrl}>{syncUrl}</code>
          <CopyButton text={syncUrl} />
        </div>
      </div>

      {error && <p className="text-sm text-red-700 bg-red-50 p-3 rounded-xl border border-red-100">{error}</p>}

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200/70 overflow-hidden">
        <div className="px-5 py-4 sm:px-6 border-b border-gray-100 flex justify-between items-center gap-3">
          <div>
            <h2 className="font-semibold text-[15px] text-gray-900">Cabang Aktif <span className="ml-1 text-sm font-normal text-gray-400">{initialBusinesses.length} cabang</span></h2>
            <p className="mt-0.5 text-xs text-gray-500">Setiap cabang punya token sync sendiri.</p>
          </div>
          <button
            onClick={() => {
              setIsAdding(true)
              setEditingId(null)
            }}
            className={ui.btnPrimary}
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
            Tambah Cabang
          </button>
        </div>

        {(isAdding || editing) && (
          <div className="border-b border-gray-100 bg-gray-50/70 px-5 py-5 sm:px-6">
            <form
              key={editingId ?? 'new'}
              action={(formData) =>
                run(async () => {
                  if (editing) {
                    await updateBusiness(editing.id, formData)
                    setEditingId(null)
                  } else {
                    await addBusiness(formData)
                    setIsAdding(false)
                  }
                })
              }
              className="grid max-w-3xl gap-4 sm:grid-cols-2"
            >
              <p className="text-sm font-semibold text-gray-900 sm:col-span-2">{editing ? `Ubah cabang ${editing.name}` : 'Cabang baru'}</p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nama Cabang</label>
                <input
                  type="text"
                  name="name"
                  required
                  placeholder="Warung Kopi Pusat"
                  className="rounded-xl border border-gray-200 bg-gray-50/60 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition-colors hover:border-gray-300 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100 w-full"
                  defaultValue={editing?.name ?? ''}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Alamat</label>
                <textarea
                  name="address"
                  rows={1}
                  className="rounded-xl border border-gray-200 bg-gray-50/60 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition-colors hover:border-gray-300 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100 w-full"
                  defaultValue={editing?.address ?? ''}
                />
              </div>
              <div className="flex justify-end gap-3 sm:col-span-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsAdding(false)
                    setEditingId(null)
                  }}
                  className="px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-200 rounded-xl"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl disabled:opacity-50 transition-colors"
                >
                  {loading && operationKey === 'save' && <LoadingSpinner className="mr-2" />}{loading && operationKey === 'save' ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </form>
          </div>
        )}

        <DataPanel loading={loading || routePending} label="Memuat cabang..."><ul className="grid grid-cols-1 gap-4 p-4 sm:p-6 xl:grid-cols-2">
          {initialBusinesses.length === 0 ? (
            <li className="xl:col-span-2"><EmptyState icon={Store} title="Belum ada cabang usaha" description="Tambahkan cabang pertama untuk mendapatkan token sync kasir." /></li>
          ) : (
            initialBusinesses.map((b) => {
              const visible = shownToken === b.id
              const cashierLink = `${kasirUrl}#token=${b.sync_token}`
              return (
                <li key={b.id} className="flex flex-col rounded-2xl border border-gray-200/70 bg-white transition-shadow hover:shadow-md">
                  <div className="flex items-start justify-between gap-3 p-5">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-espresso-900 text-champagne"><Store aria-hidden="true" className="h-5 w-5" /></span>
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900">{b.name}</p>
                        <p className="mt-0.5 text-sm text-gray-500">{b.address || 'Alamat belum diisi'}</p>
                        <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-gray-500">
                          <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${b.last_synced_at ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                          Sync terakhir: {b.last_synced_at ? formatDateTime(b.last_synced_at) : 'belum pernah'}
                          {b.last_device_code ? ` · perangkat ${b.last_device_code}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Tooltip content="Ubah nama & alamat cabang">
                        <button
                          type="button"
                          aria-label={`Ubah cabang ${b.name}`}
                          onClick={() => {
                            setEditingId(b.id)
                            setIsAdding(false)
                          }}
                          className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-blue-50 hover:text-blue-700"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                      </Tooltip>
                      <Tooltip content="Hapus cabang beserta semua data transaksinya">
                        <button
                          type="button"
                          aria-label={`Hapus cabang ${b.name}`}
                          disabled={loading}
                          onClick={() => {
                            if (confirm(`Hapus cabang "${b.name}" beserta semua data transaksinya?`)) {
                              run(() => deleteBusiness(b.id), `delete:${b.id}`)
                            }
                          }}
                          className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </Tooltip>
                    </div>
                  </div>

                  <div className="mt-auto space-y-4 rounded-b-2xl border-t border-gray-100 bg-gray-50/60 p-5">
                    <div>
                      <p className="mb-1.5 flex items-center gap-1 text-xs font-medium text-gray-500">Token sync <InfoTip label="Token sync" text="Isi token ini di aplikasi kasir cabang. Membuat token baru akan memutus kasir yang memakai token lama." /></p>
                      <div className="flex items-center gap-1 rounded-xl bg-white px-3 py-1.5 ring-1 ring-gray-200">
                        <code className="min-w-0 flex-1 truncate font-mono text-xs text-gray-700">{visible ? b.sync_token : '•'.repeat(24)}</code>
                        <Tooltip content={visible ? 'Sembunyikan token' : 'Tampilkan token'}>
                          <button
                            type="button"
                            aria-label={visible ? 'Sembunyikan token' : 'Tampilkan token'}
                            onClick={() => setShownToken(visible ? null : b.id)}
                            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                          >
                            {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </Tooltip>
                        <CopyButton text={b.sync_token} />
                        <Tooltip content="Buat token baru">
                          <button
                            type="button"
                            aria-label="Buat token baru"
                            disabled={loading}
                            onClick={() => {
                              if (confirm('Buat token baru? Kasir yang memakai token lama harus diisi ulang.')) {
                                run(() => regenerateSyncToken(b.id), `token:${b.id}`)
                              }
                            }}
                            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-40"
                          >
                            <RotateCw className="w-4 h-4" />
                          </button>
                        </Tooltip>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {/* Token di bagian # tidak terkirim ke server/log; kasir menyimpannya lalu menghapusnya dari URL. */}
                      <a
                        href={cashierLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={`Buka kasir ${b.name} di tab baru`}
                        className={`${ui.btnDark} py-2 text-xs`}
                      >
                        <ExternalLink className="w-4 h-4" />
                        Buka Kasir
                        <span className="sr-only">{b.name}, di tab baru</span>
                      </a>
                      <CopyButton text={cashierLink} label="Salin link kasir" />
                      <InfoTip label="Link kasir" text="Buka link ini di HP mana pun: menu, kasir, pengaturan, dan transaksi cabang ini langsung ikut tersinkron. Bagikan hanya ke kasir yang dipercaya (link berisi token)." />
                    </div>
                  </div>
                </li>
              )
            })
          )}
        </ul></DataPanel>
      </div>
    </div>
  )
}
