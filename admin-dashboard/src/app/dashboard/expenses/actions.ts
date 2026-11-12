'use server'

import { revalidatePath } from 'next/cache'
import { unstable_rethrow } from 'next/navigation'
import { requireBusinessContext } from '@/lib/business-context'
import type { ExpenseOptions } from './types'

export async function getExpenseOptions(expectedBusiness: string): Promise<ExpenseOptions> {
  const { supabase, businessId, user } = await requireBusinessContext(expectedBusiness)
  async function rows(table: string, columns: string, product = false) {
    const result: Record<string, unknown>[] = []
    for (let from = 0; ; from += 500) {
      let query = supabase.from(table).select(columns).eq('owner_id', user.id).eq('is_active', true).order('id').range(from, from + 499)
      if (product) query = query.eq('business_id', businessId).eq('can_buy', true)
      if (table === 'item_units') query = query.eq('products.business_id', businessId)
      const { data, error } = await query
      if (error) throw new Error('Gagal memuat pilihan pengeluaran. Coba buka kembali form.')
      result.push(...(data ?? []) as unknown as Record<string, unknown>[])
      if (!data || data.length < 500) return result
    }
  }
  const [products, units, suppliers] = await Promise.all([
    rows('products', 'id,inventory_id,name,stock,updated_at,base_unit:units!products_base_unit_id_fkey(code)', true),
    rows('item_units', 'id,product_id,label,factor_to_base,products!inner(business_id)'),
    rows('suppliers', 'id,name'),
  ])
  return {
    products: products.map(p => ({ id: String(p.inventory_id), name: String(p.name), stock: Number(p.stock), version: String(p.updated_at), unitCode: String((p.base_unit as { code?: string } | null)?.code ?? 'pcs') })).sort((a,b) => a.name.localeCompare(b.name, 'id')),
    units: units.map(u => ({ id: String(u.id), productId: String(u.product_id), label: String(u.label), factor: Number(u.factor_to_base) })),
    suppliers: suppliers.map(s => ({ id: String(s.id), name: String(s.name) })).sort((a,b) => a.name.localeCompare(b.name, 'id')),
  }
}

export async function saveExpenseBatch(form: FormData) {
  try {
    const businessId = String(form.get('business_id') ?? '')
    const { supabase } = await requireBusinessContext(businessId)
    const { error } = await supabase.rpc('admin_record_expenses', {
      p_business: businessId, p_operation: String(form.get('operation_id') ?? ''),
      p_date: String(form.get('date') ?? ''), p_scope: String(form.get('scope') ?? ''),
      p_lines: JSON.parse(String(form.get('lines') ?? '[]')), p_supplier: String(form.get('supplier_id') ?? '') || null,
    })
    if (error) throw new Error(error.message)
    for (const path of ['/dashboard/expenses', '/dashboard/products', '/dashboard/recap', '/dashboard']) revalidatePath(path)
    return { success: true, message: 'Pengeluaran berhasil disimpan. Barang dengan pelacakan stok telah ditambahkan.' }
  } catch (error) {
    unstable_rethrow(error)
    return { success: false, message: error instanceof Error ? error.message : 'Pengeluaran belum berhasil disimpan.' }
  }
}
