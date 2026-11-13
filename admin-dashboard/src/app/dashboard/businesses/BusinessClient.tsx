'use client'

import { useState } from 'react'
import { addBusiness, updateBusiness, deleteBusiness, regenerateSyncToken } from './actions'
import { Plus, Edit, Trash2, Copy, Eye, EyeOff, RotateCw, Check, Link2, ExternalLink } from 'lucide-react'
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
      className="p-1.5 rounded hover:bg-gray-200 text-gray-600 flex items-center gap-1 text-xs"
    >
      {copied ? <Check className="w-4 h-4 text-green-600" /> : label ? <Link2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
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
  const [loading, setLoading] = useState(false)
  const [shownToken, setShownToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const editing = editingId ? initialBusinesses.find((b) => b.id === editingId) : undefined

  async function run(fn: () => Promise<void>) {
    setLoading(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium text-gray-700">URL Sync untuk kasir:</span>
        <code className="bg-gray-50 border border-gray-200 rounded px-2 py-1 break-all">{syncUrl}</code>
        <CopyButton text={syncUrl} />
        <span className="text-xs text-gray-500 w-full">
          Kasir yang dibuka dari domain ini (/kasir) otomatis memakai URL ini; cukup isi tokennya.
        </span>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{error}</p>}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 md:p-6 border-b border-gray-100 flex justify-between items-center">
          <h2 className="font-semibold text-lg text-gray-900">Cabang Aktif</h2>
          <button
            onClick={() => {
              setIsAdding(true)
              setEditingId(null)
            }}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center"
          >
            <Plus className="w-4 h-4 mr-2" />
            Tambah Cabang
          </button>
        </div>

        {(isAdding || editing) && (
          <div className="p-4 md:p-6 bg-gray-50 border-b border-gray-100">
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
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nama Cabang</label>
                <input
                  type="text"
                  name="name"
                  required
                  placeholder="Warung Kopi Pusat"
                  className="w-full border-gray-300 rounded-lg p-2.5 border bg-white"
                  defaultValue={editing?.name ?? ''}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Alamat</label>
                <textarea
                  name="address"
                  className="w-full border-gray-300 rounded-lg p-2.5 border bg-white"
                  defaultValue={editing?.address ?? ''}
                />
              </div>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsAdding(false)
                    setEditingId(null)
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50"
                >
                  {loading ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </form>
          </div>
        )}

        <ul className="divide-y divide-gray-100">
          {initialBusinesses.length === 0 ? (
            <li className="px-6 py-8 text-center text-gray-500 text-sm">Belum ada cabang usaha.</li>
          ) : (
            initialBusinesses.map((b) => {
              const visible = shownToken === b.id
              const cashierLink = `${kasirUrl}#token=${b.sync_token}`
              return (
                <li key={b.id} className="p-4 md:p-6 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900">{b.name}</p>
                      <p className="text-sm text-gray-500">{b.address || '-'}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        Sync terakhir: {b.last_synced_at ? formatDateTime(b.last_synced_at) : 'belum pernah'}
                        {b.last_device_code ? ` · perangkat ${b.last_device_code}` : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        title="Ubah"
                        onClick={() => {
                          setEditingId(b.id)
                          setIsAdding(false)
                        }}
                        className="p-2 rounded hover:bg-blue-50 text-blue-600"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        title="Hapus"
                        disabled={loading}
                        onClick={() => {
                          if (confirm(`Hapus cabang "${b.name}" beserta semua data transaksinya?`)) {
                            run(() => deleteBusiness(b.id))
                          }
                        }}
                        className="p-2 rounded hover:bg-red-50 text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1 text-sm">
                    <span className="text-gray-600 mr-1">Token sync:</span>
                    <code className="bg-gray-50 border border-gray-200 rounded px-2 py-1 font-mono text-xs break-all">
                      {visible ? b.sync_token : '•'.repeat(24)}
                    </code>
                    <button
                      type="button"
                      title={visible ? 'Sembunyikan' : 'Tampilkan'}
                      onClick={() => setShownToken(visible ? null : b.id)}
                      className="p-1.5 rounded hover:bg-gray-200 text-gray-600"
                    >
                      {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                    <CopyButton text={b.sync_token} />
                    <button
                      type="button"
                      title="Buat token baru"
                      disabled={loading}
                      onClick={() => {
                        if (confirm('Buat token baru? Kasir yang memakai token lama harus diisi ulang.')) {
                          run(() => regenerateSyncToken(b.id))
                        }
                      }}
                      className="p-1.5 rounded hover:bg-gray-200 text-gray-600 flex items-center gap-1 text-xs"
                    >
                      <RotateCw className="w-4 h-4" /> Ganti
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-1 text-sm">
                    <span className="text-gray-600 mr-1">Link kasir:</span>
                    {/* Token di bagian # tidak terkirim ke server/log; kasir menyimpannya lalu menghapusnya dari URL. */}
                    <a
                      href={cashierLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`Buka kasir ${b.name} di tab baru`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Buka Kasir
                      <span className="sr-only">{b.name}, di tab baru</span>
                    </a>
                    <CopyButton text={cashierLink} label="Salin link kasir" />
                    <span className="text-xs text-gray-500 w-full">
                      Buka link ini di HP mana pun: menu, kasir, pengaturan, dan transaksi cabang ini langsung ikut
                      tersinkron. Bagikan hanya ke kasir yang dipercaya (link berisi token).
                    </span>
                  </div>
                </li>
              )
            })
          )}
        </ul>
      </div>
    </div>
  )
}
