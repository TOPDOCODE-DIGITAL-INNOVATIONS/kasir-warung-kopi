'use server'

import { createHash } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { unstable_rethrow } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { getBusinessContext, requireBusinessContext, EMPTY_BUSINESS_ID } from '@/lib/business-context'
import { amount, events, isRow, metadata, number, productForPos, summarizeSales, uuid, withEvent, type Row } from './domain'
import type { ActionResult, HistoryData, ProductPageData, StockEvent } from './types'

type DB = Awaited<ReturnType<typeof createClient>>
const PAGE = 500
const productColumns = 'id,inventory_id,owner_id,business_id,name,sku,description,category_id,base_unit_id,can_buy,can_sell,price,cost_price,stock,min_stock,is_available,is_active,updated_at,stock_updated_at,pending:raw->_inventory->pending'

async function rows(query: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<Row[]> {
  const result: Row[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await query(from, from + PAGE - 1)
    if (error || !Array.isArray(data)) throw new Error('Gagal memuat data. Muat ulang halaman untuk mencoba lagi.')
    result.push(...data.filter(isRow))
    if (data.length < PAGE) return result
  }
}
async function session() {
  const { supabase: db, user } = await requireBusinessContext()
  return { db, owner: user.id }
}
async function branch(db: DB, owner: string, id: string) {
  if (!uuid(id)) throw new Error('Cabang tidak valid.')
  await requireBusinessContext(id)
  const { data, error } = await db.from('businesses').select('id,name,pos_config,pos_config_updated_at').eq('id', id).eq('owner_id', owner).maybeSingle()
  if (error || !data) throw new Error('Cabang tidak ditemukan atau tidak dapat diakses.')
  return data as Row
}
async function product(db: DB, owner: string, id: string): Promise<Row> {
  if (!uuid(id)) throw new Error('Produk tidak valid.')
  const { businessId } = await requireBusinessContext()
  const { data, error } = await db.from('products').select('*').eq('inventory_id', id).eq('owner_id', owner).eq('business_id', businessId).maybeSingle()
  if (error || !data) throw new Error('Produk tidak ditemukan atau tidak dapat diakses.')
  return data as Row
}
function text(form: FormData, name: string, max = 500) {
  const value = String(form.get(name) ?? '').trim()
  if (value.length > max) throw new Error(`${name === 'name' ? 'Nama' : 'Teks'} maksimal ${max} karakter.`)
  return value
}
const checked = (form: FormData, key: string) => form.get(key) === 'on'
function fail(error: unknown, refresh = false): ActionResult {
  unstable_rethrow(error)
  return { success: false, message: error instanceof Error ? error.message : 'Perubahan belum berhasil disimpan. Silakan coba kembali.', refresh }
}
function invalidate() {
  revalidatePath('/dashboard/products')
  revalidatePath('/dashboard')
}
async function update(db: DB, owner: string, p: Row, values: Row): Promise<Row> {
  const { data, error } = await db.from('products').update(values).eq('inventory_id', p.inventory_id)
    .eq('owner_id', owner).eq('updated_at', p.updated_at).select('*').maybeSingle()
  if (error?.code === '23505') throw new Error('SKU tersebut sudah dipakai di cabang ini.')
  if (error) throw new Error('Perubahan produk belum berhasil disimpan.')
  if (!data) throw new Error('Produk berubah di perangkat lain. Muat ulang sebelum mencoba lagi.')
  return data as Row
}
function requireVersion(p: Row, form: FormData) {
  if (String(p.updated_at) !== String(form.get('version'))) throw new Error('Produk sudah berubah. Muat ulang halaman sebelum mencoba lagi.')
}
function noPending(p: Row, operation?: string) {
  const pending = metadata(p.raw).pending
  if (pending && pending !== operation) throw new Error('Selesaikan pembelian tertunda melalui Riwayat sebelum mengubah produk ini.')
}

/** Bounded page queries, never a query per product/transaction item. */
export async function getProductsPage(requestedBusinessId: string | null): Promise<ProductPageData> {
  const { supabase: db, user, businessId } = await getBusinessContext()
  if (requestedBusinessId && requestedBusinessId !== businessId) throw new Error('Cabang tidak sesuai dengan cabang aktif.')
  const owner = user.id
  const [businesses, units] = await Promise.all([
    rows((a, z) => db.from('businesses').select('id,name,categories:pos_config->categories').eq('owner_id', owner).eq('id', businessId ?? EMPTY_BUSINESS_ID).order('id').range(a, z)),
    rows((a, z) => db.from('units').select('id,name,code').order('id').range(a, z)),
  ])
  const branches = businesses.map(b => ({ id: String(b.id), name: String(b.name), categories: Array.isArray(b.categories) ? b.categories.filter(isRow).map(c => ({ id: String(c.id), name: String(c.name) })) : [] }))
  const result: ProductPageData = { businesses: branches, units: units.map(u => ({ id: String(u.id), code: String(u.code), name: String(u.name) })), products: [], suppliers: [], itemUnits: [], invalidBusiness: !!businessId && !branches.some(b => b.id === businessId) }
  if (!branches.length || result.invalidBusiness) return result
  const branchIds = businessId ? [businessId] : branches.map(b => b.id)
  const [products, transactions, purchaseLines, suppliers, itemUnits, recipes, nominalExpenses] = await Promise.all([
    rows((a, z) => db.from('products').select(productColumns).eq('owner_id', owner).eq('is_active', true).in('business_id', branchIds).order('business_id').order('id').range(a, z)),
    rows((a, z) => db.from('transactions').select('business_id,id,items').eq('status', 'completed').in('business_id', branchIds).order('business_id').order('id').range(a, z)),
    rows((a, z) => db.from('purchase_lines').select('id,product_id,quantity_base,line_total,purchases!inner(status)').eq('owner_id', owner).eq('purchases.status', 'posted').in('business_id', branchIds).order('id').range(a, z)),
    rows((a, z) => db.from('suppliers').select('id,name').eq('owner_id', owner).eq('is_active', true).order('id').range(a, z)),
    rows((a, z) => db.from('item_units').select('id,product_id,label,factor_to_base,products!inner(business_id)').eq('owner_id', owner).eq('is_active', true).in('products.business_id', branchIds).order('id').range(a, z)),
    rows((a, z) => db.from('recipes').select('id,product_id').eq('owner_id', owner).eq('status', 'active').in('business_id', branchIds).order('id').range(a, z)),
    rows((a, z) => db.from('expenses').select('id,product_id,amount').in('business_id', branchIds).not('product_id', 'is', null).is('purchase_line_id', null).order('business_id').order('id').range(a, z)),
  ])
  const sold = summarizeSales(transactions)
  const bought = new Map<string, { quantity: number; amount: number }>()
  for (const row of purchaseLines) {
    const key = String(row.product_id), value = bought.get(key) ?? { quantity: 0, amount: 0 }
    value.quantity += number(row.quantity_base); value.amount += number(row.line_total); bought.set(key, value)
  }
  for (const row of nominalExpenses) { const key = String(row.product_id), value = bought.get(key) ?? { quantity: 0, amount: 0 }; value.amount += number(row.amount); bought.set(key, value) }
  const activeRecipes = new Set(recipes.map(r => String(r.product_id)))
  result.products = products.map(p => {
    const sales = sold.get(`${p.business_id}:${p.id}`), purchase = bought.get(String(p.inventory_id))
    return {
      id: String(p.id), inventoryId: String(p.inventory_id), businessId: String(p.business_id), businessName: branches.find(b => b.id === p.business_id)?.name ?? '-',
      name: String(p.name), sku: String(p.sku ?? ''), description: String(p.description ?? ''), categoryId: String(p.category_id ?? ''),
      baseUnitId: String(p.base_unit_id), unitCode: result.units.find(u => u.id === p.base_unit_id)?.code ?? 'pcs',
      canBuy: p.can_buy === true, canSell: p.can_sell === true, price: number(p.price), cost: p.cost_price === null ? null : number(p.cost_price),
      stock: number(p.stock), minStock: number(p.min_stock), available: p.is_available === true, version: String(p.updated_at), stockUpdatedAt: typeof p.stock_updated_at === 'string' ? p.stock_updated_at : null,
      soldQuantity: sales?.quantity ?? 0, soldAmount: sales?.amount ?? 0, boughtQuantity: purchase?.quantity ?? 0, boughtAmount: purchase?.amount ?? 0,
      hasRecipe: activeRecipes.has(String(p.inventory_id)), pendingOperation: typeof p.pending === 'string' ? p.pending : null,
    }
  }).sort((a, b) => a.name.localeCompare(b.name, 'id'))
  const productIds = new Set(result.products.map(p => p.inventoryId))
  result.itemUnits = itemUnits.filter(u => productIds.has(String(u.product_id))).map(u => ({ id: String(u.id), productId: String(u.product_id), label: String(u.label), factor: number(u.factor_to_base) }))
  result.suppliers = suppliers.map(s => ({ id: String(s.id), name: String(s.name) })).sort((a, b) => a.name.localeCompare(b.name, 'id'))
  return result
}

/** Merge only this product into the latest config; keep cashiers/settings/options. */
async function publish(db: DB, owner: string, id: string): Promise<boolean> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const p = await product(db, owner, id)
    const b = await branch(db, owner, String(p.business_id))
    if (!isRow(b.pos_config)) return !p.can_sell // A buy-only ingredient needs no POS setup.
    const config = b.pos_config
    if (!Array.isArray(config.products) || !Array.isArray(config.cashiers) || !config.cashiers.length) return !p.can_sell
    const current = config.products.find(v => isRow(v) && v.id === p.id)
    const list = config.products.filter(v => !isRow(v) || v.id !== p.id)
    if (p.can_sell && p.is_active) list.push(productForPos(p, current))
    const old = b.pos_config_updated_at as string | null
    const now = new Date(Math.max(Date.now(), old ? Date.parse(old) + 1 : 0)).toISOString()
    let q = db.from('businesses').update({ pos_config: { ...config, products: list }, pos_config_updated_at: now }).eq('id', b.id).eq('owner_id', owner)
    q = old ? q.eq('pos_config_updated_at', old) : q.is('pos_config_updated_at', null)
    const { data, error } = await q.select('id')
    if (error) return false
    if (data?.length) return true
  }
  return false
}
async function saved(db: DB, owner: string, id: string, message: string): Promise<ActionResult> {
  invalidate()
  let synced = false
  try { synced = await publish(db, owner, id) } catch { /* Product is saved; config can be retried separately. */ }
  return { success: true, refresh: true, message: synced ? `${message} Diterapkan di kasir setelah sinkronisasi.` : `${message} Konfigurasi kasir belum diperbarui; hubungkan kasir atau kirim ulang melalui Riwayat.` }
}

