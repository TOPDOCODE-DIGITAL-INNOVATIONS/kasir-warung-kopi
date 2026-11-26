'use server'

import { assertWritable } from '@/lib/billing/owner-billing'

import { revalidatePath } from 'next/cache'
import { unstable_rethrow } from 'next/navigation'
import { requireBusinessContext } from '@/lib/business-context'
import { createAdminClient } from '@/utils/supabase/admin'
import type { ExpenseOptions, ExpenseProductSearch } from './types'
import { financialChange, validateExpense } from './edit-domain'

async function expenseWriter({ supabase, user, businessId }: Awaited<ReturnType<typeof requireBusinessContext>>) {
  // Owner RLS is read-only. Use the existing branch-token policy only after
  // verifying ownership with the authenticated session; never expose the token.
  const { data: branch, error } = await supabase.from('businesses').select('sync_token')
    .eq('id', businessId).eq('owner_id', user.id).maybeSingle()
  if (error || !branch?.sync_token) throw new Error('Tidak dapat memverifikasi kepemilikan cabang.')
  return createAdminClient(branch.sync_token)
}

export async function deleteExpense(form: FormData) {
  try {
    await assertWritable()
    const business = String(form.get('business_id') ?? ''), id = String(form.get('id') ?? '')
    const context = await requireBusinessContext(business)
    if (!id || id.length > 200) throw new Error('Pengeluaran tidak valid.')
    const { data: previous, error: readError } = await context.supabase.from('expenses')
      .select('synced_at,purchase_line_id,salary_payment_id').eq('business_id', business).eq('id', id).maybeSingle()
    if (readError) throw new Error('Pengeluaran belum dapat dimuat. Coba kembali.')
    if (!previous) return { success: true, message: 'Pengeluaran sudah tidak ada di cabang aktif.' }
    if (previous.purchase_line_id) throw new Error('Pengeluaran terkait pembelian/stok tidak dapat dihapus dari sini.')
    if (previous.salary_payment_id) throw new Error('Pengeluaran gaji dibatalkan dari halaman Gaji Pegawai.')
    if (previous.synced_at !== String(form.get('version') ?? '')) throw new Error('Pengeluaran sudah berubah. Muat ulang halaman sebelum menghapus.')
    const writer = await expenseWriter(context), deletedAt = new Date().toISOString()
    // Record the deletion before removing the row, so a disconnected POS can
    // learn about it. Revert only our marker if the versioned delete fails.
    const { error: markerError } = await writer.from('deleted_records').upsert({ business_id: business, kind: 'expense', id, deleted_at: deletedAt }, { onConflict: 'business_id,kind,id' })
    if (markerError) throw new Error('Penghapusan belum berhasil dicatat. Silakan coba kembali.')
    const { data, error } = await writer.from('expenses').delete().eq('business_id', business).eq('id', id).eq('synced_at', previous.synced_at).select('id')
    if (error || !data?.length) {
      await writer.from('deleted_records').delete().eq('business_id', business).eq('kind', 'expense').eq('id', id).eq('deleted_at', deletedAt)
      throw new Error('Pengeluaran belum terhapus atau sudah berubah. Muat ulang halaman dan coba kembali.')
    }
    for (const path of ['/dashboard/expenses', '/dashboard/recap', '/dashboard']) revalidatePath(path)
    return { success: true, message: 'Pengeluaran berhasil dihapus.' }
  } catch (error) {
    unstable_rethrow(error)
    return { success: false, message: error instanceof Error ? error.message : 'Pengeluaran belum berhasil dihapus.' }
  }
}

