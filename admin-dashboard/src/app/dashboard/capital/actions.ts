'use server'

import { revalidatePath } from 'next/cache'
import { requireBusinessContext } from '@/lib/business-context'
import { parseMoney } from '@/lib/money'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function validDate(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s
}

/** Tambah atau ubah catatan modal. `id` kosong = catatan baru. */
export async function saveCapital(formData: FormData) {
  const businessId = String(formData.get('business_id') ?? '')
  const id = String(formData.get('id') ?? '').trim()
  const date = String(formData.get('date') ?? '')
  const kind = String(formData.get('kind') ?? '')
  const note = String(formData.get('note') ?? '').trim().slice(0, 500) || null
  const amount = parseMoney(String(formData.get('amount') ?? ''))

  if (!businessId) throw new Error('Pilih cabang')
  if (id && !UUID_RE.test(id)) throw new Error('Catatan modal tidak valid')
  if (!validDate(date)) throw new Error('Pilih tanggal modal')
  if (kind !== 'initial' && kind !== 'additional') throw new Error('Pilih jenis modal')
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Nominal modal harus lebih dari 0')
  if (amount > 999_999_999_999) throw new Error('Nominal modal terlalu besar')

  const { supabase } = await requireBusinessContext(businessId)
  const row = { business_id: businessId, date, kind, amount, note, updated_at: new Date().toISOString() }
  const { error } = id
    ? await supabase.from('capital_entries').update(row).eq('id', id).eq('business_id', businessId)
    : await supabase.from('capital_entries').insert(row)
  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/capital')
}

export async function deleteCapital(id: string) {
  if (!UUID_RE.test(id)) throw new Error('Catatan modal tidak valid')
  const { supabase, businessId } = await requireBusinessContext()
  const { error } = await supabase.from('capital_entries').delete().eq('id', id).eq('business_id', businessId)
  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/capital')
}