/** Durable operation journal in raw: a retry completes posting, never adds stock twice. */
async function finishPurchase(db: DB, owner: string, id: string, operation: string): Promise<ActionResult> {
  let p = await product(db, owner, id)
  const event = events(p.raw).find(e => e.id === operation && e.kind === 'purchase')
  if (!event?.purchaseId) throw new Error('Catatan pembelian tidak ditemukan.')
  const { data: header, error } = await db.from('purchases').select('id,status').eq('id', event.purchaseId).eq('owner_id', owner).eq('business_id', p.business_id).single()
  if (error || !header) throw new Error('Dokumen pembelian belum dapat dibaca. Selesaikan kembali melalui Riwayat.')
  if (header.status === 'cancelled') throw new Error('Dokumen pembelian dibatalkan. Periksa penyesuaian stok sebelum melanjutkan.')
  if (header.status === 'draft') {
    const { data: posted, error: postError } = await db.from('purchases').update({ status: 'posted' }).eq('id', header.id).eq('owner_id', owner).eq('status', 'draft').select('id').maybeSingle()
    if (postError || !posted) {
      invalidate()
      return { success: false, refresh: true, message: 'Stok sudah tersimpan, tetapi dokumen pembelian masih tertunda. Klik Selesaikan Pembelian di Riwayat; stok tidak akan ditambahkan lagi.' }
    }
  }
  for (let attempt = 0; attempt < 4; attempt++) {
    p = await product(db, owner, id)
    const current = events(p.raw).find(e => e.id === operation)
    if (current?.status === 'complete') return saved(db, owner, id, 'Pembelian berhasil dicatat.')
    try {
      await update(db, owner, p, { raw: withEvent(p.raw, { ...event, status: 'complete' }) })
      return saved(db, owner, id, 'Pembelian dan stok berhasil dicatat.')
    } catch { /* Retry only journal finalization, not the stock change. */ }
  }
  invalidate()
  return { success: false, refresh: true, message: 'Pembelian sudah tercatat. Catatan penyelesaian belum tersimpan; selesaikan kembali melalui Riwayat.' }
}

