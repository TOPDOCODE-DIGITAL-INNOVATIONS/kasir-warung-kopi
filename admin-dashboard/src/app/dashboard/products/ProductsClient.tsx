'use client'

import { useRef, useState, type ReactNode } from 'react'
import { usePendingRefresh } from '@/hooks/usePendingRefresh'
import LoadingSpinner from '@/components/LoadingSpinner'
import DataPanel from '@/components/DataPanel'
import { AlertTriangle, ClipboardList, Info, MoreHorizontal, Package, Plus, Search, ShoppingCart, Truck } from 'lucide-react'
import { Badge, EmptyState, Notice, PageHeader, StatCard, ui } from '@/components/ui'
import { dayKey, formatDateTime, rupiah } from '@/lib/format'
import { deleteProduct, saveProduct } from './actions'
import type { ProductPageData, ProductRow } from './types'
import MoneyInput from './MoneyInput'
import StockCountModal from './StockCountModal'
import ProductImageInput from './ProductImageInput'
import Modal from './ProductDialog'
import HistoryModal from './ProductHistoryModal'

const input = 'rounded-xl border border-gray-200 bg-gray-50/60 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition-colors hover:border-gray-300 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100 w-full disabled:bg-gray-50 disabled:text-gray-500'
const secondary = 'px-4 py-2 text-sm font-semibold text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-50'
const primary = 'px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors'
const unitLabel = (code: string) => code === 'l' ? 'L' : code
const quantity = (n: number) => n.toLocaleString('id-ID', { maximumFractionDigits: 6 })
type ModalState = { kind: 'create' | 'count' } | { kind: 'edit' | 'stock' | 'delete' | 'history'; product: ProductRow }