export async function updateExpense(form: FormData) {
  try {
    await assertWritable()
    const business = String(form.get('business_id') ?? ''), id = String(form.get('id') ?? '')
    const context = await requireBusinessContext(business), { supabase } = context
    if (!id || id.length > 200) throw new Error('Pengeluaran tidak valid.')
    const fields = validateExpense(Object.fromEntries(['scope', 'date', 'category', 'amount', 'note'].map(key => [key, form.get(key)])))
    const { data: previous, error: readError } = await supabase.from('expenses')
      .select('scope,date,amount,category,synced_at,from_drawer,purchase_line_id,salary_payment_id').eq('business_id', business).eq('id', id).maybeSingle()
    if (readError) throw new Error('Pengeluaran belum dapat dimuat. Coba kembali.')
    if (!previous) throw new Error('Pengeluaran tidak ditemukan di cabang aktif.')
    if (previous.synced_at !== String(form.get('version') ?? '')) throw new Error('Pengeluaran sudah berubah. Muat ulang halaman dan buka kembali form edit.')
    if (previous.salary_payment_id && (financialChange(previous, fields) || previous.category !== fields.category)) throw new Error('Pengeluaran gaji: hanya catatan yang dapat diedit. Ubah nominal atau periode dari halaman Gaji Pegawai.')
    if ((previous.purchase_line_id || previous.from_drawer) && financialChange(previous, fields)) throw new Error(previous.purchase_line_id
      ? 'Pengeluaran terkait pembelian: hanya kategori dan catatan yang dapat diedit.'
      : 'Koreksi nominal dari laci dilakukan di aplikasi kasir pada shift asal yang masih aktif.')
    const writer = await expenseWriter(context)
    const { data, error } = await writer.from('expenses').update({ ...fields, note: fields.note || null, synced_at: new Date().toISOString() })
      .eq('business_id', business).eq('id', id).eq('synced_at', previous.synced_at).select('id')
    if (error) throw new Error('Pengeluaran belum berhasil diperbarui.')
    if (!data?.length) throw new Error('Pengeluaran sudah berubah. Muat ulang halaman dan coba kembali.')
    for (const path of ['/dashboard/expenses', '/dashboard/recap', '/dashboard']) revalidatePath(path)
    return { success: true, message: 'Pengeluaran berhasil diperbarui.' }
  } catch (error) {
    unstable_rethrow(error)
    return { success: false, message: error instanceof Error ? error.message : 'Pengeluaran belum berhasil diperbarui.' }
  }
}

/** Correction for a wrong stock purchase: cancel the whole purchase document, then record it again. */
export async function cancelExpensePurchase(form: FormData) {
  try {
    await assertWritable()
    const business = String(form.get('business_id') ?? ''), line = String(form.get('purchase_line_id') ?? ''), reason = String(form.get('reason') ?? '').trim()
    const { supabase } = await requireBusinessContext(business)
    if (!reason || reason.length > 300) throw new Error('Alasan koreksi wajib diisi, maksimal 300 karakter.')
    const { data: purchaseLine, error: readError } = await supabase.from('purchase_lines').select('purchase_id')
      .eq('business_id', business).eq('id', line).maybeSingle()
    if (readError) throw new Error('Dokumen pembelian belum dapat dimuat. Coba kembali.')
    if (!purchaseLine) throw new Error('Pembelian tidak ditemukan atau sudah dikoreksi. Muat ulang halaman.')
    const { error } = await supabase.rpc('admin_cancel_purchase', { p_business: business, p_purchase: purchaseLine.purchase_id, p_reason: reason })
    if (error) throw new Error(error.message)
    for (const path of ['/dashboard/expenses', '/dashboard/products', '/dashboard/suppliers', '/dashboard/recap', '/dashboard']) revalidatePath(path)
    return { success: true, message: 'Pembelian dibatalkan sebagai koreksi. Stok dan HPP sudah disesuaikan; silakan catat ulang pembelian yang benar.' }
  } catch (error) {
    unstable_rethrow(error)
    return { success: false, message: error instanceof Error ? error.message : 'Koreksi pembelian belum berhasil.' }
  }
}

