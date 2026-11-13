'use server'

import { revalidatePath } from 'next/cache'
import { getBusinessContext, setBusinessCookie } from '@/lib/business-context'

export async function changeBusinessContext(businessId: string) {
  const { businesses } = await getBusinessContext()
  if (!businesses.some(b => b.id === businessId)) {
    return { success: false, message: 'Cabang tidak ditemukan atau tidak dapat diakses.' }
  }
  await setBusinessCookie(businessId)
  revalidatePath('/dashboard', 'layout')
  return { success: true, message: '' }
}
