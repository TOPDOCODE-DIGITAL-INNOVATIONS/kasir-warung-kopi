'use server'

import { assertWritable } from '@/lib/billing/owner-billing'

import { revalidatePath } from 'next/cache'
import { unstable_rethrow } from 'next/navigation'
import { getBusinessContext } from '@/lib/business-context'
import { dayKey } from '@/lib/format'
import { uuid } from '../products/domain'
import type { HistoryCursor, Supplier, SupplierHistory, SupplierTransaction } from './types'

const supplierColumns = 'id,code,name,contact_name,email,phone,address,notes,is_active,updated_at'
const historyPageSize = 20

export async function getSuppliers(): Promise<Supplier[]> {
  const { supabase, user } = await getBusinessContext()
  const suppliers: Supplier[] = []
  for (let from = 0; ; from += 500) {
    const { data, error } = await supabase.from('suppliers').select(supplierColumns)
      .eq('owner_id', user.id).order('is_active', { ascending: false }).order('name').order('id').range(from, from + 499)
    if (error) throw new Error('Daftar supplier belum berhasil dimuat.')
    suppliers.push(...data)
    if (data.length < 500) return suppliers
  }
}

function optionalText(form: FormData, key: string, label: string, limit: number) {
  const raw = form.get(key)
  if (raw !== null && (typeof raw !== 'string' || raw.length > limit)) {
    throw new Error(`${label} maksimal ${limit} karakter.`)
  }
  return raw?.trim() || null
}

function supplierVersion(form: FormData) {
  const version = String(form.get('version') ?? '')
  if (!Number.isFinite(Date.parse(version))) throw new Error('Versi supplier tidak valid. Muat ulang halaman.')
  return version
}

function refreshSuppliers() {
  revalidatePath('/dashboard/suppliers')
  revalidatePath('/dashboard/expenses')
  revalidatePath('/dashboard/products')
}

export async function saveSupplier(form: FormData) {
  try {
    await assertWritable()
    const { supabase, user } = await getBusinessContext()
    const id = String(form.get('id') ?? '')
    if (id && !uuid(id)) throw new Error('Supplier tidak valid.')
    const name = optionalText(form, 'name', 'Nama supplier', 150)
    if (!name) throw new Error('Nama supplier wajib diisi.')
    const email = optionalText(form, 'email', 'Email', 254)
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Email supplier tidak valid.')
    const fields = {
      name,
      email,
      code: optionalText(form, 'code', 'Kode supplier', 50),
      contact_name: optionalText(form, 'contact_name', 'Nama kontak', 150),
      phone: optionalText(form, 'phone', 'Telepon', 50),
      address: optionalText(form, 'address', 'Alamat', 500),
      notes: optionalText(form, 'notes', 'Catatan', 1000),
    }

    const query = id
      ? supabase.from('suppliers').update(fields).eq('owner_id', user.id).eq('id', id).eq('updated_at', supplierVersion(form))
      : supabase.from('suppliers').insert({ ...fields, owner_id: user.id })
    const { data, error } = await query.select('id').maybeSingle()
    if (error?.code === '23505') throw new Error('Kode supplier sudah digunakan.')
    if (error) throw new Error('Supplier belum berhasil disimpan. Silakan coba kembali.')
    if (!data) throw new Error('Supplier sudah berubah atau tidak tersedia. Muat ulang halaman.')
    refreshSuppliers()
    return { success: true, message: id ? 'Supplier berhasil diperbarui.' : 'Supplier berhasil ditambahkan.' }
  } catch (error) {
    unstable_rethrow(error)
    return { success: false, message: error instanceof Error ? error.message : 'Supplier belum berhasil disimpan.' }
  }
}

export async function setSupplierStatus(form: FormData) {
  try {
    await assertWritable()
    const { supabase, user } = await getBusinessContext()
    const id = String(form.get('id') ?? ''), status = form.get('status')
    if (!uuid(id) || (status !== 'active' && status !== 'inactive')) throw new Error('Status supplier tidak valid.')
    const active = status === 'active'
    const { data, error } = await supabase.from('suppliers').update({ is_active: active })
      .eq('owner_id', user.id).eq('id', id).eq('updated_at', supplierVersion(form)).select('id').maybeSingle()
    if (error || !data) throw new Error('Status belum berhasil diubah. Muat ulang halaman dan coba kembali.')
    refreshSuppliers()
    return { success: true, message: active ? 'Supplier diaktifkan kembali.' : 'Supplier dinonaktifkan.' }
  } catch (error) {
    unstable_rethrow(error)
    return { success: false, message: error instanceof Error ? error.message : 'Status supplier belum berhasil diubah.' }
  }
}

