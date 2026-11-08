import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/utils/supabase/admin'

// Sama dengan region database Supabase (Sydney); lihat src/app/layout.tsx.
export const preferredRegion = 'syd1'

/**
 * Endpoint sinkronisasi dua arah dengan aplikasi kasir (app-kasir).
 *
 * POST: kasir mengirim transaksi, pengeluaran, shift, dan (jika berubah) data master
 *       (menu, kategori, kasir, pengaturan toko). Lihat app-kasir/src/lib/storage.ts -> doCloudSync().
 * GET:  kasir menarik data dari perangkat lain sejak cursor terakhir. Lihat pullFromCloud().
 *
 * Auth: header `Authorization: Bearer <sync_token>` atau `x-api-key: <sync_token>`,
 * token diambil dari halaman Cabang Usaha di dashboard.
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key',
  'Access-Control-Max-Age': '86400',
}

const MAX_ROWS = 5000
/** Baris per jenis data per halaman GET. Harus lebih besar dari batch kirim kasir (200 transaksi / 500 pengeluaran). */
const PULL_PAGE = 1000
/** Tarikan pertama di perangkat baru: transaksi sekian hari terakhir (+ semua bon yang belum lunas). */
const INITIAL_TX_DAYS = 31
const INITIAL_EXPENSE_DAYS = 62
const INITIAL_SHIFT_DAYS = 14

type Row = Record<string, unknown>

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: CORS_HEADERS })
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0)
const optNum = (v: unknown) => (v === undefined || v === null || v === '' ? null : num(v))
const str = (v: unknown) => (typeof v === 'string' && v !== '' ? v : null)
const ts = (v: unknown) => {
  if (typeof v !== 'string' || !v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}
const list = (v: unknown): Row[] =>
  Array.isArray(v) ? v.filter((x): x is Row => !!x && typeof x === 'object' && typeof (x as Row).id === 'string') : []
/** Buang properti bernilai null agar bentuk objek sama dengan data asli di kasir. */
const compact = (o: Row): Row => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined))

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

type Business = { id: string; pos_config: Row | null; pos_config_updated_at: string | null }

async function authenticate(
  request: Request
): Promise<{ supabase: SupabaseClient; business: Business } | { error: NextResponse }> {
  const token =
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() ||
    request.headers.get('x-api-key')?.trim()
  if (!token) return { error: json({ success: false, error: 'Token sync tidak ada' }, 401) }

  let supabase: SupabaseClient
  try {
    supabase = createAdminClient()
  } catch (e) {
    console.error(e)
    return { error: json({ success: false, error: 'Server belum dikonfigurasi (env Supabase)' }, 500) }
  }

  const { data: business, error } = await supabase
    .from('businesses')
    .select('id, pos_config, pos_config_updated_at')
    .eq('sync_token', token)
    .maybeSingle()
  if (error) {
    console.error('sync: lookup business', error)
    return { error: json({ success: false, error: 'Gagal memeriksa token' }, 500) }
  }
  if (!business) return { error: json({ success: false, error: 'Token sync tidak valid' }, 401) }
  return { supabase, business: business as Business }
}

/** Data master yang dibagi ke semua perangkat kasir dalam satu cabang. */
function parseConfig(v: unknown): Row | null {
  if (!v || typeof v !== 'object') return null
  const c = v as Row
  if (!Array.isArray(c.products) || !Array.isArray(c.categories) || !Array.isArray(c.cashiers)) return null
  if (c.cashiers.length === 0) return null
  if (!c.settings || typeof c.settings !== 'object') return null
  return { products: c.products, categories: c.categories, cashiers: c.cashiers, settings: c.settings }
}

/** Cerminan katalog untuk halaman Produk di dashboard: upsert semua, hapus yang sudah tidak ada. */
async function mirrorProducts(supabase: SupabaseClient, businessId: string, products: Row[], now: string) {
  if (!products.length) return
  const rows = products.map((p) => {
    // Gambar (bisa berupa data URL besar) tidak ikut disimpan.
    const raw = { ...p }
    delete raw.imageUrl
    return {
      business_id: businessId,
      id: p.id,
      name: str(p.name) ?? '(tanpa nama)',
      category_id: str(p.categoryId),
      price: num(p.price),
      cost_price: optNum(p.costPrice),
      stock: Math.trunc(num(p.stock)),
      is_available: p.isAvailable !== false,
      raw,
      synced_at: now,
    }
  })
  const { error } = await supabase.from('products').upsert(rows, { onConflict: 'business_id,id' })
  if (error) throw error
  const { error: delError } = await supabase
    .from('products')
    .delete()
    .eq('business_id', businessId)
    .lt('synced_at', now)
  if (delError) throw delError
}

