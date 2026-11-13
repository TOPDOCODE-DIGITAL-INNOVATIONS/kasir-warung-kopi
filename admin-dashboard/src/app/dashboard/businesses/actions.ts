'use server'

import { getBusinessContext, requireBusinessContext, setBusinessCookie, EMPTY_BUSINESS_ID } from '@/lib/business-context'
import { revalidatePath } from 'next/cache'

export async function getBusinesses() {
  const { supabase, businessId } = await getBusinessContext()
  const { data, error } = await supabase
    .from('businesses')
    .select('id, name, address, sync_token, last_synced_at, last_device_code, created_at')
    .eq('id', businessId ?? EMPTY_BUSINESS_ID)
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message)
  return data
}

function readForm(formData: FormData) {
  const name = String(formData.get('name') ?? '').trim()
  const address = String(formData.get('address') ?? '').trim() || null
  if (!name) throw new Error('Nama cabang wajib diisi')
  return { name, address }
}

export async function addBusiness(formData: FormData) {
  const { supabase, user } = await getBusinessContext()
  const { data, error } = await supabase.from('businesses').insert({ ...readForm(formData), owner_id: user.id }).select('id').single()
  if (error) throw new Error(error.message)
  await setBusinessCookie(data.id)
  revalidatePath('/dashboard', 'layout')
}

export async function updateBusiness(id: string, formData: FormData) {
  const { supabase } = await requireBusinessContext(id)
  const { error } = await supabase.from('businesses').update(readForm(formData)).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/dashboard', 'layout')
}

export async function deleteBusiness(id: string) {
  const { supabase } = await requireBusinessContext(id)
  const { error } = await supabase.from('businesses').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/dashboard', 'layout')
}

/** Buat token baru; token lama langsung tidak berlaku. */
export async function regenerateSyncToken(id: string) {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  const token = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  const { supabase } = await requireBusinessContext(id)
  const { error } = await supabase.from('businesses').update({ sync_token: token }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/dashboard', 'layout')
}
