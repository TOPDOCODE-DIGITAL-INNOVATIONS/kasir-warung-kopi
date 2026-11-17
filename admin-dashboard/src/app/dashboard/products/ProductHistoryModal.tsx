'use client'

import { useEffect, useState, type FormEvent } from 'react'
import DataPanel from '@/components/DataPanel'
import LoadingSpinner from '@/components/LoadingSpinner'
import { formatDateTime, rupiah, TZ } from '@/lib/format'
import { overviewRangeError, maxOverviewEnd } from '../overview-domain'
import { completeProductPurchase, getProductHistory, syncProductToPos } from './actions'
import { defaultHistoryRange, HISTORY_PAGE_SIZE, visiblePurchases } from './history-domain'
import type { ActionResult, HistoryData, HistoryRequest, ProductRow } from './types'
import Modal from './ProductDialog'

const input = 'w-full rounded-lg border border-gray-300 bg-white p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50'
const secondary = 'rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50'
const primary = 'rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50'
const quantity = (n: number) => n.toLocaleString('id-ID', { maximumFractionDigits: 6 })
const dateOnly = (date: string) => new Intl.DateTimeFormat('id-ID', { timeZone: TZ, dateStyle: 'medium' }).format(new Date(date))
const kinds = { purchase: 'Pembelian', adjustment: 'Penyesuaian', initial: 'Stok awal', tracking: 'Pengaturan stok', edit: 'Edit produk', archive: 'Hapus produk' }
const tabs = [
  { id: 'purchases', label: 'Dokumen Pembelian' },
  { id: 'adjustments', label: 'Opname & Penyesuaian Stok' },
  { id: 'events', label: 'Aktivitas Stok & Produk' },
] as const

