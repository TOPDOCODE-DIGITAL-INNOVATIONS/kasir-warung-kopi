'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { platformAccount } from '@/lib/platform-account'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Kirim perangkat kembali ke aplikasi kasir dengan token cabang milik Owner yang login. */
export async function linkKasirToBranch(formData: FormData) {
  const businessId = String(formData.get('business_id') ?? '')
  if (!UUID.test(businessId)) redirect('/kasir-connect?error=1')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/kasir-connect')
  if (platformAccount(user).role !== 'owner') redirect('/kasir-connect?error=1')
  const { data } = await supabase.from('businesses').select('sync_token')
    .eq('id', businessId).eq('owner_id', user.id).maybeSingle()
  if (!data?.sync_token) redirect('/kasir-connect?error=1')
  // Fragment (#) tidak dikirim ke server/log; dibaca oleh aplikasi kasir lalu dihapus dari URL.
  redirect(`/kasir/#token=${encodeURIComponent(data.sync_token)}`)
}
