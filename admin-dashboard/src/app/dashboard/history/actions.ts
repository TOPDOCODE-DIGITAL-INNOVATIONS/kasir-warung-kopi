'use server'

import { revalidatePath } from 'next/cache'
import { requireBusinessContext } from '@/lib/business-context'
import { parseMoney } from '@/lib/money'

function parseAmount(v: FormDataEntryValue | null): number {
  // Terima "7.419.797,28", "7,419,797.28", "1250000"
  const n = parseMoney(String(v ?? ''))
  if (!Number.isFinite(n) || n < 0) throw new Error('Nominal tidak valid')
  return n
}

/** Simpan rekap; tanggal yang sama untuk cabang & jenis yang sama akan ditimpa (tidak dobel). */
export async function saveSummary(formData: FormData) {
  const businessId = String(formData.get('business_id') ?? '')
  const period = String(formData.get('period') ?? '')
  const date = String(formData.get('date') ?? '')
  const note = String(formData.get('note') ?? '').trim() || null

  if (!businessId) throw new Error('Pilih cabang')
  if (period === 'day' ? !/^\d{4}-\d{2}-\d{2}$/.test(date) : period === 'month' ? !/^\d{4}-\d{2}$/.test(date) : true) {
    throw new Error(period === 'month' ? 'Pilih bulan' : 'Pilih tanggal')
  }

  const sales = parseAmount(formData.get('sales'))
  const expenses = parseAmount(formData.get('expenses'))
  const overpay = parseAmount(formData.get('overpay'))
  if (sales === 0 && expenses === 0 && overpay === 0) throw new Error('Isi total penjualan atau pengeluaran')

  const { supabase } = await requireBusinessContext(businessId)
  const { error } = await supabase
    .from('manual_summaries')
    .upsert(
      { business_id: businessId, period, date, sales, expenses, overpay, note, updated_at: new Date().toISOString() },
      { onConflict: 'business_id,period,date' }
    )
  if (error) throw new Error(error.message)
  revalidatePath('/dashboard', 'layout')
}

export async function deleteSummary(id: string) {
  const { supabase, businessId } = await requireBusinessContext()
  const { error } = await supabase.from('manual_summaries').delete().eq('id', id).eq('business_id', businessId)
  if (error) throw new Error(error.message)
  revalidatePath('/dashboard', 'layout')
}

/** Tambah/ubah aturan periode buku. Tanggal berlaku yang sama akan ditimpa. */
export async function saveBookRule(formData: FormData) {
  const businessId = String(formData.get('business_id') ?? '')
  const startDay = Number(formData.get('start_day'))
  const from = String(formData.get('effective_from') ?? '').trim()

  if (!businessId) throw new Error('Pilih cabang')
  if (!Number.isInteger(startDay) || startDay < 1 || startDay > 28) {
    throw new Error('Tanggal buka buku harus 1–28 (untuk tutup buku di akhir bulan pilih tanggal 1)')
  }
  if (from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) throw new Error('Tanggal berlaku tidak valid')

  const { supabase } = await requireBusinessContext(businessId)
  const { error } = await supabase
    .from('book_period_rules')
    .upsert(
      { business_id: businessId, start_day: startDay, effective_from: from || '2000-01-01' },
      { onConflict: 'business_id,effective_from' }
    )
  if (error) throw new Error(error.message)
  revalidatePath('/dashboard', 'layout')
}

export async function deleteBookRule(id: string) {
  const { supabase, businessId } = await requireBusinessContext()
  const { error } = await supabase.from('book_period_rules').delete().eq('id', id).eq('business_id', businessId)
  if (error) throw new Error(error.message)
  revalidatePath('/dashboard', 'layout')
}