export async function saveProduct(form: FormData): Promise<ActionResult> {
  let committed = false
  try {
    const { db, owner } = await session()
    const id = text(form, 'inventory_id', 40), operation = text(form, 'operation_id', 40)
    if (!uuid(operation)) throw new Error('Identitas perubahan tidak valid. Buka ulang dialog.')
    const name = text(form, 'name', 150), businessId = text(form, 'business_id', 40)
    if (!name) throw new Error('Nama produk wajib diisi.')
    const b = await branch(db, owner, businessId)
    const canBuy = checked(form, 'can_buy'), canSell = checked(form, 'can_sell')
    if (!canBuy && !canSell) throw new Error('Aktifkan minimal Bisa Dibeli atau Bisa Dijual.')
    const track = checked(form, 'track_stock')
    if (checked(form, 'initial_purchase')) throw new Error('Catat pembelian melalui menu Pengeluaran.')
    const price = amount(form.get('price') || '0', 'Harga jual'), costText = text(form, 'cost_price', 40)
    const cost = costText ? amount(costText, 'Modal acuan') : null
    const categoryId = text(form, 'category_id', 100)
    const config = isRow(b.pos_config) ? b.pos_config : {}
    const categories = Array.isArray(config.categories) ? config.categories.filter(isRow) : []
    if (categoryId && !categories.some(c => c.id === categoryId)) throw new Error('Kategori tidak tersedia di cabang ini.')
    const fields: Row = { name, sku: text(form, 'sku', 100) || null, description: text(form, 'description', 1000) || null,
      category_id: categoryId || null, can_buy: canBuy, can_sell: canSell, price, cost_price: cost, min_stock: amount(form.get('min_stock') || '0', 'Stok minimum'), is_available: checked(form, 'is_available') }
    let p: Row
    if (id) {
      p = await product(db, owner, id)
      if (p.business_id !== businessId || !p.is_active) throw new Error('Produk tidak sesuai cabang atau sudah dihapus.')
      noPending(p)
      if (events(p.raw).some(e => e.id === operation)) return saved(db, owner, id, 'Perubahan sudah tersimpan.')
      requireVersion(p, form)
      const stock = track ? (number(p.stock) === -1 ? 0 : number(p.stock)) : -1
      const event: StockEvent = { id: operation, kind: stock !== number(p.stock) ? 'tracking' : 'edit', at: new Date().toISOString(), quantity: 0,
        before: number(p.stock), after: stock, reason: stock !== number(p.stock) ? 'Pengaturan pencatatan stok' : 'Perubahan data produk', status: 'complete' }
      const raw = { ...(isRow(p.raw) ? p.raw : {}), name, description: fields.description, categoryId: categoryId || 'uncategorized' }
      p = await update(db, owner, p, { ...fields, stock, stock_mode: stock === -1 ? 'none' : 'self', pos_managed: canSell, raw: withEvent(raw, event) })
    } else {
      const baseUnit = text(form, 'base_unit_id', 40)
      if (!uuid(baseUnit)) throw new Error('Pilih satuan dasar.')
      const { data: u } = await db.from('units').select('id').eq('id', baseUnit).maybeSingle()
      if (!u) throw new Error('Satuan dasar tidak ditemukan.')
      const quantity = track ? amount(form.get('initial_quantity') || '0', 'Stok awal') : '0'
      const stock = track ? number(quantity) : -1
      const signature = createHash('sha256').update(JSON.stringify({ businessId, fields, baseUnit, track, quantity })).digest('hex')
      const { data: existing, error } = await db.from('products').select('*').eq('inventory_id', operation).eq('owner_id', owner).eq('business_id', businessId).maybeSingle()
      if (error) throw new Error('Gagal memeriksa produk baru.')
      if (existing) {
        if (metadata(existing.raw).creationSignature !== signature) throw new Error('Permintaan produk ini sudah tersimpan dengan data berbeda. Buka ulang dialog.')
        p = existing as Row
      } else {
        const event: StockEvent = { id: operation, kind: 'initial', at: new Date().toISOString(), quantity: number(quantity), before: 0, after: stock, reason: text(form, 'reason') || 'Stok awal produk baru', status: 'complete' }
        const raw = { _inventory: { version: 1, creationSignature: signature, events: [event] } }
        const { data, error: insertError } = await db.from('products').insert({ ...fields, inventory_id: operation, business_id: businessId, owner_id: owner,
          id: `p-admin-${operation}`, base_unit_id: baseUnit, stock, stock_mode: track ? 'self' : 'none', pos_managed: canSell, raw }).select('*').single()
        if (insertError?.code === '23505') throw new Error('SKU tersebut sudah dipakai di cabang ini.')
        if (insertError || !data) throw new Error('Produk baru belum berhasil disimpan.')
        p = data as Row
      }
      committed = true
    }
    committed = true
    return await saved(db, owner, String(p.inventory_id), id ? 'Produk berhasil diperbarui.' : 'Produk baru berhasil ditambahkan.')
  } catch (error) { if (committed) invalidate(); return fail(error, committed) }
}

