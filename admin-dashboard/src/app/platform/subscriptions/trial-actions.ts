'use server'

import { revalidatePath } from 'next/cache'
import { requireSuperAdmin } from '@/lib/platform-auth'
import { platformDb } from '../db'
import { TRIAL_DURATION_DAYS } from './types'

const route = '/platform/subscriptions'

export async function startTrial(formData: FormData) {
  const { user } = await requireSuperAdmin()
  const owner = formData.get('owner_id')
  const environment = formData.get('environment')
  if (typeof owner !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(owner)
    || (environment !== 'test' && environment !== 'live')) {
    return { success: false, message: 'Akun Owner atau lingkungan billing tidak valid.' }
  }

  const { data, error } = await platformDb().rpc('platform_start_trial', {
    p_actor: user.id,
    p_owner: owner,
    p_environment: environment,
    p_duration_days: TRIAL_DURATION_DAYS,
  })
  if (error) return { success: false, message: 'Trial belum berhasil dimulai. Silakan coba kembali.' }

  switch (data) {
    case 'started':
      revalidatePath(route)
      revalidatePath(`${route}/${owner}`)
      return { success: true, message: 'Trial berhasil dimulai.' }
    case 'trial_already_used':
      return { success: false, message: 'Owner ini sudah pernah memakai trial di lingkungan tersebut.' }
    case 'email_unverified':
      return { success: false, message: 'Owner perlu memverifikasi email sebelum memulai trial.' }
    case 'owner_not_found':
      return { success: false, message: 'Akun Owner sudah tidak tersedia.' }
    default:
      return { success: false, message: 'Trial belum berhasil dimulai. Muat ulang halaman sebelum mencoba lagi.' }
  }
}
