import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'

// Sama dengan region database Supabase (Sydney); lihat src/app/layout.tsx.
export const preferredRegion = 'syd1'

/**
 * Endpoint sinkronisasi dari aplikasi kasir (app-kasir).
 * Payload: lihat app-kasir/src/lib/storage.ts -> doCloudSync().
 * Auth: header `Authorization: Bearer <sync_token>` atau `x-api-key: <sync_token>`,
 * token diambil dari halaman Cabang Usaha di dashboard.
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key',
  'Access-Control-Max-Age': '86400',
}

const MAX_ROWS = 5000

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

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function POST(request: Request) {
  const token =
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() ||
    request.headers.get('x-api-key')?.trim()
  if (!token) return json({ success: false, error: 'Token sync tidak ada' }, 401)

  let body: Row
  try {
    body = await request.json()
  } catch {
    return json({ success: false, error: 'Body harus JSON' }, 400)
  }

  let supabase
  try {
    supabase = createAdminClient()
  } catch (e) {
    console.error(e)
    return json({ success: false, error: 'Server belum dikonfigurasi (env Supabase)' }, 500)
  }

  const { data: business, error: bizError } = await supabase
    .from('businesses')
    .select('id')
    .eq('sync_token', token)
    .maybeSingle()
  if (bizError) {
    console.error('sync: lookup business', bizError)
    return json({ success: false, error: 'Gagal memeriksa token' }, 500)
  }
  if (!business) return json({ success: false, error: 'Token sync tidak valid' }, 401)

  const businessId = business.id as string
  const deviceCode = str(body.deviceCode)
  const now = new Date().toISOString()

  const transactions = list(body.transactions)
  const expenses = list(body.expenses)
  const products = list(body.products)
  const shifts = list(body.shifts)
  if (body.shift && typeof body.shift === 'object' && typeof (body.shift as Row).id === 'string') {
    shifts.push(body.shift as Row)
  }
  const deletedExpenseIds = Array.isArray(body.deletedExpenseIds)
    ? body.deletedExpenseIds.filter((x): x is string => typeof x === 'string')
    : []

  if ([transactions, expenses, products, shifts, deletedExpenseIds].some((a) => a.length > MAX_ROWS)) {
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
        notes: str(t.notes),
        synced_at: now,
      }))
      const { error } = await supabase.from('transactions').upsert(rows, { onConflict: 'business_id,id' })
      if (error) throw error
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
      const { error } = await supabase.from('expenses').upsert(rows, { onConflict: 'business_id,id' })
      if (error) throw error
    }

    if (deletedExpenseIds.length) {
      const { error } = await supabase
        .from('expenses')
        .delete()
        .eq('business_id', businessId)
        .in('id', deletedExpenseIds)
      if (error) throw error
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
      const { error } = await supabase.from('shifts').upsert(rows, { onConflict: 'business_id,id' })
      if (error) throw error
    }

    // Katalog produk dikirim lengkap: upsert semua, lalu hapus yang sudah tidak ada di kasir.
    if (products.length) {
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
        products: products.length,
        shifts: shifts.length,
      },
    })
  } catch (error) {
    console.error('sync error', error)
    const message =
      error && typeof error === 'object' && 'message' in error ? String(error.message) : 'Internal error'
    return json({ success: false, error: message }, 500)
  }
}
