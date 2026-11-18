'use server'

import { createHash } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { unstable_rethrow } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { getBusinessContext, requireBusinessContext, EMPTY_BUSINESS_ID } from '@/lib/business-context'
import { amount, events, isRow, metadata, number, productForPos, summarizeSales, uuid, withEvent, type Row } from './domain'
import type { ActionResult, HistoryData, HistoryRequest, ProductPageData, StockEvent } from './types'
import { productImagePath, PRODUCT_IMAGE_BUCKET } from './image'
import { initialPurchase, initialUnitCost } from './initial-purchase'
import { defaultHistoryRange, HISTORY_LIMIT, historyBounds, historyExpenseFilter, validateHistoryRequest } from './history-domain'

type DB = Awaited<ReturnType<typeof createClient>>
const PAGE = 500
const productColumns = 'id,inventory_id,owner_id,business_id,name,sku,description,category_id,base_unit_id,can_buy,can_sell,price,cost_price,stock,min_stock,is_available,is_active,updated_at,stock_updated_at,image_url,pending:raw->_inventory->pending,initial_purchase_status:raw->_inventory->initialPurchase->>status'

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
async function product(db: DB, owner: string, id: string, columns = '*'): Promise<Row> {
  if (!uuid(id)) throw new Error('Produk tidak valid.')
  const { businessId } = await requireBusinessContext()
  const { data, error } = await db.from('products').select(columns).eq('inventory_id', id).eq('owner_id', owner).eq('business_id', businessId).maybeSingle()
  if (error || !data) throw new Error('Produk tidak ditemukan atau tidak dapat diakses.')
  return data as unknown as Row
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
  revalidatePath('/dashboard/expenses')
  revalidatePath('/dashboard/recap')
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
  const first = metadata(p.raw).initialPurchase
  if (isRow(first) && first.status === 'pending') throw new Error('Selesaikan pembelian pertama melalui Riwayat sebelum mengubah produk ini.')
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
      imageUrl: typeof p.image_url === 'string' ? p.image_url : null,
      soldQuantity: sales?.quantity ?? 0, soldAmount: sales?.amount ?? 0, boughtQuantity: purchase?.quantity ?? 0, boughtAmount: purchase?.amount ?? 0,
      hasRecipe: activeRecipes.has(String(p.inventory_id)), pendingOperation: typeof p.pending === 'string' ? p.pending : p.initial_purchase_status === 'pending' ? String(p.inventory_id) : null,
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

/** Product creation and the expense RPC are separate requests. Keep a durable
 * request so retry/history recovery can finish without duplicating either. */
async function finishInitialPurchase(db: DB, owner: string, p: Row, operation: string): Promise<ActionResult> {
  const initial = metadata(p.raw).initialPurchase
  if (!isRow(initial) || !isRow(initial.request)) throw new Error('Permintaan pembelian pertama tidak ditemukan.')
  if (initial.status === 'complete') return saved(db, owner, String(p.inventory_id), 'Produk dan pembelian pertama sudah tersimpan.')
  const request = initial.request
  if (request.p_business !== p.business_id || request.p_operation !== operation || p.inventory_id !== operation || !Array.isArray(request.p_lines) || request.p_lines.length !== 1 || !isRow(request.p_lines[0])) throw new Error('Permintaan pembelian pertama tidak sesuai produk.')
  const line = request.p_lines[0]
  const { data: existing, error: readError } = await db.from('expenses').select('entry_request')
    .eq('business_id', p.business_id).eq('entry_group_id', operation).eq('entry_position', 0).maybeSingle()
  if (readError) throw new Error('Status pembelian belum dapat diperiksa. Coba simpan kembali.')
  let version = p.updated_at
  if (existing) {
    const previous = existing.entry_request
    const previousLine = isRow(previous) && Array.isArray(previous.lines) ? previous.lines[0] : null
    const fields = ['id', 'product_id', 'quantity', 'item_unit_id', 'amount', 'category', 'note']
    if (!isRow(previous) || !isRow(previousLine) || previous.date !== request.p_date || previous.scope !== request.p_scope || previous.supplier !== request.p_supplier || fields.some(key => previousLine[key] !== line[key])) throw new Error('Pembelian pertama sudah tercatat dengan data berbeda.')
    // Reuse the exact original version if a previous response was lost after commit.
    version = previousLine.version
  }
  const { error } = await db.rpc('admin_record_expenses', { ...request, p_lines: [{ ...line, version }] })
  if (error) throw new Error(error.message)
  for (let attempt = 0; attempt < 4; attempt++) {
    p = await product(db, owner, String(p.inventory_id))
    const current = metadata(p.raw).initialPurchase
    if (isRow(current) && current.status === 'complete') return saved(db, owner, String(p.inventory_id), 'Produk dan pembelian pertama berhasil dicatat.')
    const event = events(p.raw).find(e => e.id === operation)
    if (!event) throw new Error('Jurnal pembelian pertama tidak ditemukan.')
    const raw = { ...(isRow(p.raw) ? p.raw : {}), _inventory: { ...metadata(p.raw), initialPurchase: { ...initial, status: 'complete' } } }
    try {
      await update(db, owner, p, { raw: withEvent(raw, { ...event, after: number(p.stock), status: 'complete' }) })
      return saved(db, owner, String(p.inventory_id), 'Produk, pembelian pertama, dan pengeluaran berhasil dicatat.')
    } catch { /* Retry metadata only. The RPC already committed atomically. */ }
  }
  invalidate()
  return { success: false, refresh: true, message: 'Pembelian dan pengeluaran sudah tercatat. Selesaikan catatan melalui Riwayat; stok tidak akan ditambahkan lagi.' }
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
  let requestedPurchase = false
  try {
    const { db, owner } = await session()
    const id = text(form, 'inventory_id', 40), operation = text(form, 'operation_id', 40)
    if (!uuid(operation)) throw new Error('Identitas perubahan tidak valid. Buka ulang dialog.')
    const name = text(form, 'name', 150), businessId = text(form, 'business_id', 40)
    if (!name) throw new Error('Nama produk wajib diisi.')
    const b = await branch(db, owner, businessId)
    const canBuy = checked(form, 'can_buy'), canSell = checked(form, 'can_sell')
    if (!canBuy && !canSell) throw new Error('Aktifkan minimal Dibeli atau Dijual.')
    const track = checked(form, 'track_stock')
    const purchase = initialPurchase(form)
    requestedPurchase = !!purchase
    if (purchase && (!canBuy || id)) throw new Error('Pembelian pertama hanya tersedia untuk produk baru yang Dibeli.')
    if (purchase && track && number(amount(form.get('initial_quantity') || '0', 'Stok awal')) !== 0) throw new Error('Stok awal berasal dari pembelian pertama. Kosongkan stok awal tambahan agar tidak dihitung dua kali.')
    if (purchase?.supplier) {
      const { data: supplier, error } = await db.from('suppliers').select('id').eq('id', purchase.supplier).eq('owner_id', owner).eq('is_active', true).maybeSingle()
      if (error || !supplier) throw new Error('Supplier tidak tersedia untuk akun ini.')
    }
    const price = amount(form.get('price') || '0', 'Harga jual'), costText = text(form, 'cost_price', 40)
    const cost = purchase ? amount(initialUnitCost(purchase), 'Harga beli per satuan') : costText ? amount(costText, 'Modal acuan') : null
    const categoryId = text(form, 'category_id', 100)
    const config = isRow(b.pos_config) ? b.pos_config : {}
    const categories = Array.isArray(config.categories) ? config.categories.filter(isRow) : []
    if (categoryId && !categories.some(c => c.id === categoryId)) throw new Error('Kategori tidak tersedia di cabang ini.')
    const fields: Row = { name, sku: text(form, 'sku', 100) || null, description: text(form, 'description', 1000) || null,
      category_id: categoryId || null, can_buy: canBuy, can_sell: canSell, price, cost_price: cost, min_stock: amount(form.get('min_stock') || '0', 'Stok minimum'), is_available: checked(form, 'is_available') }
    const imageIntent = text(form, 'image_intent', 10) || 'keep'
    if (!['keep','replace','remove'].includes(imageIntent)) throw new Error('Pilihan foto tidak valid.')
    if (imageIntent === 'remove') fields.image_url = null
    if (imageIntent === 'replace') {
      const url = text(form, 'image_url', 2048)
      const path = productImagePath(url, process.env.NEXT_PUBLIC_SUPABASE_URL!, owner, businessId, id || operation)
      if (!path) throw new Error('Foto tidak sesuai dengan produk atau cabang ini. Unggah ulang foto.')
      const split = path.lastIndexOf('/'), filename = path.slice(split + 1)
      const { data: files, error } = await db.storage.from(PRODUCT_IMAGE_BUCKET).list(path.slice(0, split), { search: filename, limit: 2 })
      if (error || !files?.some(file => file.name === filename)) throw new Error('Foto belum tersedia. Unggah ulang foto.')
      fields.image_url = url
    }
    let p: Row
    if (id) {
      p = await product(db, owner, id)
      if (p.business_id !== businessId || !p.is_active) throw new Error('Produk tidak sesuai cabang atau sudah dihapus.')
      noPending(p)
      const fingerprint = createHash('sha256').update(JSON.stringify(fields)).digest('hex')
      const existingEvent = events(p.raw).find(e => e.id === operation)
      if (existingEvent) {
        if (existingEvent.fingerprint && existingEvent.fingerprint !== fingerprint) throw new Error('Permintaan ini sudah tersimpan dengan data berbeda. Tutup dan buka ulang form.')
        return saved(db, owner, id, 'Perubahan sudah tersimpan.')
      }
      requireVersion(p, form)
      const initQty = track && number(p.stock) === -1 ? number(amount(form.get('initial_quantity') || '0', 'Stok awal')) : 0
      const stock = track ? (number(p.stock) === -1 ? initQty : number(p.stock)) : -1
      const event: StockEvent = { id: operation, kind: stock !== number(p.stock) ? 'tracking' : 'edit', at: new Date().toISOString(), quantity: initQty,
        before: number(p.stock), after: stock, reason: stock !== number(p.stock) ? (text(form, 'reason') || 'Pengaturan pencatatan stok') : 'Perubahan data produk', status: 'complete', fingerprint }
      const raw = { ...(isRow(p.raw) ? p.raw : {}), name, description: fields.description, categoryId: categoryId || 'uncategorized' }
      p = await update(db, owner, p, { ...fields, stock, stock_mode: stock === -1 ? 'none' : 'self', pos_managed: canSell, raw: withEvent(raw, event) })
    } else {
      const baseUnit = text(form, 'base_unit_id', 40)
      if (!uuid(baseUnit)) throw new Error('Pilih satuan dasar.')
      const { data: u } = await db.from('units').select('id').eq('id', baseUnit).maybeSingle()
      if (!u) throw new Error('Satuan dasar tidak ditemukan.')
      const quantity = track ? amount(form.get('initial_quantity') || '0', 'Stok awal') : '0'
      const stock = track ? number(quantity) : -1
      const signature = createHash('sha256').update(JSON.stringify({ businessId, fields, baseUnit, track, quantity, ...(purchase ? { purchase } : {}) })).digest('hex')
      const { data: existing, error } = await db.from('products').select('*').eq('inventory_id', operation).eq('owner_id', owner).eq('business_id', businessId).maybeSingle()
      if (error) throw new Error('Gagal memeriksa produk baru.')
      if (existing) {
        if (metadata(existing.raw).creationSignature !== signature) throw new Error('Permintaan produk ini sudah tersimpan dengan data berbeda. Buka ulang dialog.')
        p = existing as Row
      } else {
        const event: StockEvent = { id: operation, kind: purchase ? 'purchase' : 'initial', at: new Date().toISOString(), quantity: purchase ? number(purchase.quantity) : number(quantity), before: 0, after: stock, reason: purchase ? purchase.note : text(form, 'reason') || 'Stok awal produk baru', status: purchase ? 'pending' : 'complete', ...(purchase ? { purchaseId: operation } : {}) }
        const request = purchase ? { p_business: businessId, p_operation: operation, p_date: purchase.date, p_scope: 'daily', p_supplier: purchase.supplier,
          p_lines: [{ id: operation, product_id: operation, quantity: purchase.quantity, item_unit_id: null, amount: purchase.total, category: 'Pembelian Barang', note: purchase.note }] } : null
        const raw = { _inventory: { version: 1, creationSignature: signature, events: [event], ...(request ? { initialPurchase: { status: 'pending', request } } : {}) } }
        const { data, error: insertError } = await db.from('products').insert({ ...fields, inventory_id: operation, business_id: businessId, owner_id: owner,
          id: `p-admin-${operation}`, base_unit_id: baseUnit, stock, stock_mode: track ? 'self' : 'none', pos_managed: canSell, raw }).select('*').single()
        if (insertError?.code === '23505') throw new Error('SKU tersebut sudah dipakai di cabang ini.')
        if (insertError || !data) throw new Error('Produk baru belum berhasil disimpan.')
        p = data as Row
      }
      committed = true
      if (purchase) return await finishInitialPurchase(db, owner, p, operation)
    }
    committed = true
    return await saved(db, owner, String(p.inventory_id), id ? 'Produk berhasil diperbarui.' : 'Produk baru berhasil ditambahkan.')
  } catch (error) {
    if (committed) invalidate()
    const result = fail(error, committed)
    return committed && requestedPurchase ? { ...result, message: `Produk sudah tersimpan; pembelian pertama belum selesai. Simpan ulang tanpa mengubah isian atau lanjutkan lewat Riwayat. ${result.message}` } : result
  }
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
    const id = text(form, 'inventory_id', 40), operation = text(form, 'operation_id', 40)
    const p = await product(db, owner, id)
    if (isRow(metadata(p.raw).initialPurchase)) return await finishInitialPurchase(db, owner, p, operation)
    return await finishPurchase(db, owner, id, operation)
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
/** Fetch complete bounded ranges before supplier grouping; never silently rank a truncated history. */
async function historyRows(query: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>) {
  const result: Row[] = []
  for (let from = 0; from <= HISTORY_LIMIT; from += PAGE) {
    const { data, error } = await query(from, Math.min(from + PAGE - 1, HISTORY_LIMIT))
    if (error || !Array.isArray(data)) throw new Error('Gagal memuat riwayat produk. Silakan coba kembali.')
    result.push(...data.filter(isRow))
    if (result.length > HISTORY_LIMIT) throw new Error('Riwayat melebihi 1.000 catatan per sumber. Persempit rentang tanggal agar seluruh hasil dapat ditampilkan.')
    if (data.length < PAGE) return result
  }
  return result
}

async function loadProductHistory(id: string, request: HistoryRequest): Promise<HistoryData> {
  const { tab, start, end } = validateHistoryRequest(request)
  const { db, owner } = await session()
  const p = await product(db, owner, id, tab === 'events' ? 'inventory_id,business_id,raw' : 'inventory_id,business_id')
  const { from, until } = historyBounds(start, end)
  const result: HistoryData = { events: [], purchases: [], adjustments: [] }
  if (tab === 'events') {
    result.events = events(p.raw).filter(e => Date.parse(e.at) >= Date.parse(from) && Date.parse(e.at) < Date.parse(until))
      .sort((a,b) => Date.parse(b.at) - Date.parse(a.at) || a.id.localeCompare(b.id))
    if (result.events.length > HISTORY_LIMIT) throw new Error('Aktivitas melebihi 1.000 catatan. Persempit rentang tanggal.')
    return result
  }
  if (tab === 'adjustments') {
    const adjustments = await historyRows((a,z) => db.from('stock_adjustment_lines')
      .select('id,mode,before_stock,after_stock,delta,reason,stock_adjustments!inner(created_at,created_by_name)')
      .eq('product_id', id).eq('owner_id', owner).eq('business_id', p.business_id)
      .gte('stock_adjustments.created_at', from).lt('stock_adjustments.created_at', until).order('id').range(a,z))
    result.adjustments = adjustments.flatMap(row => {
      const h = row.stock_adjustments
      return isRow(h) ? [{ id: String(row.id), mode: String(row.mode), before: number(row.before_stock), after: number(row.after_stock), delta: number(row.delta), reason: String(row.reason), date: String(h.created_at), by: String(h.created_by_name) }] : []
    }).sort((a,b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id))
    return result
  }
  const [purchases, expenses] = await Promise.all([
    historyRows((a,z) => db.from('purchase_lines')
      .select('id,quantity_base,line_total,notes,purchases!inner(purchased_at,document_number,supplier_id,supplier_name,status,suppliers(name,address))')
      .eq('product_id', id).eq('owner_id', owner).eq('business_id', p.business_id).eq('purchases.status', 'posted')
      .gte('purchases.purchased_at', from).lt('purchases.purchased_at', until).order('id').range(a,z)),
    historyRows((a,z) => db.from('expenses').select('id,date,scope,quantity,amount,note,supplier_id,supplier_name,suppliers(name,address)')
      .eq('business_id', p.business_id).eq('product_id', id).is('purchase_line_id', null)
      .or(historyExpenseFilter(start, end)).order('id').range(a,z)),
  ])
  result.purchases = [
    ...purchases.flatMap(row => {
      const h = row.purchases
      if (!isRow(h)) return []
      const supplier = isRow(h.suppliers) ? h.suppliers : {}, qty = number(row.quantity_base), total = number(row.line_total)
      return [{ id: `purchase:${row.id}`, source: 'purchase' as const, date: String(h.purchased_at), monthly: false, number: String(h.document_number || ''),
        supplierId: h.supplier_id ? String(h.supplier_id) : null, supplier: String(h.supplier_name || supplier.name || 'Tanpa supplier'), address: supplier.address ? String(supplier.address) : null,
        quantity: qty > 0 ? qty : null, amount: total, unitPrice: qty > 0 ? total / qty : null, note: String(row.notes || '') }]
    }),
    ...expenses.map(row => {
      const supplier = isRow(row.suppliers) ? row.suppliers : {}, total = number(row.amount)
      // Unlinked expense quantities have no reliable historical conversion snapshot.
      // Do not infer a base-unit price using today's packaging/conversion.
      return { id: `expense:${row.id}`, source: 'expense' as const, date: `${String(row.date).slice(0, 7)}${row.scope === 'monthly' ? '-01' : String(row.date).slice(7)}T00:00:00+07:00`, monthly: row.scope === 'monthly', number: '',
        supplierId: row.supplier_id ? String(row.supplier_id) : null, supplier: String(row.supplier_name || supplier.name || 'Tanpa supplier'), address: supplier.address ? String(supplier.address) : null,
        quantity: null, amount: total, unitPrice: null, note: String(row.note || '') }
    }),
  ]
  return result
}

export async function getProductHistory(id: string, request: HistoryRequest = { tab: 'purchases', ...defaultHistoryRange() }): Promise<HistoryData> {
  try { return await loadProductHistory(id, request) }
  catch (error) {
    unstable_rethrow(error)
    // Return expected read errors explicitly; production masks thrown Server Action messages.
    return { events: [], purchases: [], adjustments: [], error: error instanceof Error ? error.message : 'Gagal memuat riwayat produk.' }
  }
}
