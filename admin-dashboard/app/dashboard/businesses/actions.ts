'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export async function getBusinesses() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('businesses')
    .select('*')
    .order('created_at', { ascending: false })
  
  if (error) throw new Error(error.message)
  return data
}

export async function addBusiness(formData: FormData) {
  const name = formData.get('name') as string
  const address = formData.get('address') as string

  if (!name) throw new Error('Nama cabang wajib diisi')

  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { error } = await supabase
    .from('businesses')
    .insert({ name, address, owner_id: user.id })

  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/businesses')
}

export async function updateBusiness(id: string, formData: FormData) {
  const name = formData.get('name') as string
  const address = formData.get('address') as string

  if (!name) throw new Error('Nama cabang wajib diisi')

  const supabase = await createClient()

  const { error } = await supabase
    .from('businesses')
    .update({ name, address })
    .eq('id', id)

  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/businesses')
}

export async function deleteBusiness(id: string) {
  const supabase = await createClient()

  const { error } = await supabase
    .from('businesses')
    .delete()
    .eq('id', id)

  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/businesses')
}
