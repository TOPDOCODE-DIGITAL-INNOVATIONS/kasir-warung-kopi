'use client'

import { useRef, useState, type ReactNode } from 'react'
import { usePendingRefresh } from '@/hooks/usePendingRefresh'
import LoadingSpinner from '@/components/LoadingSpinner'
import DataPanel from '@/components/DataPanel'
import { ClipboardList, MoreHorizontal, Plus } from 'lucide-react'
import { dayKey, formatDateTime, rupiah } from '@/lib/format'
import { deleteProduct, saveProduct } from './actions'
import type { ProductPageData, ProductRow } from './types'
import MoneyInput from './MoneyInput'
import StockCountModal from './StockCountModal'
import ProductImageInput from './ProductImageInput'
import Modal from './ProductDialog'
import HistoryModal from './ProductHistoryModal'

const input = 'w-full border border-gray-300 rounded-lg bg-white p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-500'
const secondary = 'px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50'
const primary = 'px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50'
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
  return error ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p> : null
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
  const hasFirstPurchase = !product && buy && firstPurchase
  const uploaded = useRef<{ file: File; url: string } | null>(null)
  const branch = data.businesses.find(b => b.id === business), unitCode = unitLabel(data.units.find(u => u.id === unit)?.code ?? '')
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
        <div className="grid gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4 sm:grid-cols-2">
          <Check name="can_buy" label="Dibeli" help="Bahan atau barang dari supplier." value={buy} onChange={setBuy} />
          <Check name="can_sell" label="Dijual" help="Ditampilkan sebagai menu kasir setelah sinkronisasi." value={sell} onChange={setSell} />
        </div>
        {!buy && !sell && <p className="text-sm text-amber-700">Pilih minimal Dibeli atau Dijual.</p>}
        {sell ? <section className="space-y-4 rounded-lg border border-gray-200 p-4" aria-labelledby="sale-settings-title">
          <div><h3 id="sale-settings-title" className="text-sm font-semibold text-gray-900">Penjualan</h3><p className="mt-1 text-xs text-gray-500">Atur harga yang dibayar pelanggan dan tampilan produk di kasir.</p></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={`Harga jual per ${unitCode} (Rp)`} htmlFor="product-price"><MoneyInput id="product-price" name="price" defaultValue={salePrice === '' ? null : Number(salePrice)} onValueChange={setSalePrice} required className={input} /></Field>
            <Field label="Kategori kasir (opsional)" htmlFor="product-category"><select key={business} id="product-category" name="category_id" value={category} onChange={e => setCategory(e.target.value)} className={input}><option value="">Tanpa kategori</option>{branch?.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
            {!buy && <Field label={`Modal / HPP acuan per ${unitCode} (Rp)`} htmlFor="product-cost" help="Opsional. Estimasi biaya bahan atau produksi; pengisian ini tidak mencatat pengeluaran."><MoneyInput id="product-cost" name="cost_price" defaultValue={costValue === '' ? null : Number(costValue)} onValueChange={setCostValue} className={input} placeholder="Belum diketahui" /></Field>}
          </div>
        </section> : <><input type="hidden" name="price" value={salePrice} /><input type="hidden" name="category_id" value={category} /></>}
        {buy && <section className="space-y-4 rounded-lg border border-gray-200 p-4" aria-labelledby="purchase-settings-title">
          <div><h3 id="purchase-settings-title" className="text-sm font-semibold text-gray-900">Pembelian</h3><p className="mt-1 text-xs text-gray-500">{product ? 'Pembelian berikutnya dicatat melalui menu Pengeluaran.' : 'Pembelian pertama opsional. Produk tetap dapat disimpan jika barang belum dibeli.'}</p></div>
          {product ? <Field label={`Harga beli acuan per ${unitCode} (Rp)`} htmlFor="product-cost" help="Opsional. Mengubah acuan ini tidak menambah stok atau mencatat pembelian baru."><MoneyInput id="product-cost" name="cost_price" defaultValue={costValue === '' ? null : Number(costValue)} onValueChange={setCostValue} className={input} placeholder="Belum diketahui" /></Field>
            : <Check name="initial_purchase" label="Catat pembelian pertama" help="Mencatat jumlah barang, dokumen pembelian, dan pengeluaran sekaligus." value={firstPurchase} onChange={setFirstPurchase} />}
          {hasFirstPurchase && <div className="space-y-4 border-t border-gray-100 pt-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Tanggal pembelian" htmlFor="product-purchase-date"><input id="product-purchase-date" name="purchase_date" type="date" defaultValue={dayKey(new Date())} required className={input} /></Field>
              <Field label="Supplier (opsional)" htmlFor="product-purchase-supplier"><select id="product-purchase-supplier" name="purchase_supplier" defaultValue="" className={input}><option value="">Tanpa supplier</option>{data.suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
              <Field label={`Jumlah dibeli (${unitCode})`} htmlFor="product-purchase-quantity" help="Gunakan jumlah dalam satuan dasar yang dipilih di atas."><input id="product-purchase-quantity" name="purchase_quantity" type="number" min="0.000001" max="999999999" step="0.000001" value={purchaseQuantity} onChange={e => setPurchaseQuantity(e.target.value)} required className={input} /></Field>
              <Field label="Total pembelian (Rp)" htmlFor="product-purchase-total" help="Nominal untuk seluruh jumlah barang, bukan harga per satuan."><MoneyInput id="product-purchase-total" name="purchase_total" defaultValue={purchaseTotal === '' ? null : Number(purchaseTotal)} onValueChange={setPurchaseTotal} required className={input} placeholder="Total yang dibayar" /></Field>
            </div>
            <Field label="Catatan pembelian (opsional)" htmlFor="product-purchase-note"><input id="product-purchase-note" name="purchase_note" maxLength={500} placeholder="Pembelian pertama" className={input} /></Field>
            {Number(purchaseQuantity) > 0 && Number(purchaseTotal) > 0 && <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600">Harga beli acuan: <strong>{rupiah(Number(purchaseTotal) / Number(purchaseQuantity))} / {unitCode}</strong>. Acuan ini disimpan dari pembelian pertama.</p>}
            <p className="text-xs text-gray-500">Pengeluaran dicatat di luar laci kasir. {track ? 'Jumlah pembelian menambah stok tercatat satu kali.' : 'Jumlah pembelian masuk riwayat; saldo stok tetap Unlimited karena pelacakan belum aktif.'}</p>
          </div>}
        </section>}
        {buy && !product && <input type="hidden" name="cost_price" value="" />}
        <Field label="Deskripsi (opsional)" htmlFor="product-description"><textarea id="product-description" name="description" defaultValue={product?.description} rows={2} maxLength={1000} className={input} /></Field>
        <ProductImageInput initialUrl={product?.imageUrl ?? null} file={photo} removed={removePhoto} onProcessingChange={setProcessingPhoto} onChange={(file, removed) => { setPhoto(file); setRemovePhoto(removed); uploaded.current = null }} />
        <Check name="is_available" label="Produk tersedia" value={available} onChange={setAvailable} />
        <section className="space-y-4 rounded-lg border border-gray-200 p-4" aria-label="Pengaturan stok">
          <Check name="track_stock" label="Catat jumlah stok (matikan untuk Unlimited / -1)" value={track} onChange={setTrack} help="Aktifkan untuk mencatat saldo stok dan melakukan opname. Matikan centang ini jika stok tidak terbatas (-1)." />
          {!track && <p className="text-xs text-gray-500">Stok tidak dilacak (-1 / Unlimited). Pembelian tetap bisa dicatat melalui Pengeluaran.</p>}
          {hasFirstPurchase && track ? <><input type="hidden" name="initial_quantity" value="0" /><p className="text-sm text-gray-500">Stok awal mengikuti jumlah pembelian pertama; tidak perlu diisi kembali.</p></> : (!product || product.stock < 0) && track && <Field label={`Stok awal (${unitCode})`} htmlFor="product-initial"><input id="product-initial" name="initial_quantity" type="number" min="0" max="999999999" step="0.000001" defaultValue="0" className={input} required /></Field>}
          {product && product.stock >= 0 && track && <p className="text-sm text-gray-500">Stok tercatat: {`${quantity(product.stock)} ${unitCode}`}. Gunakan Kelola Stok untuk mengubah saldo, atau matikan centang di atas untuk mengubah menjadi Unlimited (-1).</p>}
          {!hasFirstPurchase && (!product || product.stock < 0) && track && <Field label="Alasan stok awal" htmlFor="product-reason"><input id="product-reason" name="reason" required maxLength={500} defaultValue="Saldo awal produk" className={input} /></Field>}
          <Field label="Stok minimum" htmlFor="product-min"><input id="product-min" name="min_stock" type="number" min="0" max="999999999" step="0.000001" defaultValue={product?.minStock ?? 0} className={input} /></Field>
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
      <Feedback error={error} /><div className="flex justify-end gap-3 border-t border-gray-100 pt-4"><button type="button" disabled={pending} onClick={onClose} className={secondary}>Batal</button><button type="submit" disabled={pending} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">{pending && <LoadingSpinner className="mr-2" />}{pending ? 'Menghapus...' : 'Hapus Produk'}</button></div>
    </form>
  </Modal>
}

export default function ProductsClient({ data, businessId }: { data: ProductPageData; businessId: string | null }) {
  const { refreshing, refresh } = usePendingRefresh(), [tab, setTab] = useState<'all' | 'sell' | 'buy'>('all'), [search, setSearch] = useState('')
  const [modal, setModal] = useState<ModalState | null>(null), [message, setMessage] = useState('')
  const list = data.products.filter(p => (tab === 'all' || (tab === 'sell' ? p.canSell : p.canBuy)) && `${p.name} ${p.sku}`.toLocaleLowerCase('id').includes(search.toLocaleLowerCase('id')))
  const saved = (value: string) => { setModal(null); setMessage(value); refresh() }
  const open = (value: ModalState) => { setMessage(''); setModal(value) }
  return <div className="space-y-4">
    {message && <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-700">{message}</p>}
    <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
      <div className="space-y-4 border-b border-gray-100 p-5">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h2 className="font-semibold text-gray-900">Daftar Produk <span className="ml-2 text-sm font-normal text-gray-500">{list.length} produk</span></h2><p className="mt-1 text-sm text-gray-500">Kelola barang jual, bahan beli, dan stok setiap cabang.</p></div><div className="flex shrink-0 flex-wrap gap-2"><button type="button" disabled={!businessId} onClick={() => open({ kind: 'count' })} className={`${secondary} inline-flex items-center gap-2`}><ClipboardList className="h-4 w-4" />Stok Opname</button><button type="button" onClick={() => open({ kind: 'create' })} className={`${primary} inline-flex items-center justify-center gap-2`}><Plus className="h-4 w-4" />Produk Baru</button></div></div>
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div role="tablist" aria-label="Jenis produk" className="flex flex-wrap gap-1 rounded-lg bg-gray-100 p-1">{([{ id: 'all', label: 'Semua Produk', count: data.products.length }, { id: 'sell', label: 'Produk Jual', count: data.products.filter(p => p.canSell).length }, { id: 'buy', label: 'Produk Beli', count: data.products.filter(p => p.canBuy).length }] as const).map(t => <button type="button" key={t.id} role="tab" aria-label={t.label} tabIndex={tab === t.id ? 0 : -1} onKeyDown={event => { const keys = ["all", "sell", "buy"] as const; const index = keys.indexOf(t.id); const next = event.key === "ArrowRight" ? keys[(index + 1) % 3] : event.key === "ArrowLeft" ? keys[(index + 2) % 3] : event.key === "Home" ? keys[0] : event.key === "End" ? keys[2] : null; if (next) { event.preventDefault(); setTab(next); document.getElementById(`product-tab-${next}`)?.focus() } }} id={`product-tab-${t.id}`} aria-controls="products-panel" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={`rounded-md px-3 py-2 text-sm font-medium ${tab === t.id ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>{t.label}<span className="ml-2 text-xs">{t.count}</span></button>)}</div><input type="search" value={search} onChange={e => setSearch(e.target.value)} aria-label="Cari nama atau SKU produk" placeholder="Cari nama / SKU..." className={`${input} sm:max-w-xs`} /></div>
      </div>
      <DataPanel loading={refreshing} label="Memuat produk..."><div id="products-panel" role="tabpanel" aria-labelledby={`product-tab-${tab}`} className="overflow-x-auto">
        <table aria-busy={refreshing} className="w-full text-left text-sm text-gray-600"><thead className="bg-gray-50 text-xs uppercase text-gray-700"><tr>{['Produk', 'Jenis', 'Harga & Modal', 'Stok tercatat', 'Update stok', 'Penjualan', 'Pembelian', 'Aksi'].map(c => <th key={c} scope="col" className="whitespace-nowrap px-4 py-3 font-medium">{c}</th>)}</tr></thead><tbody className="divide-y divide-gray-100">
          {!list.length ? <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-500">{search ? 'Tidak ada produk yang cocok dengan pencarian.' : 'Belum ada produk pada kategori ini.'}</td></tr> : list.map(p => <tr key={p.inventoryId} className="hover:bg-gray-50/50">
            <td className="min-w-44 px-4 py-3"><button type="button" onClick={() => open({ kind: 'history', product: p })} className="text-left font-medium text-gray-900 hover:text-blue-600">{p.name}</button><p className="mt-1 text-xs text-gray-500">{p.sku || p.categoryId || 'Tanpa kategori'} · {unitLabel(p.unitCode)}</p>{!p.available && <span className="text-xs text-gray-400">Tidak tersedia</span>}{p.hasRecipe && <span className="ml-2 text-xs text-purple-600">Ada resep</span>}{p.pendingOperation && <button type="button" onClick={() => open({ kind: 'history', product: p })} className="mt-1 block text-xs font-medium text-amber-700">Pembelian tertunda</button>}</td>
            <td className="whitespace-nowrap px-4 py-3">{p.businessName}</td>
            <td className="px-4 py-3"><div className="flex flex-wrap gap-1">{p.canSell && <span className="rounded-md bg-blue-50 px-2 py-1 text-xs text-blue-700">Jual</span>}{p.canBuy && <span className="rounded-md bg-green-50 px-2 py-1 text-xs text-green-700">Beli</span>}</div></td>
            <td className="whitespace-nowrap px-4 py-3"><p className="font-medium text-gray-900">{p.canSell ? rupiah(p.price) : '—'}</p><p className="mt-1 text-xs text-gray-500">Modal: {p.cost === null ? 'Belum diisi' : rupiah(p.cost)}</p></td>
            <td className="whitespace-nowrap px-4 py-3"><span className={p.stock !== -1 && p.stock <= p.minStock ? 'font-semibold text-red-600' : 'font-medium text-gray-900'}>{p.stock === -1 ? '—' : quantity(p.stock)}</span><p className="mt-1 text-xs text-gray-500">{p.stock === -1 ? 'Stok tidak dilacak' : unitLabel(p.unitCode)}</p></td>
            <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">{formatDateTime(p.stockUpdatedAt)}</td>
            <td className="whitespace-nowrap px-4 py-3" title="Transaksi selesai; nilai item sebelum diskon nota/pajak, termasuk bon"><p>{quantity(p.soldQuantity)} {unitLabel(p.unitCode)}</p><p className="mt-1 text-xs text-gray-500">{rupiah(p.soldAmount)}</p></td>
            <td className="whitespace-nowrap px-4 py-3" title="Jumlah dalam satuan dasar dan nilai dokumen pembelian yang sudah tercatat"><p>{quantity(p.boughtQuantity)} {unitLabel(p.unitCode)}</p><p className="mt-1 text-xs text-gray-500">{rupiah(p.boughtAmount)}</p></td>
            <td className="px-4 py-3"><RowActions product={p} onSelect={kind => open({ kind, product: p })} /></td>
          </tr>)}
        </tbody></table>
      </div></DataPanel>
      <p className="border-t border-gray-100 px-5 py-3 text-xs text-gray-500">Ringkasan seluruh riwayat. Penjualan menghitung transaksi selesai; pembelian menghitung dokumen tercatat. Resep tidak wajib.</p>
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
    <button type="button" popoverTarget={id} aria-label={`Aksi ${product.name}`} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" onClick={event => {
      const rect = event.currentTarget.getBoundingClientRect()
      setPosition({ top: Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - 190)), left: Math.max(8, Math.min(rect.right - 180, window.innerWidth - 188)) })
    }}><MoreHorizontal className="h-5 w-5" /></button>
    <div id={id} ref={ref} popover="auto" style={{ ...position, margin: 0 }} className="fixed z-50 w-44 rounded-lg border border-gray-200 bg-white p-1 text-sm shadow-lg">
      {[{ kind: 'edit' as const, label: 'Edit Produk' }, { kind: 'stock' as const, label: 'Kelola Stok' }, { kind: 'history' as const, label: 'Riwayat' }, { kind: 'delete' as const, label: 'Hapus' }].map(action => <button key={action.kind} type="button" disabled={action.kind === 'stock' && product.stock < 0} onClick={() => { ref.current?.hidePopover(); onSelect(action.kind) }} className={`block w-full rounded px-3 py-2 text-left hover:bg-gray-50 disabled:opacity-40 ${action.kind === 'delete' ? 'text-red-600' : 'text-gray-700'}`}>{action.label}</button>)}
    </div>
  </>
}