export async function recordStockCount(form: FormData): Promise<ActionResult> {
  try {
    const businessId = text(form, 'business_id', 40)
    const { supabase } = await requireBusinessContext(businessId)
    const operation = text(form, 'operation_id', 40)
    if (!uuid(operation)) throw new Error('Identitas operasi tidak valid. Buka ulang dialog.')
    const lines = JSON.parse(String(form.get('lines') ?? '[]'))
    const { error } = await supabase.rpc('admin_record_stock', { p_business: businessId, p_operation: operation, p_lines: lines, p_note: text(form, 'note') })
    if (error) throw new Error(error.message)
    invalidate()
    return { success: true, message: 'Perubahan stok berhasil disimpan.' }
  } catch (error) { return fail(error) }
}
export async function completeProductPurchase(form: FormData): Promise<ActionResult> {
  try {
    const { db, owner } = await session()
    return await finishPurchase(db, owner, text(form, 'inventory_id', 40), text(form, 'operation_id', 40))
  } catch (error) { return fail(error, true) }
}
export async function deleteProduct(form: FormData): Promise<ActionResult> {
  try {
    const { db, owner } = await session(), id = text(form, 'inventory_id', 40)
    const p = await product(db, owner, id)
    if (!p.is_active) return saved(db, owner, id, 'Produk sudah dihapus dari daftar aktif.')
    noPending(p); requireVersion(p, form)
    const event: StockEvent = { id: crypto.randomUUID(), kind: 'archive', at: new Date().toISOString(), quantity: 0, before: number(p.stock), after: number(p.stock), reason: 'Produk dihapus dari daftar aktif', status: 'complete' }
    await update(db, owner, p, { is_active: false, is_available: false, can_sell: false, pos_sync_enabled: false, raw: withEvent(p.raw, event) })
    return await saved(db, owner, id, 'Produk dihapus dari daftar aktif. Histori tetap disimpan.')
  } catch (error) { return fail(error) }
}
export async function syncProductToPos(form: FormData): Promise<ActionResult> {
  try {
    const { db, owner } = await session()
    const ok = await publish(db, owner, text(form, 'inventory_id', 40))
    invalidate()
    return { success: ok, message: ok ? 'Perubahan siap diterima kasir saat sinkronisasi.' : 'Konfigurasi kasir belum siap atau sedang berubah. Hubungkan kasir dan coba kembali.' }
  } catch (error) { return fail(error) }
}
export async function getProductHistory(id: string): Promise<HistoryData> {
  const { db, owner } = await session(), p = await product(db, owner, id)
  const [purchases, adjustments] = await Promise.all([
    db.from('purchase_lines').select('id,quantity_base,line_total,purchases!inner(id,purchased_at,document_number,supplier_name,status)')
      .eq('product_id', id).eq('owner_id', owner).order('created_at', { ascending: false }).limit(50),
    db.from('stock_adjustment_lines').select('id,mode,before_stock,after_stock,delta,reason,stock_adjustments!inner(created_at,created_by_name)')
      .eq('product_id', id).eq('owner_id', owner).eq('business_id', p.business_id)
      .order('created_at', { ascending: false }).order('id').limit(100),
  ])
  if (purchases.error || adjustments.error) throw new Error('Gagal memuat riwayat produk.')
  return {
    events: events(p.raw).slice(-50).reverse(),
    purchases: (purchases.data as unknown as Row[]).flatMap(row => {
      const h = row.purchases
      return isRow(h) ? [{ id: String(h.id), date: String(h.purchased_at), number: String(h.document_number), supplier: String(h.supplier_name || 'Tanpa supplier'), quantity: number(row.quantity_base), amount: number(row.line_total), status: String(h.status) }] : []
    }),
    adjustments: (adjustments.data as unknown as Row[]).flatMap(row => {
      const h = row.stock_adjustments
      return isRow(h) ? [{ id: String(row.id), mode: String(row.mode), before: number(row.before_stock), after: number(row.after_stock), delta: number(row.delta), reason: String(row.reason), date: String(h.created_at), by: String(h.created_by_name) }] : []
    }).sort((a,b) => b.date.localeCompare(a.date)),
  }
}