/**
 * Draf pesanan (open bill / bayar nanti). Versi yang lebih baru (updatedAt) yang menang.
 * Gagal di sini (mis. tabel draft_orders belum dibuat) tidak menggagalkan sync transaksi;
 * kasir cukup mengirim ulang drafnya nanti.
 */
async function syncDrafts(
  supabase: SupabaseClient,
  businessId: string,
  drafts: Row[],
  deletedIds: string[],
  deviceCode: string | null,
  now: string
): Promise<boolean> {
  try {
    const deleted = new Set(deletedIds)
    const incoming = drafts.filter((d) => !deleted.has(d.id as string))
    if (incoming.length) {
      const { data: existing, error: readError } = await supabase
        .from('draft_orders')
        .select('id, updated_at')
        .eq('business_id', businessId)
        .in('id', incoming.map((d) => d.id as string))
      if (readError) throw readError
      const current = new Map((existing ?? []).map((r) => [r.id as string, ts(r.updated_at)]))
      const rows = incoming
        .map((d) => {
          const raw = { ...d }
          delete raw.isSynced
          delete raw.syncedAt
          return {
            business_id: businessId,
            id: d.id,
            label: str(d.label),
            updated_at: ts(d.updatedAt) ?? now,
            device_code: str(d.deviceCode) ?? deviceCode,
            raw,
            synced_at: now,
          }
        })
        .filter((r) => {
          const cur = current.get(r.id as string)
          return !cur || r.updated_at >= cur
        })
      if (rows.length) {
        const { error } = await supabase.from('draft_orders').upsert(rows, { onConflict: 'business_id,id' })
        if (error) throw error
      }
    }
    if (deletedIds.length) {
      const { error } = await supabase
        .from('draft_orders')
        .delete()
        .eq('business_id', businessId)
        .in('id', deletedIds)
      if (error) throw error
      const { error: tombError } = await supabase.from('deleted_records').upsert(
        deletedIds.map((id) => ({ business_id: businessId, kind: 'draft', id, deleted_at: now })),
        { onConflict: 'business_id,kind,id' }
      )
      if (tombError) throw tombError
    }
    return true
  } catch (e) {
    console.error('sync: drafts', e)
    return false
  }
}

/**
 * Upsert yang tetap jalan walau database belum dimigrasi: jika PostgREST menolak karena kolom
 * belum ada (PGRST204, mis. `edit_history` sebelum SQL terbaru dijalankan), kolom itu dibuang
 * lalu dicoba lagi, supaya satu kolom baru tidak memacetkan seluruh sync kasir.
 */
async function upsertTolerant(supabase: SupabaseClient, table: string, rows: Row[]) {
  let current = rows
  const dropped: string[] = []
  for (let attempt = 0; attempt < 5; attempt++) {
    const { error } = await supabase.from(table).upsert(current, { onConflict: 'business_id,id' })
    if (!error) {
      if (dropped.length) {
        console.warn(`sync: kolom ${dropped.join(', ')} belum ada di tabel ${table}; jalankan supabase/schema.sql terbaru`)
      }
      return
    }
    const missing = error.code === 'PGRST204' ? /'([^']+)' column/.exec(error.message)?.[1] : undefined
    if (!missing || dropped.includes(missing)) throw error
    dropped.push(missing)
    current = current.map((r) => {
      const copy = { ...r }
      delete copy[missing]
      return copy
    })
  }
  throw new Error(`Gagal menyimpan ke ${table}: terlalu banyak kolom yang belum dimigrasi`)
}

// ---------------------------------------------------------------------
// POST: kasir -> server
// ---------------------------------------------------------------------