export async function getSupplierHistory(id: string, cursor: HistoryCursor = { purchases: 0, expenses: 0 }): Promise<SupplierHistory> {
  try {
    const { supabase, user, businesses } = await getBusinessContext()
    if (!uuid(id) || !cursor || ![cursor.purchases, cursor.expenses].every(n => Number.isSafeInteger(n) && n >= 0 && n <= 2147483600)) {
      throw new Error('Permintaan riwayat supplier tidak valid.')
    }
    const supplier = await supabase.from('suppliers').select('id').eq('owner_id', user.id).eq('id', id).maybeSingle()
    if (supplier.error || !supplier.data) throw new Error('Supplier tidak tersedia.')
    const [purchases, expenses] = await Promise.all([
      supabase.from('purchases').select('id,business_id,purchased_at,document_number,grand_total,currency_code,purchase_lines(product_name,quantity,unit_code,sort_order)')
        .eq('owner_id', user.id).eq('supplier_id', id).eq('status', 'posted')
        .order('purchased_at', { ascending: false }).order('id').range(cursor.purchases, cursor.purchases + historyPageSize),
      supabase.from('expenses').select('id,business_id,date,scope,category,product_name,note,amount,businesses!expenses_business_id_fkey!inner(owner_id)')
        .eq('businesses.owner_id', user.id).eq('supplier_id', id).is('purchase_line_id', null)
        .order('date', { ascending: false }).order('business_id').order('id').range(cursor.expenses, cursor.expenses + historyPageSize),
    ])
    if (purchases.error || expenses.error) throw new Error('Riwayat transaksi belum berhasil dimuat.')

    const branchNames = new Map(businesses.map(branch => [branch.id, branch.name]))
    const transactions: SupplierTransaction[] = [
      ...purchases.data.map(purchase => ({
        id: `purchase:${purchase.id}`, kind: 'purchase' as const, date: dayKey(purchase.purchased_at), monthly: false,
        business: branchNames.get(purchase.business_id) ?? 'Cabang',
        label: [...(purchase.purchase_lines ?? [])].sort((a, b) => a.sort_order - b.sort_order)
          .map(line => `${line.product_name} ${Number(line.quantity).toLocaleString('id-ID', { maximumFractionDigits: 6 })} ${line.unit_code === 'l' ? 'L' : line.unit_code}`).join(', ') || 'Pembelian produk',
        // Auto-generated numbers (EXP-<uuid>) mean nothing to the owner; show only real document numbers.
        reference: purchase.document_number?.startsWith('EXP-') ? null : purchase.document_number, amount: Number(purchase.grand_total), currency: purchase.currency_code,
      })),
      // The corresponding expenses for posted purchases are already represented by the document.
      ...expenses.data.map(expense => ({
        id: `expense:${expense.business_id}:${expense.id}`, kind: 'expense' as const,
        date: expense.scope === 'monthly' ? `${expense.date}-01` : expense.date, monthly: expense.scope === 'monthly',
        business: branchNames.get(expense.business_id) ?? 'Cabang', label: expense.product_name || expense.note || expense.category,
        reference: null, amount: Number(expense.amount), currency: 'IDR',
      })),
    ]

    // Stable sorting keeps each source in database order within the same date.
    const rows = transactions.sort((a, b) => b.date.localeCompare(a.date)).slice(0, historyPageSize)
    const purchaseCount = rows.filter(row => row.kind === 'purchase').length
    const next = transactions.length > historyPageSize
      ? { purchases: cursor.purchases + purchaseCount, expenses: cursor.expenses + rows.length - purchaseCount }
      : null
    return { rows, next }
  } catch (error) {
    unstable_rethrow(error)
    return { rows: [], next: null, error: error instanceof Error ? error.message : 'Riwayat transaksi belum berhasil dimuat.' }
  }
}
