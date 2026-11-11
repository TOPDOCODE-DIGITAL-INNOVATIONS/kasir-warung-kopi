import { cache } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'

export const BUSINESS_COOKIE = 'kasir_active_business'
// An empty account must never fall back to an unfiltered query.
export const EMPTY_BUSINESS_ID = '00000000-0000-0000-0000-000000000000'

export const getBusinessContext = cache(async () => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const businesses: { id: string; name: string }[] = []
  for (let from = 0; ; from += 500) {
    const { data, error } = await supabase.from('businesses').select('id,name')
      .eq('owner_id', user.id).order('created_at').order('id').range(from, from + 499)
    if (error) throw new Error('Gagal memuat cabang. Silakan muat ulang halaman.')
    businesses.push(...data)
    if (data.length < 500) break
  }
  const preferred = (await cookies()).get(BUSINESS_COOKIE)?.value
  // Cookies are a preference, never authorization. Recheck ownership on every request.
  const businessId = businesses.find(b => b.id === preferred)?.id ?? businesses[0]?.id ?? null
  return { supabase, user, businesses, businessId }
})

export async function requireBusinessContext(expectedId?: string) {
  const context = await getBusinessContext()
  if (!context.businessId) throw new Error('Buat cabang terlebih dahulu.')
  if (expectedId !== undefined && expectedId !== context.businessId) {
    throw new Error('Cabang aktif sudah berubah. Muat ulang halaman sebelum mencoba lagi.')
  }
  return { ...context, businessId: context.businessId }
}

export async function setBusinessCookie(businessId: string) {
  (await cookies()).set(BUSINESS_COOKIE, businessId, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
    path: '/', maxAge: 60 * 60 * 24 * 365,
  })
}