export async function POST(request: Request) {
  const auth = await authenticate(request)
  if ('error' in auth) return auth.error
  const { supabase, business } = auth

  let body: Row
  try {
    body = await request.json()
  } catch {
    return json({ success: false, error: 'Body harus JSON' }, 400)
  }

  const businessId = business.id
  const deviceCode = str(body.deviceCode)
  const now = new Date().toISOString()

  const transactions = list(body.transactions)
  const expenses = list(body.expenses)
  const legacyProducts = list(body.products)
  const shifts = list(body.shifts)
  if (body.shift && typeof body.shift === 'object' && typeof (body.shift as Row).id === 'string') {
    shifts.push(body.shift as Row)
  }
  const deletedExpenseIds = Array.isArray(body.deletedExpenseIds)
    ? body.deletedExpenseIds.filter((x): x is string => typeof x === 'string')
    : []
  const drafts = list(body.drafts)
  const deletedDraftIds = Array.isArray(body.deletedDraftIds)
    ? body.deletedDraftIds.filter((x): x is string => typeof x === 'string')
    : []
  const config = parseConfig(body.config)
  // Jam perangkat bisa lebih cepat; jangan biarkan versi data master melampaui jam server.
  const editedAt = ts(body.configEditedAt)
  const configEditedAt = editedAt && editedAt > now ? now : editedAt

  if ([transactions, expenses, legacyProducts, shifts, deletedExpenseIds, drafts, deletedDraftIds].some((a) => a.length > MAX_ROWS)) {
    return json({ success: false, error: `Maksimal ${MAX_ROWS} baris per jenis data` }, 413)
  }

  try {
    if (transactions.length) {
      const rows = transactions.map((t) => ({
        business_id: businessId,
        id: t.id,
        created_at: ts(t.timestamp) ?? now,
        device_code: deviceCode,
        shift_id: str(t.shiftId),
        cashier_id: str(t.cashierId),
        cashier_name: str(t.cashierName),
        order_type: str(t.orderType),
        customer_name: str(t.customerName),
        customer_phone: str(t.customerPhone),
        items: Array.isArray(t.items) ? t.items : [],
        subtotal: num(t.subtotal),
        discount_amount: num(t.discountAmount),
        discount_reason: str(t.discountReason),
        tax_amount: num(t.taxAmount),
        grand_total: num(t.grandTotal),
        payment_type: str(t.paymentType),
        payment_detail: str(t.paymentDetail),
        amount_paid: num(t.amountPaid),
        change_amount: num(t.changeAmount),
        overpay_amount: num(t.overpayAmount),
        status: t.status === 'cancelled' ? 'cancelled' : 'completed',
        cancel_reason: str(t.cancelReason),
        cancelled_at: ts(t.cancelledAt),
        cancelled_by: str(t.cancelledBy),
        debt_status: str(t.debtStatus),
        debt_paid_at: ts(t.debtPaidAt),
        debt_paid_method: str(t.debtPaidMethod),
        debt_paid_shift_id: str(t.debtPaidShiftId),
        notes: str(t.notes),
        // Hanya dikirim bila ada koreksi, agar kasir tetap bisa sync walau kolom belum dimigrasi.
        ...(Array.isArray(t.editHistory) && t.editHistory.length ? { edit_history: t.editHistory } : {}),
        synced_at: now,
      }))
      await upsertTolerant(supabase, 'transactions', rows)
    }

    if (expenses.length) {
      const rows = expenses.map((e) => ({
        business_id: businessId,
        id: e.id,
        scope: e.scope === 'monthly' ? 'monthly' : 'daily',
        date: str(e.date) ?? now.slice(0, 10),
        category: str(e.category),
        amount: num(e.amount),
        note: str(e.note),
        from_drawer: e.fromDrawer === true,
        shift_id: str(e.shiftId),
        created_by: str(e.createdBy),
        created_at: ts(e.createdAt),
        synced_at: now,
      }))
      await upsertTolerant(supabase, 'expenses', rows)
    }

    if (deletedExpenseIds.length) {
      const { error } = await supabase
        .from('expenses')
        .delete()
        .eq('business_id', businessId)
        .in('id', deletedExpenseIds)
      if (error) throw error
      // Catat agar perangkat lain ikut menghapusnya saat menarik data.
      const { error: tombError } = await supabase.from('deleted_records').upsert(
        deletedExpenseIds.map((id) => ({ business_id: businessId, kind: 'expense', id, deleted_at: now })),
        { onConflict: 'business_id,kind,id' }
      )
      if (tombError) throw tombError
    }

    if (shifts.length) {
      const byId = new Map(shifts.map((s) => [s.id as string, s]))
      const rows = [...byId.values()].map((s) => ({
        business_id: businessId,
        id: s.id,
        cashier_id: str(s.cashierId),
        cashier_name: str(s.cashierName),
        start_time: ts(s.startTime),
        end_time: ts(s.endTime),
        starting_cash: num(s.startingCash),
        ending_cash_actual: optNum(s.endingCashActual),
        expected_cash: optNum(s.expectedCash),
        total_sales_cash: num(s.totalSalesCash),
        total_sales_non_cash: num(s.totalSalesNonCash),
        total_sales_debt: num(s.totalSalesDebt),
        expenses_cash: num(s.expensesCash),
        total_transactions: Math.trunc(num(s.totalTransactions)),
        status: str(s.status),
        raw: s,
        synced_at: now,
      }))
      await upsertTolerant(supabase, 'shifts', rows)
    }

    const draftsAccepted =
      drafts.length || deletedDraftIds.length
        ? await syncDrafts(supabase, businessId, drafts, deletedDraftIds, deviceCode, now)
        : true

    // Data master: yang terakhir diubah (berdasarkan waktu edit di perangkat) yang dipakai.
    let configAccepted = false
    let configUpdatedAt = business.pos_config_updated_at
    if (config && configEditedAt) {
      const current = business.pos_config_updated_at ? new Date(business.pos_config_updated_at).toISOString() : null
      if (!current || configEditedAt > current) {
        const { error } = await supabase
          .from('businesses')
          .update({ pos_config: config, pos_config_updated_at: configEditedAt })
          .eq('id', businessId)
        if (error) throw error
        await mirrorProducts(supabase, businessId, list(config.products), now)
        configAccepted = true
        configUpdatedAt = configEditedAt
      }
    } else if (legacyProducts.length && !business.pos_config) {
      // Kasir versi lama (belum kirim data master): pertahankan perilaku lama.
      await mirrorProducts(supabase, businessId, legacyProducts, now)
    }

    await supabase
      .from('businesses')
      .update({ last_synced_at: now, last_device_code: deviceCode })
      .eq('id', businessId)

    return json({
      success: true,
      data: {
        transactions: transactions.length,
        expenses: expenses.length,
        deletedExpenses: deletedExpenseIds.length,
        shifts: shifts.length,
        draftsAccepted,
        configAccepted,
        configUpdatedAt: configUpdatedAt ? new Date(configUpdatedAt).toISOString() : null,
      },
    })
  } catch (error) {
    console.error('sync error', error)
    const message =
      error && typeof error === 'object' && 'message' in error ? String(error.message) : 'Internal error'
    return json({ success: false, error: message }, 500)
  }
}