function Field({ label, htmlFor, children, help }: { label: string; htmlFor: string; children: ReactNode; help?: string }) {
  return <div><label htmlFor={htmlFor} className="mb-2 block text-sm font-medium text-gray-700">{label}</label>{children}{help && <p className="mt-1.5 text-xs text-gray-500">{help}</p>}</div>
}
function Check({ name, label, value, onChange, help }: { name: string; label: string; value: boolean; onChange: (v: boolean) => void; help?: string }) {
  return <label className="flex cursor-pointer items-start gap-2.5 text-sm text-gray-700"><input type="checkbox" name={name} checked={value} onChange={e => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 accent-blue-600" /><span>{label}{help && <span className="mt-1 block text-xs text-gray-500">{help}</span>}</span></label>
}
function Feedback({ error }: { error: string }) {
  return error ? <p role="alert" className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null
}
function Footer({ pending, onClose, label = 'Simpan', disabled = false }: { pending: boolean; onClose: () => void; label?: string; disabled?: boolean }) {
  return <div className="flex justify-end gap-3 border-t border-gray-100 pt-4"><button type="button" disabled={pending || disabled} onClick={onClose} className={secondary}>Batal</button><button type="submit" disabled={pending || disabled} className={primary}>{pending && <LoadingSpinner className="mr-2" />}{pending ? 'Menyimpan...' : label}</button></div>
}
function Identity({ product }: { product: ProductRow }) {
  return <><input type="hidden" name="inventory_id" value={product.inventoryId} /><input type="hidden" name="version" value={product.version} /></>
}

function ProductForm({ data, selectedBranch, product, onClose, onSaved, onRefresh }: {
  data: ProductPageData; selectedBranch: string | null; product?: ProductRow; onClose: () => void; onSaved: (message: string) => void; onRefresh: () => void
}) {
  const [operation] = useState(() => crypto.randomUUID())
  const [business, setBusiness] = useState(product?.businessId ?? selectedBranch ?? data.businesses[0]?.id ?? '')
  const [buy, setBuy] = useState(product?.canBuy ?? false), [sell, setSell] = useState(product?.canSell ?? true)
  const [track, setTrack] = useState(product ? product.stock !== -1 : false)
  const [available, setAvailable] = useState(product?.available ?? true)
  const [unit, setUnit] = useState(product?.baseUnitId ?? data.units.find(u => u.code === 'pcs')?.id ?? '')
  const [pending, setPending] = useState(false), [error, setError] = useState('')
  const [photo, setPhoto] = useState<File | null>(null), [removePhoto, setRemovePhoto] = useState(false)
  const [processingPhoto, setProcessingPhoto] = useState(false)
  const [firstPurchase, setFirstPurchase] = useState(false)
  const [purchaseQuantity, setPurchaseQuantity] = useState(''), [purchaseTotal, setPurchaseTotal] = useState('')
  const [salePrice, setSalePrice] = useState(String(product?.price ?? 0)), [costValue, setCostValue] = useState(product?.cost == null ? '' : String(product.cost))
  const [category, setCategory] = useState(product?.categoryId ?? '')
  const [costChecked, setCostChecked] = useState(false)
  const hasFirstPurchase = !product && buy && firstPurchase
  const uploaded = useRef<{ file: File; url: string } | null>(null)
  const branch = data.businesses.find(b => b.id === business), unitCode = unitLabel(data.units.find(u => u.id === unit)?.code ?? '')
  const needsCostCheck = !!product && sell && !product.costVerified
  const hppField = <Field label={`HPP per ${unitCode} (Rp)`} htmlFor="product-cost" help={buy
    ? `Modal untuk 1 ${unitCode}. Otomatis diperbarui dari harga beli terakhir di Pengeluaran.${sell ? '' : ' Opsional untuk bahan.'}`
    : `Modal bahan/produksi untuk 1 ${unitCode}. Wajib, dipakai untuk menghitung Laba Kotor.`}>
    <MoneyInput id="product-cost" name="cost_price" defaultValue={costValue === '' ? null : Number(costValue)} onValueChange={setCostValue} required={sell} className={input} placeholder="Belum diisi" /></Field>
  async function submit(form: FormData) {
    if (processingPhoto) return
    setPending(true); setError('')
    try {
      form.set('image_intent', photo ? 'replace' : removePhoto ? 'remove' : 'keep')
      if (photo) {
        if (uploaded.current?.file !== photo) {
          const upload = new FormData()
          upload.set('file', photo); upload.set('business_id', business); upload.set('product_id', product?.inventoryId ?? operation)
          const response = await fetch('/api/products/image', { method: 'POST', body: upload })
          const result = await response.json()
          if (!response.ok || typeof result.url !== 'string') throw new Error(result.error || 'Foto belum berhasil diunggah.')
          uploaded.current = { file: photo, url: result.url }
        }
        form.set('image_url', uploaded.current.url)
      }
      const r = await saveProduct(form)
      if (r.success) onSaved(r.message)
      else { setError(r.message); if (r.refresh) onRefresh() }
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Produk belum berhasil disimpan. Silakan coba kembali.') }
    finally { setPending(false) }
  }
  return <Modal title={product ? 'Edit Produk' : 'Produk Baru'} description="Atur identitas, harga, dan pencatatan stok produk cabang." wide pending={pending || processingPhoto} onClose={onClose}>
    <form action={submit} className="space-y-5 p-5" aria-busy={pending}>
      <input type="hidden" name="operation_id" value={operation} /><input type="hidden" name="inventory_id" value={product?.inventoryId ?? ''} />
      <input type="hidden" name="version" value={product?.version ?? ''} />
      {product && <input type="hidden" name="business_id" value={business} />}
      <fieldset disabled={pending} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Cabang" htmlFor="product-branch"><select id="product-branch" name={product ? undefined : 'business_id'} disabled={!!product} value={business} onChange={e => setBusiness(e.target.value)} className={input} required>{data.businesses.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
          <Field label="Nama produk" htmlFor="product-name"><input id="product-name" name="name" defaultValue={product?.name} required maxLength={150} className={input} autoFocus /></Field>
          <Field label="SKU (opsional)" htmlFor="product-sku"><input id="product-sku" name="sku" defaultValue={product?.sku} maxLength={100} className={input} /></Field>
          <Field label="Satuan dasar" htmlFor="product-unit" help={product ? 'Satuan dasar tetap agar histori tidak berubah.' : 'Jumlah pembelian dan saldo stok menggunakan satuan ini.'}><select id="product-unit" name="base_unit_id" disabled={!!product} value={unit} onChange={e => setUnit(e.target.value)} required className={input}>{data.units.map(u => <option key={u.id} value={u.id}>{unitLabel(u.code)} — {u.name}</option>)}</select></Field>
        </div>
        <div className="grid gap-4 rounded-xl border border-gray-200 bg-gray-50/70 p-4 sm:grid-cols-2">
          <Check name="can_buy" label="Dibeli" help="Bahan atau barang dari supplier." value={buy} onChange={setBuy} />
          <Check name="can_sell" label="Dijual" help="Ditampilkan sebagai menu kasir setelah sinkronisasi." value={sell} onChange={setSell} />
        </div>
        {!buy && !sell && <p className="text-sm text-amber-700">Pilih minimal Dibeli atau Dijual.</p>}
        {sell ? <section className="space-y-4 rounded-xl border border-gray-200 p-4" aria-labelledby="sale-settings-title">
          <div><h3 id="sale-settings-title" className="text-sm font-semibold text-gray-900">Penjualan</h3><p className="mt-1 text-xs text-gray-500">Atur harga yang dibayar pelanggan dan tampilan produk di kasir.</p></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={`Harga jual per ${unitCode} (Rp)`} htmlFor="product-price"><MoneyInput id="product-price" name="price" defaultValue={salePrice === '' ? null : Number(salePrice)} onValueChange={setSalePrice} required className={input} /></Field>
            <Field label="Kategori kasir (opsional)" htmlFor="product-category"><select key={business} id="product-category" name="category_id" value={category} onChange={e => setCategory(e.target.value)} className={input}><option value="">Tanpa kategori</option>{branch?.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
            {!hasFirstPurchase && hppField}
          </div>
          {needsCostCheck && <Check name="cost_verified" label="HPP di atas sudah saya cek dan benar" value={costChecked} onChange={setCostChecked}
            help="HPP produk ini belum pernah dicek. Penjualannya belum dihitung di Laba Kotor sampai HPP dikonfirmasi." />}
          <Check name="is_available" label="Bisa dipesan di kasir" value={available} onChange={setAvailable} help="Matikan jika sedang habis. Produk tetap tampil di kasir, tetapi tidak bisa dipilih." />
        </section> : <><input type="hidden" name="price" value={salePrice} /><input type="hidden" name="category_id" value={category} />{available && <input type="hidden" name="is_available" value="on" />}</>}
        {buy && <section className="space-y-4 rounded-xl border border-gray-200 p-4" aria-labelledby="purchase-settings-title">
          <div><h3 id="purchase-settings-title" className="text-sm font-semibold text-gray-900">Pembelian</h3><p className="mt-1 text-xs text-gray-500">{product ? 'Pembelian berikutnya dicatat melalui menu Pengeluaran. HPP otomatis mengikuti harga beli terakhir.' : 'Pembelian pertama opsional. Produk tetap dapat disimpan jika barang belum dibeli.'}</p></div>
          {!sell && !hasFirstPurchase && <div className="grid gap-4 sm:grid-cols-2">{hppField}</div>}
          {!product && <Check name="initial_purchase" label="Catat pembelian pertama" help="Mencatat jumlah barang, dokumen pembelian, dan pengeluaran sekaligus." value={firstPurchase} onChange={setFirstPurchase} />}
          {hasFirstPurchase && <div className="space-y-4 border-t border-gray-100 pt-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Tanggal pembelian" htmlFor="product-purchase-date"><input id="product-purchase-date" name="purchase_date" type="date" defaultValue={dayKey(new Date())} required className={input} /></Field>
              <Field label="Supplier (opsional)" htmlFor="product-purchase-supplier"><select id="product-purchase-supplier" name="purchase_supplier" defaultValue="" className={input}><option value="">Tanpa supplier</option>{data.suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
              <Field label={`Jumlah dibeli (${unitCode})`} htmlFor="product-purchase-quantity" help="Gunakan jumlah dalam satuan dasar yang dipilih di atas."><input id="product-purchase-quantity" name="purchase_quantity" type="number" min="0.000001" max="999999999" step="0.000001" value={purchaseQuantity} onChange={e => setPurchaseQuantity(e.target.value)} required className={input} /></Field>
              <Field label="Total pembelian (Rp)" htmlFor="product-purchase-total" help="Nominal untuk seluruh jumlah barang, bukan harga per satuan."><MoneyInput id="product-purchase-total" name="purchase_total" defaultValue={purchaseTotal === '' ? null : Number(purchaseTotal)} onValueChange={setPurchaseTotal} required className={input} placeholder="Total yang dibayar" /></Field>
            </div>
            <Field label="Catatan pembelian (opsional)" htmlFor="product-purchase-note"><input id="product-purchase-note" name="purchase_note" maxLength={500} placeholder="Pembelian pertama" className={input} /></Field>
            {Number(purchaseQuantity) > 0 && Number(purchaseTotal) > 0 && <p className="rounded-xl bg-gray-50 p-3 text-sm text-gray-600">HPP: <strong>{rupiah(Number(purchaseTotal) / Number(purchaseQuantity))} / {unitCode}</strong>, dihitung dari pembelian pertama ini.</p>}
            <p className="text-xs text-gray-500">Pengeluaran dicatat di luar laci kasir. {track ? 'Jumlah pembelian menambah stok tercatat satu kali.' : 'Jumlah pembelian masuk riwayat; stok tidak dihitung karena pencatatan stok belum aktif.'}</p>
          </div>}
        </section>}
        {hasFirstPurchase && <input type="hidden" name="cost_price" value="" />}
        <Field label="Deskripsi (opsional)" htmlFor="product-description"><textarea id="product-description" name="description" defaultValue={product?.description} rows={2} maxLength={1000} className={input} /></Field>
        <ProductImageInput initialUrl={product?.imageUrl ?? null} file={photo} removed={removePhoto} onProcessingChange={setProcessingPhoto} onChange={(file, removed) => { setPhoto(file); setRemovePhoto(removed); uploaded.current = null }} />
        <section className="space-y-4 rounded-xl border border-gray-200 p-4" aria-label="Pengaturan stok">
          <Check name="track_stock" label="Hitung jumlah stok" value={track} onChange={setTrack} help="Aktifkan untuk mencatat saldo stok dan melakukan opname. Matikan jika stok tidak perlu dihitung." />
          {!track && <p className="text-xs text-gray-500">Stok tidak dihitung. Pembelian tetap bisa dicatat melalui Pengeluaran.</p>}
          {hasFirstPurchase && track ? <><input type="hidden" name="initial_quantity" value="0" /><p className="text-sm text-gray-500">Stok awal mengikuti jumlah pembelian pertama; tidak perlu diisi kembali.</p></> : (!product || product.stock < 0) && track && <Field label={`Stok awal (${unitCode})`} htmlFor="product-initial"><input id="product-initial" name="initial_quantity" type="number" min="0" max="999999999" step="0.000001" defaultValue="0" className={input} required /></Field>}
          {product && product.stock >= 0 && track && <p className="text-sm text-gray-500">Stok tercatat: {`${quantity(product.stock)} ${unitCode}`}. Gunakan Kelola Stok untuk mengubah saldo, atau matikan centang di atas jika stok tidak perlu dihitung lagi.</p>}
          {!hasFirstPurchase && (!product || product.stock < 0) && track && <Field label="Alasan stok awal" htmlFor="product-reason"><input id="product-reason" name="reason" required maxLength={500} defaultValue="Saldo awal produk" className={input} /></Field>}
          {track ? <Field label="Stok minimum" htmlFor="product-min" help="Produk ditandai Stok Menipis saat stok sama atau di bawah angka ini."><input id="product-min" name="min_stock" type="number" min="0" max="999999999" step="0.000001" defaultValue={product?.minStock ?? 0} className={input} /></Field>
            : <input type="hidden" name="min_stock" value={product?.minStock ?? 0} />}
        </section>
      </fieldset>
      <Feedback error={error} /><Footer pending={pending} disabled={processingPhoto} onClose={onClose} label={processingPhoto ? 'Memproses Foto...' : product ? 'Simpan Perubahan' : hasFirstPurchase ? 'Tambah Produk & Pembelian' : 'Tambah Produk'} />
    </form>
  </Modal>
}
function DeleteModal({ product, onClose, onSaved }: { product: ProductRow; onClose: () => void; onSaved: (message: string) => void }) {
  const [pending, setPending] = useState(false), [error, setError] = useState('')
  async function submit(form: FormData) {
    setPending(true); setError('')
    try { const r = await deleteProduct(form); if (r.success) onSaved(r.message); else setError(r.message) }
    catch { setError('Produk belum berhasil dihapus.') }
    finally { setPending(false) }
  }
  return <Modal title="Hapus Produk" description={`${product.name} · ${product.businessName}`} pending={pending} onClose={onClose}>
    <form action={submit} className="space-y-4 p-5"><Identity product={product} />
      <p className="text-sm text-gray-600">Produk akan dihapus dari daftar aktif dan menu kasir setelah sinkronisasi. Riwayat penjualan, pembelian, stok, dan resep tetap disimpan.</p>
      <Feedback error={error} /><div className="flex justify-end gap-3 border-t border-gray-100 pt-4"><button type="button" disabled={pending} onClick={onClose} className={secondary}>Batal</button><button type="submit" disabled={pending} className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">{pending && <LoadingSpinner className="mr-2" />}{pending ? 'Menghapus...' : 'Hapus Produk'}</button></div>
    </form>
  </Modal>
}

export default function ProductsClient({ data, businessId }: { data: ProductPageData; businessId: string | null }) {
  const { refreshing, refresh } = usePendingRefresh(), [tab, setTab] = useState<'all' | 'sell' | 'buy'>('all'), [search, setSearch] = useState('')
  const [modal, setModal] = useState<ModalState | null>(null), [message, setMessage] = useState('')
  const list = data.products.filter(p => (tab === 'all' || (tab === 'sell' ? p.canSell : p.canBuy)) && `${p.name} ${p.sku}`.toLocaleLowerCase('id').includes(search.toLocaleLowerCase('id')))
  const saved = (value: string) => { setModal(null); setMessage(value); refresh() }
  const open = (value: ModalState) => { setMessage(''); setModal(value) }
  const lowStock = data.products.filter(p => p.stock !== -1 && p.stock <= p.minStock).length
  const uncheckedCost = data.products.filter(p => p.canSell && !p.costVerified).length
  const tabs = [{ id: 'all', label: 'Semua', count: data.products.length }, { id: 'sell', label: 'Produk Jual', count: data.products.filter(p => p.canSell).length }, { id: 'buy', label: 'Produk Beli', count: data.products.filter(p => p.canBuy).length }] as const
  return <div className="space-y-6">
    <PageHeader eyebrow="Produk & Inventori" title="Produk & Stok" description="Kelola barang jual, bahan beli, dan pencatatan stok setiap cabang."
      actions={<>
        <button type="button" disabled={!businessId} onClick={() => open({ kind: 'count' })} className={ui.btnSecondary}><ClipboardList aria-hidden="true" className="h-4 w-4" />Stok Opname</button>
        <button type="button" onClick={() => open({ kind: 'create' })} className={ui.btnPrimary}><Plus aria-hidden="true" className="h-4 w-4" />Produk Baru</button>
      </>} />
    {message && <Notice tone="success" role="status">{message}</Notice>}
    {uncheckedCost > 0 && <Notice tone="warning">{uncheckedCost.toLocaleString('id-ID')} produk jual HPP-nya belum dicek. Penjualannya belum dihitung di Laba Kotor (Rekap Keuangan). Buka Edit Produk, periksa HPP, lalu centang konfirmasi.</Notice>}
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <StatCard icon={Package} label="Total Produk" value={data.products.length.toLocaleString('id-ID')} hint="Di cabang aktif" info="Jumlah semua produk aktif pada cabang ini." />
      <StatCard icon={ShoppingCart} tone="sky" label="Produk Jual" value={tabs[1].count.toLocaleString('id-ID')} hint="Tampil di menu kasir" info="Produk yang ditandai Dijual dan tampil di kasir setelah sinkronisasi." />
      <StatCard icon={Truck} tone="green" label="Produk Beli" value={tabs[2].count.toLocaleString('id-ID')} hint="Bahan / barang supplier" info="Produk yang ditandai Dibeli dari supplier." />
      <StatCard icon={AlertTriangle} tone={lowStock ? 'red' : 'gray'} label="Stok Menipis" value={lowStock.toLocaleString('id-ID')} hint="Di bawah / sama dengan minimum" valueClassName={lowStock ? 'text-red-600' : 'text-gray-900'}
        info="Produk dengan stok tercatat yang sudah mencapai atau di bawah stok minimum." />
    </div>
    <div className={`${ui.panel} overflow-hidden`}>
      <div className="flex flex-col justify-between gap-3 border-b border-gray-100 px-5 py-4 sm:px-6 lg:flex-row lg:items-center">
        <div role="tablist" aria-label="Jenis produk" className="inline-flex flex-wrap gap-1 self-start rounded-xl bg-gray-100 p-1">{tabs.map(t => <button type="button" key={t.id} role="tab" aria-label={t.label} tabIndex={tab === t.id ? 0 : -1} onKeyDown={event => { const keys = ["all", "sell", "buy"] as const; const index = keys.indexOf(t.id); const next = event.key === "ArrowRight" ? keys[(index + 1) % 3] : event.key === "ArrowLeft" ? keys[(index + 2) % 3] : event.key === "Home" ? keys[0] : event.key === "End" ? keys[2] : null; if (next) { event.preventDefault(); setTab(next); document.getElementById(`product-tab-${next}`)?.focus() } }} id={`product-tab-${t.id}`} aria-controls="products-panel" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={`rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${tab === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}>{t.label}<span className={`ml-2 rounded-full px-1.5 py-0.5 text-[11px] tabular-nums ${tab === t.id ? 'bg-blue-50 text-blue-700' : 'bg-gray-200/70 text-gray-500'}`}>{t.count}</span></button>)}</div>
        <div className="relative w-full lg:max-w-xs"><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input type="search" value={search} onChange={e => setSearch(e.target.value)} aria-label="Cari nama atau SKU produk" placeholder="Cari nama / SKU..." className={`${input} pl-9`} /></div>
      </div>
      <DataPanel loading={refreshing} label="Memuat produk..."><div id="products-panel" role="tabpanel" aria-labelledby={`product-tab-${tab}`} className="overflow-x-auto">
        <table aria-busy={refreshing} className="w-full text-left text-sm text-gray-600"><thead className={ui.thead}><tr>{['Produk', 'Cabang', 'Jenis', 'Harga & HPP', 'Stok tercatat', 'Update stok', 'Penjualan (semua waktu)', 'Pembelian (semua waktu)', ''].map((c, i) => <th key={c || i} scope="col" className={`whitespace-nowrap ${ui.th}`}>{c || <span className="sr-only">Aksi</span>}</th>)}</tr></thead><tbody className="divide-y divide-gray-100">
          {!list.length ? <tr><td colSpan={9}><EmptyState icon={Package} title={search ? 'Tidak ada produk yang cocok' : 'Belum ada produk'} description={search ? 'Coba kata kunci lain untuk nama atau SKU.' : 'Belum ada produk pada kategori ini. Tambahkan lewat tombol Produk Baru.'} /></td></tr> : list.map(p => <tr key={p.inventoryId} className="transition-colors hover:bg-blue-50/30">
            <td className="min-w-56 px-5 py-3.5"><div className="flex items-center gap-3">
              {p.imageUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={p.imageUrl} alt="" className="h-10 w-10 shrink-0 rounded-xl object-cover ring-1 ring-gray-200" />
                : <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-sm font-semibold text-gray-500">{p.name.slice(0, 1).toLocaleUpperCase('id')}</span>}
              <div className="min-w-0"><button type="button" onClick={() => open({ kind: 'history', product: p })} title="Lihat riwayat produk" className="text-left font-semibold text-gray-900 hover:text-blue-700">{p.name}</button><p className="mt-0.5 text-xs text-gray-500">{[p.sku, p.canSell ? data.businesses.find(b => b.id === p.businessId)?.categories.find(c => c.id === p.categoryId)?.name ?? 'Tanpa kategori' : '', unitLabel(p.unitCode)].filter(Boolean).join(' · ')}</p>
                <div className="mt-1 flex flex-wrap gap-1">{!p.available && <Badge>Tidak tersedia</Badge>}{p.hasRecipe && <Badge tone="sky">Ada resep</Badge>}{p.pendingOperation && <button type="button" onClick={() => open({ kind: 'history', product: p })}><Badge tone="amber">Pembelian tertunda</Badge></button>}</div></div>
            </div></td>
            <td className="whitespace-nowrap px-5 py-3.5">{p.businessName}</td>
            <td className="px-5 py-3.5"><div className="flex flex-wrap gap-1">{p.canSell && <Badge tone="gold">Jual</Badge>}{p.canBuy && <Badge tone="green">Beli</Badge>}</div></td>
            <td className="whitespace-nowrap px-5 py-3.5 tabular-nums"><p className="font-semibold text-gray-900">{p.canSell ? rupiah(p.price) : '—'}</p><p className="mt-0.5 text-xs text-gray-500">HPP: {p.cost === null ? 'Belum diisi' : rupiah(p.cost)}</p>{p.canSell && !p.costVerified && <Badge tone="amber" className="mt-1">HPP belum dicek</Badge>}</td>
            <td className="whitespace-nowrap px-5 py-3.5 tabular-nums">{p.stock !== -1 && p.stock <= p.minStock ? <Badge tone="red">{quantity(p.stock)} {unitLabel(p.unitCode)}</Badge> : <span className="font-semibold text-gray-900">{p.stock === -1 ? '—' : `${quantity(p.stock)} ${unitLabel(p.unitCode)}`}</span>}<p className="mt-1 text-xs text-gray-500">{p.stock === -1 ? 'Stok tidak dihitung' : `Min. ${quantity(p.minStock)}`}</p></td>
            <td className="whitespace-nowrap px-5 py-3.5 text-xs text-gray-500">{formatDateTime(p.stockUpdatedAt)}</td>
            <td className="whitespace-nowrap px-5 py-3.5 tabular-nums" title="Transaksi selesai; nilai item sebelum diskon nota/pajak, termasuk bon"><p>{quantity(p.soldQuantity)} {unitLabel(p.unitCode)}</p><p className="mt-0.5 text-xs text-gray-500">{rupiah(p.soldAmount)}</p></td>
            <td className="whitespace-nowrap px-5 py-3.5 tabular-nums" title="Jumlah dalam satuan dasar dan nilai dokumen pembelian yang sudah tercatat"><p>{quantity(p.boughtQuantity)} {unitLabel(p.unitCode)}</p><p className="mt-0.5 text-xs text-gray-500">{rupiah(p.boughtAmount)}</p></td>
            <td className="px-4 py-3.5 text-right"><RowActions product={p} onSelect={kind => open({ kind, product: p })} /></td>
          </tr>)}
        </tbody></table>
      </div></DataPanel>
      <p className="flex items-start gap-2 border-t border-gray-100 bg-gray-50/50 px-5 py-3 text-xs text-gray-500 sm:px-6"><Info aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />Kolom Penjualan dan Pembelian adalah total sejak awal, tidak mengikuti periode. Penjualan dihitung dari transaksi selesai sebelum diskon nota; pembelian dari dokumen pembelian yang tercatat. Klik nama produk untuk melihat riwayatnya.</p>
    </div>
    {modal?.kind === 'create' && <ProductForm data={data} selectedBranch={businessId} onClose={() => setModal(null)} onSaved={saved} onRefresh={refresh} />}
    {modal?.kind === 'edit' && <ProductForm data={data} selectedBranch={businessId} product={modal.product} onClose={() => setModal(null)} onSaved={saved} onRefresh={refresh} />}
    {modal?.kind === 'stock' && businessId && <StockCountModal key={modal.product.inventoryId} products={[modal.product]} businessId={businessId} single onClose={() => setModal(null)} onSaved={saved} />}
    {modal?.kind === 'count' && businessId && <StockCountModal products={data.products} businessId={businessId} onClose={() => setModal(null)} onSaved={saved} />}
    {modal?.kind === 'delete' && <DeleteModal product={modal.product} onClose={() => setModal(null)} onSaved={saved} />}
    {modal?.kind === 'history' && <HistoryModal product={data.products.find(p => p.inventoryId === modal.product.inventoryId) ?? modal.product} onClose={() => setModal(null)} onRefresh={refresh} />}
  </div>
}

function RowActions({ product, onSelect }: { product: ProductRow; onSelect: (kind: 'edit' | 'stock' | 'history' | 'delete') => void }) {
  const id = 'product-actions-' + product.inventoryId
  const ref = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  return <>
    <button type="button" popoverTarget={id} aria-label={`Aksi ${product.name}`} className="rounded-xl p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900" onClick={event => {
      const rect = event.currentTarget.getBoundingClientRect()
      setPosition({ top: Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - 190)), left: Math.max(8, Math.min(rect.right - 180, window.innerWidth - 188)) })
    }}><MoreHorizontal className="h-5 w-5" /></button>
    <div id={id} ref={ref} popover="auto" style={{ ...position, margin: 0 }} className="fixed z-50 w-44 rounded-xl border border-gray-200 bg-white p-1.5 text-sm shadow-xl">
      {[{ kind: 'edit' as const, label: 'Edit Produk' }, { kind: 'stock' as const, label: 'Kelola Stok' }, { kind: 'history' as const, label: 'Riwayat' }, { kind: 'delete' as const, label: 'Hapus' }].map(action => <button key={action.kind} type="button" disabled={action.kind === 'stock' && product.stock < 0} onClick={() => { ref.current?.hidePopover(); onSelect(action.kind) }} className={`block w-full rounded-lg px-3 py-2 text-left transition-colors disabled:opacity-40 ${action.kind === 'delete' ? 'text-red-600 hover:bg-red-50' : 'text-gray-700 hover:bg-gray-50'}`}>{action.label}</button>)}
    </div>
  </>
}