export async function getExpenseOptions(expectedBusiness: string): Promise<ExpenseOptions> {
  const { supabase, user } = await requireBusinessContext(expectedBusiness)
  const suppliers: ExpenseOptions['suppliers'] = []
  for (let from = 0; ; from += 500) {
    const { data, error } = await supabase.from('suppliers').select('id,name').eq('owner_id', user.id)
      .eq('is_active', true).order('id').range(from, from + 499)
    if (error) throw new Error('Gagal memuat pilihan pengeluaran. Coba buka kembali form.')
    suppliers.push(...(data ?? []))
    if (!data || data.length < 500) break
  }
  return { suppliers: suppliers.sort((a,b) => a.name.localeCompare(b.name, 'id')) }
}

export async function searchExpenseProducts(expectedBusiness: string, search: string): Promise<ExpenseProductSearch> {
  try {
    const { supabase, businessId, user } = await requireBusinessContext(expectedBusiness)
    if (typeof search !== 'string' || search.length > 200) throw new Error('Pencarian produk maksimal 200 karakter.')
    let query = supabase.from('products').select('inventory_id,name,stock,updated_at,base_unit:units!products_base_unit_id_fkey(code)')
      .eq('owner_id', user.id).eq('business_id', businessId).eq('is_active', true).eq('can_buy', true)
      .order('name').order('inventory_id').limit(21)
    const term = search.trim()
    if (term) query = query.ilike('name', `%${term.replace(/[\\%_]/g, '\\$&')}%`)
    const { data, error } = await query
    if (error) throw new Error('Produk belum berhasil dimuat. Silakan coba kembali.')
    const products = (data ?? []).slice(0, 20)
    if (!products.length) return { products: [], hasMore: false }
    // Batch units of these 20 results; paginate by rows, never query per product.
    const units: { id: string; product_id: string; label: string; factor_to_base: number }[] = []
    for (let from = 0; ; from += 500) {
      const { data, error } = await supabase.from('item_units').select('id,product_id,label,factor_to_base')
        .eq('owner_id', user.id).eq('is_active', true).in('product_id', products.map(p => p.inventory_id))
        .order('id').range(from, from + 499)
      if (error) throw new Error('Satuan produk belum berhasil dimuat. Silakan coba kembali.')
      units.push(...(data ?? []))
      if (!data || data.length < 500) break
    }
    return { hasMore: (data?.length ?? 0) > 20, products: products.map(p => ({
      id: String(p.inventory_id), name: String(p.name), stock: Number(p.stock), version: String(p.updated_at),
      unitCode: String((p.base_unit as { code?: string } | null)?.code ?? 'pcs'),
      units: units.filter(u => u.product_id === p.inventory_id).map(u => ({ id: String(u.id), label: String(u.label), factor: Number(u.factor_to_base) })),
    })) }
  } catch (error) {
    unstable_rethrow(error)
    return { products: [], hasMore: false, error: error instanceof Error ? error.message : 'Produk belum berhasil dimuat.' }
  }
}

export async function saveExpenseBatch(form: FormData) {
  try {
    await assertWritable()
    const businessId = String(form.get('business_id') ?? '')
    const { supabase } = await requireBusinessContext(businessId)
    const { error } = await supabase.rpc('admin_record_expenses', {
      p_business: businessId, p_operation: String(form.get('operation_id') ?? ''),
      p_date: String(form.get('date') ?? ''), p_scope: String(form.get('scope') ?? ''),
      p_lines: JSON.parse(String(form.get('lines') ?? '[]')), p_supplier: String(form.get('supplier_id') ?? '') || null,
    })
    if (error) throw new Error(error.message)
    for (const path of ['/dashboard/expenses', '/dashboard/products', '/dashboard/recap', '/dashboard']) revalidatePath(path)
    return { success: true, message: 'Pengeluaran berhasil disimpan.' }
  } catch (error) {
    unstable_rethrow(error)
    return { success: false, message: error instanceof Error ? error.message : 'Pengeluaran belum berhasil disimpan.' }
  }
}