// ---------------------------------------------------------------------
// GET: server -> kasir
// ---------------------------------------------------------------------

function rowToTransaction(r: Row): Row {
  return compact({
    id: r.id,
    timestamp: ts(r.created_at),
    cashierId: r.cashier_id ?? '',
    cashierName: r.cashier_name ?? '',
    orderType: r.order_type ?? 'Dine In',
    customerName: r.customer_name,
    customerPhone: r.customer_phone,
    items: Array.isArray(r.items) ? r.items : [],
    subtotal: num(r.subtotal),
    discountAmount: num(r.discount_amount),
    discountReason: r.discount_reason,
    taxAmount: num(r.tax_amount),
    grandTotal: num(r.grand_total),
    paymentType: r.payment_type ?? 'tunai',
    paymentDetail: r.payment_detail,
    amountPaid: num(r.amount_paid),
    changeAmount: num(r.change_amount),
    overpayAmount: num(r.overpay_amount) || null,
    status: r.status === 'cancelled' ? 'cancelled' : 'completed',
    shiftId: r.shift_id,
    cancelReason: r.cancel_reason,
    cancelledAt: ts(r.cancelled_at),
    cancelledBy: r.cancelled_by,
    debtStatus: r.debt_status,
    debtPaidAt: ts(r.debt_paid_at),
    debtPaidMethod: r.debt_paid_method,
    debtPaidShiftId: r.debt_paid_shift_id,
    notes: r.notes,
    editHistory: Array.isArray(r.edit_history) && r.edit_history.length ? r.edit_history : null,
    deviceCode: r.device_code,
  })
}

function rowToExpense(r: Row): Row {
  return compact({
    id: r.id,
    scope: r.scope === 'monthly' ? 'monthly' : 'daily',
    date: r.date,
    category: r.category ?? '',
    amount: num(r.amount),
    note: r.note,
    fromDrawer: r.from_drawer === true,
    shiftId: r.shift_id,
    createdBy: r.created_by ?? '',
    createdAt: ts(r.created_at) ?? ts(r.synced_at),
  })
}

type Page = { rows: Row[]; next: string | null; more: boolean }

