'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export async function getProducts() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('products')
    .select('*, businesses(name)')
    .order('created_at', { ascending: false })
  
  if (error) throw new Error(error.message)
  return data
}

export async function addProduct(formData: FormData) {
  const name = formData.get('name') as string
  const price = parseFloat(formData.get('price') as string)
  const stock = parseInt(formData.get('stock') as string)
  const business_id = formData.get('business_id') as string

  if (!name || isNaN(price) || isNaN(stock) || !business_id) {
    throw new Error('Semua field wajib diisi dengan format yang benar')
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('products')
    .insert({ name, price, stock, business_id })

  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/products')
}

export async function updateProduct(id: string, formData: FormData) {
  const name = formData.get('name') as string
  const price = parseFloat(formData.get('price') as string)
  const stock = parseInt(formData.get('stock') as string)
  const business_id = formData.get('business_id') as string

  if (!name || isNaN(price) || isNaN(stock) || !business_id) {
    throw new Error('Semua field wajib diisi dengan format yang benar')
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('products')
    .update({ name, price, stock, business_id, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/products')
}

export async function deleteProduct(id: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('products')
    .delete()
    .eq('id', id)

  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/products')
}
