'use client'

import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, DatabaseBackup, Download, FileJson, FileSpreadsheet, Loader2 } from 'lucide-react'
import { BACKUP_DATASETS, validateBackupFilters, type BackupDataset, type BackupFormat } from '@/lib/backup'
import { formatDateTime } from '@/lib/format'
import { formatRange } from '@/lib/book-period'

type LastDownload = { filename: string; label: string; format: BackupFormat; size: number; time: string }

export default function BackupClient({ businesses, initialBusinessId, unavailable }: {
  businesses: { id: string; name: string }[]
  initialBusinessId: string | null
  unavailable: boolean
}) {
  const [businessId, setBusinessId] = useState(businesses.some((business) => business.id === initialBusinessId) ? initialBusinessId! : '')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastDownload, setLastDownload] = useState<LastDownload | null>(null)
  const controller = useRef<AbortController | null>(null)
  useEffect(() => () => controller.current?.abort(), [])

  const filters = { businessId: businessId || null, start, end }
  const invalid = validateBackupFilters(filters)
  const disabled = !!pending || !!invalid || unavailable || businesses.length === 0
  const branchLabel = businesses.find((business) => business.id === businessId)?.name ?? 'Semua cabang'
  const periodLabel = start && end && !invalid ? formatRange(start, end) : start ? `Mulai ${start}` : end ? `Sampai ${end}` : 'Seluruh periode'

  async function download(dataset: BackupDataset | 'all', format: BackupFormat, itemsOnly = false) {
    if (controller.current || disabled) return
    const abort = new AbortController()
    controller.current = abort
    const task = `${dataset}-${format}${itemsOnly ? '-items' : ''}`
    setPending(task)
    setError(null)
    try {
      const params = new URLSearchParams({ dataset, format })
      if (businessId) params.set('b', businessId)
      if (start) params.set('start', start)
      if (end) params.set('end', end)
      if (itemsOnly) params.set('view', 'items')
      const response = await fetch(`/api/backup?${params}`, { signal: abort.signal, cache: 'no-store' })
      if (!response.ok) {
        const body = await response.json()
        throw new Error(body.error || 'Backup gagal diunduh. Silakan coba lagi.')
      }
      const blob = await response.blob()
      const filename = response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] ?? `backup-${dataset}.${format}`
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setLastDownload({
        filename,
        label: itemsOnly ? 'Detail Item Transaksi' : dataset === 'all' ? 'Seluruh Kategori' : BACKUP_DATASETS.find((entry) => entry.id === dataset)!.label,
        format,
        size: blob.size,
        time: new Date().toISOString(),
      })
    } catch (failure) {
      if (!abort.signal.aborted) setError(failure instanceof Error ? failure.message : 'Backup gagal diunduh. Silakan coba lagi.')
    } finally {
      controller.current = null
      setPending(null)
    }
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
      <section className="xl:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 md:p-6 border-b border-gray-100 flex items-center gap-3">
          <DatabaseBackup className="w-6 h-6 text-blue-600 shrink-0" />
          <div>
            <h2 className="font-semibold text-lg text-gray-900">Backup Data</h2>
            <p className="text-sm text-gray-500 mt-1">Pilih cabang dan periode, lalu unduh kategori data yang dibutuhkan.</p>
          </div>
        </div>

        <div className="p-4 md:p-6 space-y-6">
          <fieldset disabled={!!pending || unavailable} className="space-y-3">
            <legend className="text-sm font-medium text-gray-900 mb-3">Filter backup</legend>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label htmlFor="backup-business" className="block text-sm font-medium text-gray-700 mb-1.5">Cabang</label>
                <select id="backup-business" value={businessId} onChange={(event) => setBusinessId(event.target.value)} className="w-full bg-white border border-gray-300 text-gray-900 text-sm rounded-lg p-2.5 disabled:opacity-50">
                  <option value="">Semua Cabang</option>
                  {businesses.map((business) => <option key={business.id} value={business.id}>{business.name}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="backup-start" className="block text-sm font-medium text-gray-700 mb-1.5">Tanggal mulai</label>
                <input
                  id="backup-start"
                  type="date"
                  min="0001-01-01"
                  max={end || '9999-12-31'}
                  value={start}
                  onChange={(event) => setStart(event.target.value)}
                  onInput={(event) => setStart(event.currentTarget.value)}
                  aria-describedby="backup-date-help"
                  aria-invalid={!!invalid}
                  className="w-full border border-gray-300 text-gray-900 text-sm rounded-lg p-2.5 disabled:opacity-50"
                />
              </div>
              <div>
                <label htmlFor="backup-end" className="block text-sm font-medium text-gray-700 mb-1.5">Tanggal akhir</label>
                <input
                  id="backup-end"
                  type="date"
                  min={start || '0001-01-01'}
                  max="9999-12-31"
                  value={end}
                  onChange={(event) => setEnd(event.target.value)}
                  onInput={(event) => setEnd(event.currentTarget.value)}
                  aria-describedby="backup-date-help"
                  aria-invalid={!!invalid}
                  className="w-full border border-gray-300 text-gray-900 text-sm rounded-lg p-2.5 disabled:opacity-50"
                />
              </div>
            </div>
            <div className="flex flex-wrap justify-between items-start gap-2">
              <p id="backup-date-help" className="text-xs text-gray-500">Kosongkan tanggal untuk seluruh periode. Rentang mencakup hari terakhir dalam WIB.</p>
              <button type="button" onClick={() => { setBusinessId(''); setStart(''); setEnd(''); setError(null) }} className="text-xs font-medium text-blue-600 hover:text-blue-700 disabled:opacity-50">Reset filter</button>
            </div>
          </fieldset>

          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-sm text-blue-800 space-y-1">
            <p>Cabang, master kasir, dan produk selalu memuat seluruh data master dari cabang pilihan.</p>
            <p className="text-xs text-blue-700">Data bulanan ikut diambil bila bulannya beririsan dengan periode yang dipilih.</p>
          </div>

          {businesses.length === 0 && !unavailable && <p className="text-sm text-gray-500 bg-gray-50 p-3 rounded-lg">Buat cabang terlebih dahulu melalui menu Cabang &amp; Token untuk menyiapkan backup.</p>}
          {(invalid || error) && <p role="alert" className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{invalid || error}</p>}

          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Unduh per kategori</h3>
            <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg overflow-hidden">
              {BACKUP_DATASETS.map((dataset) => (
                <div key={dataset.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="font-medium text-sm text-gray-900">{dataset.label}</h4>
                    <p className="text-xs text-gray-500 mt-1">{dataset.description}</p>
                    <p className="text-xs text-gray-400 mt-1">{dataset.dateLabel}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {(['json', 'csv'] as const).map((format) => (
                      <button key={format} type="button" disabled={disabled} onClick={() => download(dataset.id, format)} aria-label={`Unduh ${dataset.label} ${format.toUpperCase()}`} className="inline-flex items-center justify-center gap-1.5 border border-gray-200 rounded-lg px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">
                        {pending === `${dataset.id}-${format}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                        {format.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <aside className="space-y-6">
        <section className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-4 md:p-6 border-b border-gray-100">
            <h2 className="font-semibold text-lg text-gray-900">Ringkasan Backup</h2>
            <p className="text-sm text-gray-500 mt-1">Unduhan mengikuti filter yang sedang dipilih.</p>
          </div>
          <div className="p-4 md:p-6 space-y-5">
            <dl className="space-y-3 text-sm">
              <div><dt className="text-gray-500">Cabang</dt><dd className="font-medium text-gray-900 mt-1 break-words">{branchLabel}</dd></div>
              <div><dt className="text-gray-500">Periode data operasional</dt><dd className="font-medium text-gray-900 mt-1">{invalid ? 'Periksa rentang tanggal' : periodLabel}</dd></div>
              <div><dt className="text-gray-500">Kategori tersedia</dt><dd className="font-medium text-gray-900 mt-1">{BACKUP_DATASETS.length} kategori</dd></div>
            </dl>
            <button type="button" disabled={disabled} onClick={() => download('all', 'json')} className="w-full inline-flex items-center justify-center gap-2 bg-blue-600 text-white rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
              {pending === 'all-json' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileJson className="w-4 h-4" />}
              Unduh JSON Lengkap
            </button>
            <p className="text-xs text-gray-500">Seluruh kategori dalam satu berkas, termasuk versi format, waktu ekspor, ID relasi, dan jumlah data.</p>
            <button type="button" disabled={disabled} onClick={() => download('transactions', 'csv', true)} className="w-full inline-flex items-center justify-center gap-2 border border-gray-200 text-gray-700 rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">
              {pending === 'transactions-csv-items' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
              Detail Item Transaksi CSV
            </button>
          </div>
        </section>

        <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 md:p-6 space-y-3" aria-live="polite" aria-busy={!!pending}>
          <h2 className="font-semibold text-gray-900">Unduhan Terakhir</h2>
          {pending ? (
            <p className="flex items-center gap-2 text-sm text-blue-600"><Loader2 className="w-4 h-4 animate-spin shrink-0" />Menyiapkan berkas backup…</p>
          ) : lastDownload ? (
            <div className="space-y-2 text-sm">
              <p className="flex items-center gap-2 font-medium text-green-700"><CheckCircle2 className="w-4 h-4 shrink-0" />Berkas siap diunduh</p>
              <p className="font-medium text-gray-900">{lastDownload.label} · {lastDownload.format.toUpperCase()}</p>
              <p className="text-xs text-gray-500">{formatDateTime(lastDownload.time)} WIB · {new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 }).format(lastDownload.size / 1024)} KB</p>
              <p className="text-xs text-gray-400 break-all">{lastDownload.filename}</p>
            </div>
          ) : <p className="text-sm text-gray-500">Berkas yang kamu unduh pada halaman ini akan ditampilkan di sini.</p>}
        </section>

        <div className="text-xs text-gray-500 space-y-2 px-1">
          <p>Backup memuat data yang sudah tersinkron ke dashboard. Lakukan sync perangkat kasir terlebih dahulu untuk menyertakan perubahan terbaru.</p>
          <p>JSON mempertahankan struktur data lengkap. CSV menyimpan kolom bertingkat sebagai teks JSON agar tetap bisa diolah.</p>
          <p>Token sync dan kredensial login dikelola melalui pengaturan aplikasi.</p>
        </div>
      </aside>
    </div>
  )
}