/** Ambil satu halaman baris yang synced_at >= cursor, urut naik. */
async function fetchPage(
  supabase: SupabaseClient,
  table: string,
  businessId: string,
  cursor: string | null,
  timeCol: string,
  extra?: (q: any) => any // eslint-disable-line @typescript-eslint/no-explicit-any
): Promise<Page> {
  let q = supabase.from(table).select('*').eq('business_id', businessId)
  if (cursor) q = q.gte(timeCol, cursor)
  if (extra) q = extra(q)
  const { data, error } = await q.order(timeCol, { ascending: true }).limit(PULL_PAGE)
  if (error) throw error
  const rows = (data ?? []) as Row[]
  const last = rows.length ? ts(rows[rows.length - 1][timeCol]) : null
  return { rows, next: last ?? cursor, more: rows.length === PULL_PAGE }
}

/**
 * Query string:
 *   tx, exp, shift, del  = cursor per jenis data (ISO). Kosong = tarikan pertama.
 *   init=1               = masih tarikan pertama (bisa beberapa halaman): batasi ke data terbaru.
 *   config               = versi data master yang sudah ada di perangkat.
 */
export async function GET(request: Request) {
  const auth = await authenticate(request)
  if ('error' in auth) return auth.error
  const { supabase, business } = auth
  const businessId = business.id

  const params = new URL(request.url).searchParams
  const cur = (k: string) => ts(params.get(k))
  const serverTime = new Date().toISOString()
  const daysAgo = (d: number) => new Date(Date.now() - d * 86400000).toISOString()

  try {
    const txCursor = cur('tx')
    const expCursor = cur('exp')
    const shiftCursor = cur('shift')
    const delCursor = cur('del')
    const draftCursor = cur('draft')
    const init = params.get('init') === '1' || !txCursor

    const [tx, exp, shift, del, draft] = await Promise.all([
      fetchPage(supabase, 'transactions', businessId, txCursor, 'synced_at', (q) =>
        init
          ? q.or(`created_at.gte."${daysAgo(INITIAL_TX_DAYS)}",and(payment_type.eq.hutang,debt_status.eq.unpaid)`)
          : q
      ),
      fetchPage(supabase, 'expenses', businessId, expCursor, 'synced_at', (q) =>
        !init ? q : q.gte('date', daysAgo(INITIAL_EXPENSE_DAYS).slice(0, 7))
      ),
      fetchPage(supabase, 'shifts', businessId, shiftCursor, 'synced_at', (q) =>
        !init ? q : q.gte('start_time', daysAgo(INITIAL_SHIFT_DAYS))
      ),
      // Perangkat baru tidak perlu riwayat hapus lama: mulai dari sekarang.
      delCursor
        ? fetchPage(supabase, 'deleted_records', businessId, delCursor, 'deleted_at')
        : Promise.resolve<Page>({ rows: [], next: serverTime, more: false }),
      // Draf: semua draf yang masih terbuka (jumlahnya sedikit). Tabel belum ada -> kosong saja.
      fetchPage(supabase, 'draft_orders', businessId, draftCursor, 'synced_at').catch((e) => {
        console.error('sync pull: drafts', e)
        return { rows: [], next: draftCursor, more: false } as Page
      }),
    ])

    const configUpdatedAt = business.pos_config_updated_at
      ? new Date(business.pos_config_updated_at).toISOString()
      : null
    const knownConfig = cur('config')
    const sendConfig = !!business.pos_config && configUpdatedAt !== knownConfig

    return json({
      success: true,
      serverTime,
      configUpdatedAt,
      config: sendConfig ? business.pos_config : null,
      transactions: tx.rows.map(rowToTransaction),
      expenses: exp.rows.map(rowToExpense),
      shifts: shift.rows.map((r) => (r.raw && typeof r.raw === 'object' ? r.raw : { id: r.id })),
      deletedExpenseIds: del.rows.filter((r) => r.kind === 'expense').map((r) => r.id),
      drafts: draft.rows.map((r) => (r.raw && typeof r.raw === 'object' ? r.raw : null)).filter(Boolean),
      deletedDraftIds: del.rows.filter((r) => r.kind === 'draft').map((r) => r.id),
      // Cursor kosong (tidak ada data) diisi serverTime agar tarikan berikutnya tidak mengulang dari awal.
      cursors: {
        tx: tx.next ?? serverTime,
        exp: exp.next ?? serverTime,
        shift: shift.next ?? serverTime,
        del: del.next ?? serverTime,
        draft: draft.next ?? serverTime,
      },
      hasMore: tx.more || exp.more || shift.more || del.more || draft.more,
    })
  } catch (error) {
    console.error('sync pull error', error)
    const message =
      error && typeof error === 'object' && 'message' in error ? String(error.message) : 'Internal error'
    return json({ success: false, error: message }, 500)
  }
}
