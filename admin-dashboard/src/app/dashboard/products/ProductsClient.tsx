'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Edit, History, Plus, Trash2, X } from 'lucide-react'
import { formatDateTime, rupiah } from '@/lib/format'
import { addProductStock, completeProductPurchase, deleteProduct, getProductHistory, saveProduct, syncProductToPos } from './actions'
import type { ActionResult, HistoryData, ProductPageData, ProductRow } from './types'

const input = 'w-full border border-gray-300 rounded-lg bg-white p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-500'
const secondary = 'px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50'
const primary = 'px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50'
const quantity = (n: number) => n.toLocaleString('id-ID', { maximumFractionDigits: 6 })
const kinds = { purchase: 'Pembelian', adjustment: 'Penyesuaian', initial: 'Stok awal', tracking: 'Pengaturan stok', edit: 'Edit produk', archive: 'Hapus produk' }
type ModalState = { kind: 'create' } | { kind: 'edit' | 'stock' | 'delete' | 'history'; product: ProductRow }

function Modal({ title, description, pending, onClose, children, wide = false }: {
  title: string; description: string; pending: boolean; onClose: () => void; children: ReactNode; wide?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => { const d = ref.current; d?.showModal(); return () => d?.close() }, [])
  return <dialog ref={ref} aria-labelledby="product-dialog-title" aria-describedby="product-dialog-description"
    onCancel={e => { e.preventDefault(); if (!pending) onClose() }}
    className={`m-auto w-[calc(100%_-_2rem)] ${wide ? 'max-w-2xl' : 'max-w-lg'} max-h-[90vh] overflow-y-auto rounded-xl border border-gray-100 bg-white p-0 text-gray-900 shadow-xl backdrop:bg-black/40`}>
    <div className="flex items-start justify-between gap-4 border-b border-gray-100 p-5">
      <div><h2 id="product-dialog-title" className="text-lg font-semibold">{title}</h2><p id="product-dialog-description" className="mt-1 text-sm text-gray-500">{description}</p></div>
      <button type="button" aria-label="Tutup dialog" disabled={pending} onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 disabled:opacity-50"><X className="h-5 w-5" /></button>
    </div>{children}
  </dialog>
}
function Field({ label, htmlFor, children, help }: { label: string; htmlFor: string; children: ReactNode; help?: string }) {
  return <div><label htmlFor={htmlFor} className="mb-2 block text-sm font-medium text-gray-700">{label}</label>{children}{help && <p className="mt-1.5 text-xs text-gray-500">{help}</p>}</div>
}
function Check({ name, label, value, onChange, help }: { name: string; label: string; value: boolean; onChange: (v: boolean) => void; help?: string }) {
  return <label className="flex cursor-pointer items-start gap-2.5 text-sm text-gray-700"><input type="checkbox" name={name} checked={value} onChange={e => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 accent-blue-600" /><span>{label}{help && <span className="mt-1 block text-xs text-gray-500">{help}</span>}</span></label>
}
function Feedback({ error }: { error: string }) {
  return error ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p> : null
}
function Footer({ pending, onClose, label = 'Simpan' }: { pending: boolean; onClose: () => void; label?: string }) {
  return <div className="flex justify-end gap-3 border-t border-gray-100 pt-4"><button type="button" disabled={pending} onClick={onClose} className={secondary}>Batal</button><button type="submit" disabled={pending} className={primary}>{pending ? 'Menyimpan...' : label}</button></div>
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
  const [firstPurchase, setFirstPurchase] = useState(false), [available, setAvailable] = useState(product?.available ?? true)
  const [unit, setUnit] = useState(product?.baseUnitId ?? data.units.find(u => u.code === 'pcs')?.id ?? '')
  const [pending, setPending] = useState(false), [error, setError] = useState('')
  const branch = data.businesses.find(b => b.id === business), unitCode = data.units.find(u => u.id === unit)?.code ?? ''
  const purchase = firstPurchase && buy && !product
  async function submit(form: FormData) {
    setPending(true); setError('')
    try { const r = await saveProduct(form); if (r.success) onSaved(r.message); else { setError(r.message); if (r.refresh) onRefresh() } }
    catch { setError('Produk belum berhasil disimpan. Silakan coba kembali.') }
    finally { setPending(false) }
  }
  return <Modal title={product ? 'Edit Produk' : 'Produk Baru'} description="Atur identitas, harga, dan pencatatan stok produk cabang." wide pending={pending} onClose={onClose}>
    <form action={submit} className="space-y-5 p-5" aria-busy={pending}>
      <input type="hidden" name="operation_id" value={operation} /><input type="hidden" name="inventory_id" value={product?.inventoryId ?? ''} />
      <input type="hidden" name="version" value={product?.version ?? ''} /><input type="hidden" name="stock_kind" value={purchase ? 'purchase' : 'adjustment'} />
      {product && <input type="hidden" name="business_id" value={business} />}
      <fieldset disabled={pending} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Cabang" htmlFor="product-branch"><select id="product-branch" name={product ? undefined : 'business_id'} disabled={!!product} value={business} onChange={e => setBusiness(e.target.value)} className={input} required>{data.businesses.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
          <Field label="Nama produk" htmlFor="product-name"><input id="product-name" name="name" defaultValue={product?.name} required maxLength={150} className={input} autoFocus /></Field>
          <Field label="SKU (opsional)" htmlFor="product-sku"><input id="product-sku" name="sku" defaultValue={product?.sku} maxLength={100} className={input} /></Field>
          <Field label="Satuan dasar" htmlFor="product-unit" help={product ? 'Satuan dasar tetap agar histori tidak berubah.' : 'Harga dan modal acuan berlaku per satuan ini.'}><select id="product-unit" name="base_unit_id" disabled={!!product} value={unit} onChange={e => setUnit(e.target.value)} required className={input}>{data.units.map(u => <option key={u.id} value={u.id}>{u.code} — {u.name}</option>)}</select></Field>
        </div>
        <div className="grid gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4 sm:grid-cols-2">
          <Check name="can_buy" label="Bisa dibeli" help="Bahan atau barang dari supplier." value={buy} onChange={v => { setBuy(v); if (!v) setFirstPurchase(false) }} />
          <Check name="can_sell" label="Bisa dijual" help="Ditampilkan sebagai menu kasir setelah sinkronisasi." value={sell} onChange={setSell} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Harga jual (Rp)" htmlFor="product-price"><input id="product-price" name="price" type="number" min="0" max="999999999" step="0.000001" defaultValue={product?.price ?? 0} required={sell} className={input} /></Field>
          <Field label="Modal acuan per satuan (Rp)" htmlFor="product-cost" help="Opsional. Modal manual, belum merupakan HPP aktual otomatis."><input id="product-cost" name="cost_price" type="number" min="0" max="999999999" step="0.000001" defaultValue={product?.cost ?? ''} className={input} placeholder="Belum diketahui" /></Field>
          <Field label="Kategori kasir (opsional)" htmlFor="product-category"><select key={business} id="product-category" name="category_id" defaultValue={product?.categoryId ?? ''} className={input}><option value="">Tanpa kategori</option>{branch?.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          <Field label="Stok minimum" htmlFor="product-min"><input id="product-min" name="min_stock" type="number" min="0" max="999999999" step="0.000001" defaultValue={product?.minStock ?? 0} className={input} /></Field>
        </div>
        <Field label="Deskripsi (opsional)" htmlFor="product-description"><textarea id="product-description" name="description" defaultValue={product?.description} rows={2} maxLength={1000} className={input} /></Field>
        <Check name="is_available" label="Produk tersedia" value={available} onChange={setAvailable} />
        <section className="space-y-4 rounded-lg border border-gray-200 p-4" aria-label="Pengaturan stok">
          <Check name="track_stock" label="Catat jumlah stok" value={track} onChange={setTrack} help="Jika dimatikan, stok ditampilkan ∞ dan tidak habis saat produk dijual." />
          {!track && <p className="text-xs text-gray-500">Stok tidak terbatas dapat digunakan meskipun produk memiliki resep. Resep bersifat opsional.</p>}
          {!product && buy && <Check name="initial_purchase" label="Catat pembelian pertama" value={purchase} onChange={setFirstPurchase} help="Membuat dokumen pembelian beserta rincian barang." />}
          {((!product && track && !purchase) || (product && track && product.stock === -1)) && <Field label={`Stok awal (${unitCode})`} htmlFor="product-initial"><input id="product-initial" name="initial_quantity" type="number" min="0" max="999999999" step="0.000001" defaultValue="0" className={input} required /></Field>}
          {product && track && product.stock !== -1 && <p className="text-sm text-gray-500">Stok saat ini: {quantity(product.stock)} {unitCode}. Gunakan Tambah Stok untuk mencatat penambahan.</p>}
          {purchase && <div className="grid gap-4 sm:grid-cols-2">
            <Field label={`Jumlah pembelian (${unitCode})`} htmlFor="first-quantity"><input id="first-quantity" name="quantity" type="number" min="0.000001" max="999999999" step="0.000001" required className={input} /></Field>
            <Field label={`Harga beli per ${unitCode} (Rp)`} htmlFor="first-price"><input id="first-price" name="unit_price" type="number" min="0" max="999999999" step="0.000001" required className={input} /></Field>
            <div className="sm:col-span-2"><SupplierField suppliers={data.suppliers} /></div>
            <label className="sm:col-span-2 flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" name="update_cost" defaultChecked className="accent-blue-600" />Gunakan harga beli sebagai modal acuan</label>
          </div>}
          {!product && (purchase || track) && <Field label={purchase ? 'Keterangan pembelian' : 'Alasan stok awal'} htmlFor="product-reason"><input key={purchase ? "purchase" : "initial"} id="product-reason" name="reason" required maxLength={500} defaultValue={purchase ? 'Pembelian pertama' : 'Saldo awal produk'} className={input} /></Field>}
          {product?.hasRecipe && <p className="text-xs text-blue-700">Produk memiliki resep aktif. Perubahan ini tidak mengubah komposisi resep.</p>}
        </section>
      </fieldset>
      <Feedback error={error} /><Footer pending={pending} onClose={onClose} label={product ? 'Simpan Perubahan' : 'Tambah Produk'} />
    </form>
  </Modal>
}
function SupplierField({ suppliers }: { suppliers: ProductPageData['suppliers'] }) {
  return <Field label="Supplier (opsional)" htmlFor="purchase-supplier"><select id="purchase-supplier" name="supplier_id" className={input}><option value="">Tanpa supplier</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
}

function StockForm({ product, data, onClose, onSaved, onRefresh }: {
  product: ProductRow; data: ProductPageData; onClose: () => void; onSaved: (message: string) => void; onRefresh: () => void
}) {
  const [operation] = useState(() => crypto.randomUUID()), [kind, setKind] = useState(product.canBuy ? 'purchase' : 'adjustment')
  const [pending, setPending] = useState(false), [error, setError] = useState('')
  const choices = data.itemUnits.filter(u => u.productId === product.inventoryId)
  const [unit, setUnit] = useState(choices.find(u => u.factor === 1)?.id ?? choices[0]?.id ?? '')
  const selected = choices.find(u => u.id === unit)
  async function submit(form: FormData) {
    setPending(true); setError('')
    try { const r = await addProductStock(form); if (r.success) onSaved(r.message); else { setError(r.message); if (r.refresh) onRefresh() } }
    catch { setError('Penambahan stok belum berhasil. Silakan coba kembali.') }
    finally { setPending(false) }
  }
  return <Modal title="Tambah Stok" description={`${product.name} · ${product.businessName}`} pending={pending} onClose={onClose}>
    <form action={submit} className="space-y-5 p-5" aria-busy={pending}>
      <Identity product={product} /><input type="hidden" name="operation_id" value={operation} />
      <fieldset disabled={pending} className="space-y-4">
        <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600">Stok saat ini: <strong>{product.stock === -1 ? '∞ Tidak terbatas' : `${quantity(product.stock)} ${product.unitCode}`}</strong></p>
        <Field label="Sumber penambahan" htmlFor="stock-kind"><select id="stock-kind" name="stock_kind" value={kind} onChange={e => setKind(e.target.value)} className={input}>{product.canBuy && <option value="purchase">Pembelian</option>}<option value="adjustment">Penyesuaian manual / hasil produksi</option></select></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Jumlah tambahan" htmlFor="stock-quantity"><input id="stock-quantity" name="quantity" type="number" min="0.000001" max="999999999" step="0.000001" required className={input} autoFocus /></Field>
          {kind === 'purchase' ? <Field label="Satuan pembelian" htmlFor="stock-unit"><select id="stock-unit" name="item_unit_id" value={unit} onChange={e => setUnit(e.target.value)} className={input}>{choices.length ? choices.map(u => <option key={u.id} value={u.id}>{u.label}</option>) : <option value="">{product.unitCode} (satuan dasar)</option>}</select></Field>
            : <div className="flex items-end pb-3 text-sm text-gray-500">Satuan: {product.unitCode}</div>}
        </div>
        {kind === 'purchase' && <>
          {selected && selected.factor !== 1 && <p className="text-xs text-gray-500">1 {selected.label} = {quantity(selected.factor)} {product.unitCode}.</p>}
          <Field label={`Harga beli per ${selected?.label ?? product.unitCode} (Rp)`} htmlFor="stock-price"><input key={unit} id="stock-price" name="unit_price" type="number" min="0" max="999999999" step="0.000001" required defaultValue={product.cost === null ? '' : product.cost * (selected?.factor ?? 1)} className={input} /></Field>
          <SupplierField suppliers={data.suppliers} />
          <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" name="update_cost" defaultChecked className="accent-blue-600" />Perbarui modal acuan dari harga beli</label>
          <p className="text-xs text-gray-500">Pembelian dicatat pada dokumen dan rincian pembelian. Nilainya tidak otomatis dimasukkan ke pengeluaran.</p>
        </>}
        <Field label={kind === 'purchase' ? 'Keterangan pembelian' : 'Alasan penyesuaian'} htmlFor="stock-reason"><input key={kind} id="stock-reason" name="reason" required maxLength={500} defaultValue={kind === 'purchase' ? 'Penambahan stok dari pembelian' : ''} className={input} placeholder={kind === 'adjustment' ? 'Contoh: hasil produksi atau koreksi saldo awal' : ''} /></Field>
        {product.stock === -1 && <p className="text-xs text-gray-500">Riwayat tetap dicatat. Nilai stok tetap ∞ karena pencatatan jumlah stok dimatikan.</p>}
      </fieldset>
      <Feedback error={error} /><Footer pending={pending} onClose={onClose} label={kind === 'purchase' ? 'Catat Pembelian & Stok' : 'Simpan Penyesuaian'} />
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
      <Feedback error={error} /><div className="flex justify-end gap-3 border-t border-gray-100 pt-4"><button type="button" disabled={pending} onClick={onClose} className={secondary}>Batal</button><button type="submit" disabled={pending} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">{pending ? 'Menghapus...' : 'Hapus Produk'}</button></div>
    </form>
  </Modal>
}

function HistoryModal({ product, onClose, onRefresh }: { product: ProductRow; onClose: () => void; onRefresh: () => void }) {
  const [data, setData] = useState<HistoryData | null>(null), [error, setError] = useState(''), [message, setMessage] = useState(''), [pending, setPending] = useState(false)
  useEffect(() => { let active = true; getProductHistory(product.inventoryId).then(v => { if (active) setData(v) }).catch(() => { if (active) setError('Riwayat belum berhasil dimuat.') }); return () => { active = false } }, [product.inventoryId])
  async function run(action: (form: FormData) => Promise<ActionResult>, operation?: string) {
    setPending(true); setError(''); setMessage('')
    const form = new FormData(); form.set('inventory_id', product.inventoryId); if (operation) form.set('operation_id', operation)
    try { const r = await action(form); if (r.success) setMessage(r.message); else setError(r.message); onRefresh(); setData(await getProductHistory(product.inventoryId)) }
    catch { setError('Perubahan belum berhasil diproses. Silakan coba kembali.') }
    finally { setPending(false) }
  }
  return <Modal title="Riwayat Produk" description={`${product.name} · ${product.businessName}`} wide pending={pending} onClose={onClose}>
    <div className="space-y-5 p-5">
      <div className="grid grid-cols-2 gap-3 text-sm"><div className="rounded-lg bg-blue-50 p-3"><p className="text-gray-500">Penjualan selesai</p><p className="mt-1 font-semibold">{quantity(product.soldQuantity)} {product.unitCode}</p><p>{rupiah(product.soldAmount)}</p></div><div className="rounded-lg bg-green-50 p-3"><p className="text-gray-500">Pembelian tercatat</p><p className="mt-1 font-semibold">{quantity(product.boughtQuantity)} {product.unitCode}</p><p>{rupiah(product.boughtAmount)}</p></div></div>
      <Feedback error={error} />{message && <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-700">{message}</p>}
      {!data && !error && <p className="text-sm text-gray-500">Memuat riwayat...</p>}
      {data && <>
        <section><h3 className="mb-3 text-sm font-semibold">Aktivitas stok & produk</h3>
          {!data.events.length ? <p className="text-sm text-gray-500">Belum ada penyesuaian yang dicatat dari admin.</p> : <ul className="divide-y divide-gray-100 rounded-lg border border-gray-100">{data.events.map(e => <li key={e.id} className="space-y-1 p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{kinds[e.kind] ?? 'Aktivitas produk'}{e.quantity > 0 ? ` · +${quantity(e.quantity)} ${product.unitCode}` : ''}</span><time className="text-xs text-gray-500">{formatDateTime(e.at)}</time></div>
            <p className="text-gray-600">{e.reason}</p><p className="text-xs text-gray-500">Stok: {e.before === -1 ? '∞' : quantity(e.before)} → {e.after === -1 ? '∞' : quantity(e.after)}</p>
            {e.status === 'pending' && <button type="button" disabled={pending} onClick={() => run(completeProductPurchase, e.id)} className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 disabled:opacity-50">Selesaikan Pembelian</button>}
          </li>)}</ul>}
        </section>
        <section><h3 className="mb-3 text-sm font-semibold">Dokumen pembelian</h3>{!data.purchases.length ? <p className="text-sm text-gray-500">Belum ada pembelian produk ini.</p> : <ul className="divide-y divide-gray-100 rounded-lg border border-gray-100">{data.purchases.map(p => <li key={p.id} className="flex flex-wrap items-start justify-between gap-2 p-3 text-sm"><div><p className="font-medium">{p.supplier}</p><p className="text-xs text-gray-500">{formatDateTime(p.date)} · {p.status === 'posted' ? 'Tercatat' : p.status === 'draft' ? 'Draft' : 'Dibatalkan'}</p></div><div className="text-right"><p>{quantity(p.quantity)} {product.unitCode}</p><p className="font-medium">{rupiah(p.amount)}</p></div></li>)}</ul>}</section>
        <p className="text-xs text-gray-500">Menampilkan hingga 50 aktivitas terakhir dan 50 rincian pembelian. Penjualan adalah nilai item sebelum diskon nota/pajak, termasuk bon; pembelian hanya menghitung dokumen tercatat.</p>
      </>}
      <div className="flex flex-wrap justify-end gap-3 border-t border-gray-100 pt-4"><button type="button" disabled={pending} onClick={() => run(syncProductToPos)} className={secondary}>Kirim Ulang ke Kasir</button><button type="button" disabled={pending} onClick={onClose} className={primary}>Tutup</button></div>
    </div>
  </Modal>
}

export default function ProductsClient({ data, businessId }: { data: ProductPageData; businessId: string | null }) {
  const router = useRouter(), [tab, setTab] = useState<'all' | 'sell' | 'buy'>('all'), [search, setSearch] = useState('')
  const [modal, setModal] = useState<ModalState | null>(null), [message, setMessage] = useState('')
  const list = data.products.filter(p => (tab === 'all' || (tab === 'sell' ? p.canSell : p.canBuy)) && `${p.name} ${p.sku}`.toLocaleLowerCase('id').includes(search.toLocaleLowerCase('id')))
  const refresh = () => router.refresh()
  const saved = (value: string) => { setModal(null); setMessage(value); refresh() }
  const open = (value: ModalState) => { setMessage(''); setModal(value) }
  return <div className="space-y-4">
    {message && <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-700">{message}</p>}
    <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
      <div className="space-y-4 border-b border-gray-100 p-5">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h2 className="font-semibold text-gray-900">Daftar Produk <span className="ml-2 text-sm font-normal text-gray-500">{list.length} produk</span></h2><p className="mt-1 text-sm text-gray-500">Kelola barang jual, bahan beli, dan stok setiap cabang.</p></div><button type="button" onClick={() => open({ kind: 'create' })} className={`${primary} inline-flex items-center justify-center gap-2`}><Plus className="h-4 w-4" />Produk Baru</button></div>
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div role="tablist" aria-label="Jenis produk" className="flex flex-wrap gap-1 rounded-lg bg-gray-100 p-1">{([{ id: 'all', label: 'Semua Produk', count: data.products.length }, { id: 'sell', label: 'Produk Jual', count: data.products.filter(p => p.canSell).length }, { id: 'buy', label: 'Produk Beli', count: data.products.filter(p => p.canBuy).length }] as const).map(t => <button type="button" key={t.id} role="tab" aria-label={t.label} tabIndex={tab === t.id ? 0 : -1} onKeyDown={event => { const keys = ["all", "sell", "buy"] as const; const index = keys.indexOf(t.id); const next = event.key === "ArrowRight" ? keys[(index + 1) % 3] : event.key === "ArrowLeft" ? keys[(index + 2) % 3] : event.key === "Home" ? keys[0] : event.key === "End" ? keys[2] : null; if (next) { event.preventDefault(); setTab(next); document.getElementById(`product-tab-${next}`)?.focus() } }} id={`product-tab-${t.id}`} aria-controls="products-panel" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={`rounded-md px-3 py-2 text-sm font-medium ${tab === t.id ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>{t.label}<span className="ml-2 text-xs">{t.count}</span></button>)}</div><input type="search" value={search} onChange={e => setSearch(e.target.value)} aria-label="Cari nama atau SKU produk" placeholder="Cari nama / SKU..." className={`${input} sm:max-w-xs`} /></div>
      </div>
      <div id="products-panel" role="tabpanel" aria-labelledby={`product-tab-${tab}`} className="overflow-x-auto">
        <table className="w-full text-left text-sm text-gray-600"><thead className="bg-gray-50 text-xs uppercase text-gray-700"><tr>{['Produk', 'Cabang', 'Jenis', 'Harga & Modal', 'Stok', 'Penjualan', 'Pembelian', 'Aksi'].map(c => <th key={c} scope="col" className="whitespace-nowrap px-4 py-3 font-medium">{c}</th>)}</tr></thead><tbody className="divide-y divide-gray-100">
          {!list.length ? <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-500">{search ? 'Tidak ada produk yang cocok dengan pencarian.' : 'Belum ada produk pada kategori ini.'}</td></tr> : list.map(p => <tr key={p.inventoryId} className="hover:bg-gray-50/50">
            <td className="min-w-44 px-4 py-3"><button type="button" onClick={() => open({ kind: 'history', product: p })} className="text-left font-medium text-gray-900 hover:text-blue-600">{p.name}</button><p className="mt-1 text-xs text-gray-500">{p.sku || p.categoryId || 'Tanpa kategori'} · {p.unitCode}</p>{!p.available && <span className="text-xs text-gray-400">Tidak tersedia</span>}{p.hasRecipe && <span className="ml-2 text-xs text-purple-600">Ada resep</span>}{p.pendingOperation && <button type="button" onClick={() => open({ kind: 'history', product: p })} className="mt-1 block text-xs font-medium text-amber-700">Pembelian tertunda</button>}</td>
            <td className="whitespace-nowrap px-4 py-3">{p.businessName}</td>
            <td className="px-4 py-3"><div className="flex flex-wrap gap-1">{p.canSell && <span className="rounded-md bg-blue-50 px-2 py-1 text-xs text-blue-700">Jual</span>}{p.canBuy && <span className="rounded-md bg-green-50 px-2 py-1 text-xs text-green-700">Beli</span>}</div></td>
            <td className="whitespace-nowrap px-4 py-3"><p className="font-medium text-gray-900">{p.canSell ? rupiah(p.price) : '—'}</p><p className="mt-1 text-xs text-gray-500">Modal: {p.cost === null ? 'Belum diisi' : rupiah(p.cost)}</p></td>
            <td className="whitespace-nowrap px-4 py-3"><span className={p.stock !== -1 && p.stock <= p.minStock ? 'font-semibold text-red-600' : 'font-medium text-gray-900'}>{p.stock === -1 ? '∞' : quantity(p.stock)}</span><p className="mt-1 text-xs text-gray-500">{p.stock === -1 ? 'Tidak terbatas' : p.unitCode}</p></td>
            <td className="whitespace-nowrap px-4 py-3" title="Transaksi selesai; nilai item sebelum diskon nota/pajak, termasuk bon"><p>{quantity(p.soldQuantity)} {p.unitCode}</p><p className="mt-1 text-xs text-gray-500">{rupiah(p.soldAmount)}</p></td>
            <td className="whitespace-nowrap px-4 py-3" title="Jumlah dalam satuan dasar dan nilai dokumen pembelian yang sudah tercatat"><p>{quantity(p.boughtQuantity)} {p.unitCode}</p><p className="mt-1 text-xs text-gray-500">{rupiah(p.boughtAmount)}</p></td>
            <td className="px-4 py-3"><div className="flex items-center gap-1 whitespace-nowrap">{[{ kind: 'edit' as const, label: 'Edit', icon: Edit }, { kind: 'stock' as const, label: 'Tambah Stok', icon: Plus }, { kind: 'history' as const, label: 'Riwayat', icon: History }, { kind: 'delete' as const, label: 'Hapus', icon: Trash2 }].map(a => <button key={a.kind} type="button" title={a.label} aria-label={`${a.label} ${p.name} di ${p.businessName}`} onClick={() => open({ kind: a.kind, product: p })} className={`rounded-lg p-2 ${a.kind === 'delete' ? 'text-red-600 hover:bg-red-50' : 'text-blue-600 hover:bg-blue-50'}`}><a.icon className="h-4 w-4" /></button>)}</div></td>
          </tr>)}
        </tbody></table>
      </div>
      <p className="border-t border-gray-100 px-5 py-3 text-xs text-gray-500">Ringkasan seluruh riwayat. Penjualan menghitung transaksi selesai; pembelian menghitung dokumen tercatat. Resep tidak wajib.</p>
    </div>
    {modal?.kind === 'create' && <ProductForm data={data} selectedBranch={businessId} onClose={() => setModal(null)} onSaved={saved} onRefresh={refresh} />}
    {modal?.kind === 'edit' && <ProductForm data={data} selectedBranch={businessId} product={modal.product} onClose={() => setModal(null)} onSaved={saved} onRefresh={refresh} />}
    {modal?.kind === 'stock' && <StockForm product={modal.product} data={data} onClose={() => setModal(null)} onSaved={saved} onRefresh={refresh} />}
    {modal?.kind === 'delete' && <DeleteModal product={modal.product} onClose={() => setModal(null)} onSaved={saved} />}
    {modal?.kind === 'history' && <HistoryModal product={data.products.find(p => p.inventoryId === modal.product.inventoryId) ?? modal.product} onClose={() => setModal(null)} onRefresh={refresh} />}
  </div>
}