export default function ProductHistoryModal({ product, onClose, onRefresh }: { product: ProductRow; onClose: () => void; onRefresh: () => void }) {
  const [range, setRange] = useState(defaultHistoryRange)
  const [draft, setDraft] = useState(range), [filterError, setFilterError] = useState('')
  const [tab, setTab] = useState<HistoryRequest['tab']>('purchases')
  const [sort, setSort] = useState<'newest' | 'cheapest'>('newest'), [distinct, setDistinct] = useState(false)
  const [cache, setCache] = useState<Record<string, HistoryData>>({})
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null)
  const [attempt, setAttempt] = useState(0), [message, setMessage] = useState(''), [actionError, setActionError] = useState('')
  const [operation, setOperation] = useState<string | null>(null)
  const [page, setPage] = useState({ key: '', count: HISTORY_PAGE_SIZE })
  const key = JSON.stringify([product.inventoryId, range.start, range.end, tab])
  const data = cache[key], error = failure?.key === key ? failure.message : ''
  const pending = operation !== null, loading = !data && !error
  const unit = product.unitCode === 'l' ? 'L' : product.unitCode
  const purchaseRows = visiblePurchases(data?.purchases ?? [], sort, distinct)
  const pageKey = `${key}:${sort}:${distinct}`, count = page.key === pageKey ? page.count : HISTORY_PAGE_SIZE
  const total = tab === 'purchases' ? purchaseRows.length : tab === 'adjustments' ? data?.adjustments.length ?? 0 : data?.events.length ?? 0

  useEffect(() => {
    if (data || error) return
    let active = true
    getProductHistory(product.inventoryId, { ...range, tab }).then(value => {
      if (active) {
        if (value.error) setFailure({ key, message: value.error })
        else setCache(previous => ({ ...Object.fromEntries(Object.entries(previous).slice(-2)), [key]: value }))
      }
    }).catch(cause => {
      if (active) setFailure({ key, message: cause instanceof Error ? cause.message : 'Riwayat belum berhasil dimuat.' })
    })
    return () => { active = false }
  }, [product.inventoryId, range, tab, key, data, error, attempt])

  function applyFilter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const error = overviewRangeError(draft.start, draft.end)
    setFilterError(error ?? '')
    if (!error) { setRange({ ...draft }); setFailure(null); setAttempt(v => v + 1) }
  }

  async function run(action: (form: FormData) => Promise<ActionResult>, id = 'sync') {
    setOperation(id); setActionError(''); setMessage('')
    const form = new FormData(); form.set('inventory_id', product.inventoryId)
    if (id !== 'sync') form.set('operation_id', id)
    try {
      const result = await action(form)
      if (result.success) setMessage(result.message)
      else setActionError(result.message)
      onRefresh(); setCache({}); setFailure(null); setAttempt(v => v + 1)
    } catch { setActionError('Perubahan belum berhasil diproses. Silakan coba kembali.') }
    finally { setOperation(null) }
  }

  return <Modal title="Riwayat Produk" description={`${product.name} · ${product.businessName}`} wide="history" pending={pending} onClose={onClose}
    footer={<div className="flex flex-wrap justify-end gap-3"><button type="button" disabled={pending || loading} onClick={() => run(syncProductToPos)} className={secondary}>{operation === 'sync' && <LoadingSpinner className="mr-2" />}Kirim Ulang ke Kasir</button><button type="button" disabled={pending} onClick={onClose} className={primary}>Tutup</button></div>}>
    <div className="space-y-4 p-5">
      <div><p className="mb-2 text-xs text-gray-500">Ringkasan seluruh riwayat</p>
        <div className="grid grid-cols-2 gap-3 break-words text-sm">
          <div className="rounded-lg bg-blue-50 p-3"><p className="text-gray-500">Penjualan selesai</p><p className="mt-1 font-semibold">{quantity(product.soldQuantity)} {unit}</p><p>{rupiah(product.soldAmount)}</p></div>
          <div className="rounded-lg bg-green-50 p-3"><p className="text-gray-500">Pembelian tercatat</p><p className="mt-1 font-semibold">{quantity(product.boughtQuantity)} {unit}</p><p>{rupiah(product.boughtAmount)}</p></div>
        </div>
      </div>
      <form onSubmit={applyFilter} className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
        <div className="grid grid-cols-2 items-end gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <label className="min-w-0 text-xs font-medium text-gray-700">Tanggal mulai<input aria-label="Tanggal mulai riwayat" type="date" required value={draft.start} disabled={pending} onChange={e => setDraft({ ...draft, start: e.target.value })} className={`${input} mt-1 min-w-0 text-xs sm:text-sm`} /></label>
          <label className="min-w-0 text-xs font-medium text-gray-700">Tanggal akhir<input aria-label="Tanggal akhir riwayat" type="date" required min={draft.start} max={maxOverviewEnd(draft.start) || undefined} value={draft.end} disabled={pending} onChange={e => setDraft({ ...draft, end: e.target.value })} className={`${input} mt-1 min-w-0 text-xs sm:text-sm`} /></label>
          <button type="submit" disabled={pending || loading} className={`${primary} col-span-2 sm:col-span-1`}>Terapkan</button>
        </div>
        <p className="text-xs text-gray-500">Default 1 bulan terakhir, maksimal 3 bulan. Filter berlaku pada isi tab; ringkasan di atas tetap seluruh riwayat.</p>
        {filterError && <p role="alert" className="text-xs text-red-600">{filterError}</p>}
      </form>
      {actionError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{actionError}</p>}
      {message && <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-700">{message}</p>}
      {product.pendingOperation && <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800"><p>Ada pembelian yang perlu diselesaikan.</p><button type="button" disabled={pending} onClick={() => run(completeProductPurchase, product.pendingOperation!)} className={secondary}>{operation === product.pendingOperation && <LoadingSpinner className="mr-2" />}Selesaikan Pembelian</button></div>}
      <div role="tablist" aria-label="Jenis riwayat produk" className="flex gap-1 overflow-x-auto border-b border-gray-200">
        {tabs.map((t, index) => <button key={t.id} type="button" role="tab" id={`history-tab-${t.id}`} aria-controls="history-panel" aria-selected={tab === t.id} tabIndex={tab === t.id ? 0 : -1} disabled={pending}
          onClick={() => setTab(t.id)} onKeyDown={event => {
            const next = event.key === 'ArrowRight' ? tabs[(index + 1) % tabs.length] : event.key === 'ArrowLeft' ? tabs[(index + tabs.length - 1) % tabs.length] : event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs[tabs.length - 1] : null
            if (next) { event.preventDefault(); setTab(next.id); document.getElementById(`history-tab-${next.id}`)?.focus() }
          }} className={`shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-left text-sm font-medium disabled:opacity-50 ${tab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-900'}`}>{t.label}</button>)}
      </div>
      {tab === 'purchases' && <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium text-gray-700">Urutkan<select value={sort} disabled={pending || loading} onChange={e => setSort(e.target.value as typeof sort)} className={`${input} mt-1`}><option value="newest">Pembelian terbaru</option><option value="cheapest">Harga per satuan termurah</option></select></label>
        <label className="text-xs font-medium text-gray-700">Tampilkan<select value={distinct ? 'distinct' : 'all'} disabled={pending || loading} onChange={e => setDistinct(e.target.value === 'distinct')} className={`${input} mt-1`}><option value="all">Semua pembelian</option><option value="distinct">Termurah per supplier berbeda</option></select></label>
      </div>}
      <DataPanel loading={loading || pending} label="Memuat riwayat produk..." className="min-h-48">
        <div role="tabpanel" id="history-panel" aria-labelledby={`history-tab-${tab}`} className="rounded-lg border border-gray-100">
          {error ? <div role="alert" className="space-y-3 p-4 text-sm text-red-600"><p>{error}</p><button type="button" onClick={() => { setFailure(null); setAttempt(v => v + 1) }} className={secondary}>Coba Lagi</button></div> : data && !total ? <p className="p-4 text-sm text-gray-500">Tidak ada catatan pada rentang tanggal ini.</p> : <ul className="divide-y divide-gray-100">
            {tab === 'purchases' && purchaseRows.slice(0, count).map(p => <li key={p.id} className="space-y-2 p-3 text-sm">
              <div className="flex flex-wrap justify-between gap-2"><p className="break-words font-semibold">{p.supplier}</p><time className="text-xs text-gray-500">{p.monthly ? `Bulanan · ${p.date.slice(0, 7)}` : p.source === 'expense' ? dateOnly(p.date) : formatDateTime(p.date)}</time></div>
              {p.address && <p className="break-words text-xs text-gray-500">Alamat supplier saat ini: {p.address}</p>}
              <div className="flex flex-wrap items-end justify-between gap-2"><div><p>{p.quantity == null ? 'Jumlah tidak dicatat' : `${quantity(p.quantity)} ${unit}`}</p><p className="mt-1 font-medium text-blue-600">{p.unitPrice == null ? 'Harga per satuan belum diketahui' : `${rupiah(p.unitPrice)} / ${unit}`}</p></div><div className="text-right"><p className="text-xs text-gray-500">Total pembelian</p><p className="font-semibold">{rupiah(p.amount)}</p></div></div>
              {p.note && <p className="whitespace-pre-wrap break-words text-gray-600">{p.note}</p>}
              <p className="text-xs text-gray-400">{p.source === 'expense' ? 'Pengeluaran produk' : p.number || 'Dokumen pembelian'} · Tercatat</p>
            </li>)}
            {tab === 'adjustments' && data?.adjustments.slice(0, count).map(item => <li key={item.id} className="space-y-1 p-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><span className="font-medium">{{ count: 'Stok opname', usage: 'Pemakaian', damage: 'Rusak / terbuang', addition: 'Penambahan lainnya' }[item.mode] ?? item.mode}</span><time className="text-xs text-gray-500">{formatDateTime(item.date)}</time></div><p>{quantity(item.before)} → {quantity(item.after)} {unit} · selisih {item.delta > 0 ? '+' : ''}{quantity(item.delta)}</p><p className="text-gray-500">{item.reason} · {item.by}</p></li>)}
            {tab === 'events' && data?.events.slice(0, count).map(e => <li key={e.id} className="space-y-1 p-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><span className="font-medium">{kinds[e.kind] ?? 'Aktivitas produk'}</span><time className="text-xs text-gray-500">{formatDateTime(e.at)}</time></div><p className="text-gray-600">{e.reason}</p><p className="text-xs text-gray-500">Stok: {e.before === -1 ? '∞' : quantity(e.before)} → {e.after === -1 ? '∞' : quantity(e.after)}</p>{e.status === 'pending' && <button type="button" disabled={pending} onClick={() => run(completeProductPurchase, e.id)} className={secondary}>{operation === e.id && <LoadingSpinner className="mr-2" />}Selesaikan Pembelian</button>}</li>)}
          </ul>}
          {data && total > count && <div className="border-t border-gray-100 p-3 text-center"><button type="button" disabled={pending} className={secondary} onClick={() => setPage({ key: pageKey, count: count + HISTORY_PAGE_SIZE })}>Muat Lebih Banyak</button></div>}
        </div>
      </DataPanel>
    </div>
  </Modal>
}
