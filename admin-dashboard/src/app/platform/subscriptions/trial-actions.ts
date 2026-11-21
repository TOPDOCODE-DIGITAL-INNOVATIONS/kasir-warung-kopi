'use server'

import { revalidatePath } from 'next/cache'
import { requireSuperAdmin } from '@/lib/platform-auth'
import { platformDb } from '../db'
import { TESTER_DURATIONS, TRIAL_DURATION_DAYS } from './types'

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

const ownerPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i

function readTarget(formData: FormData) {
  const owner = formData.get('owner_id')
  const environment = formData.get('environment')
  if (typeof owner !== 'string' || !ownerPattern.test(owner) || (environment !== 'test' && environment !== 'live')) return null
  return { owner, environment }
}

function refresh(owner: string) {
  revalidatePath(route)
  revalidatePath(`${route}/${owner}`)
  revalidatePath(`/platform/owners/${owner}`)
  revalidatePath('/platform')
}

export async function endTrial(formData: FormData) {
  const { user } = await requireSuperAdmin()
  const target = readTarget(formData)
  if (!target) return { success: false, message: 'Akun Owner atau lingkungan billing tidak valid.' }

  const { data, error } = await platformDb().rpc('platform_end_trial', {
    p_actor: user.id, p_owner: target.owner, p_environment: target.environment,
  })
  if (error) return { success: false, message: 'Trial belum berhasil dihentikan. Silakan coba kembali.' }
  switch (data) {
    case 'ended':
      refresh(target.owner)
      return { success: true, message: 'Trial dihentikan. Owner tidak akan mendapat trial otomatis lagi di lingkungan ini.' }
    case 'trial_not_active':
      return { success: false, message: 'Trial Owner ini sudah berakhir.' }
    case 'owner_not_found':
      return { success: false, message: 'Akun Owner sudah tidak tersedia.' }
    default:
      return { success: false, message: 'Trial belum berhasil dihentikan. Muat ulang halaman sebelum mencoba lagi.' }
  }
}

export async function setTesterAccess(formData: FormData) {
  const { user } = await requireSuperAdmin()
  const target = readTarget(formData)
  if (!target) return { success: false, message: 'Akun Owner atau lingkungan billing tidak valid.' }

  const mode = formData.get('mode')
  let until: string | null = null
  if (mode === 'grant') {
    const days = Number(formData.get('days'))
    if (!(TESTER_DURATIONS as readonly number[]).includes(days)) return { success: false, message: 'Pilih durasi akses penguji yang tersedia.' }
    until = new Date(Date.now() + days * 86_400_000).toISOString()
  } else if (mode !== 'revoke') {
    return { success: false, message: 'Permintaan tidak valid.' }
  }
  const note = formData.get('note')

  const { data, error } = await platformDb().rpc('platform_set_tester_access', {
    p_actor: user.id, p_owner: target.owner, p_environment: target.environment,
    p_until: until, p_note: typeof note === 'string' ? note.slice(0, 200) : null,
  })
  if (error) return { success: false, message: 'Akses penguji belum berhasil disimpan. Silakan coba kembali.' }
  switch (data) {
    case 'granted':
      refresh(target.owner)
      return { success: true, message: 'Akun penguji aktif. Trial dihentikan dan Owner dapat memakai semua fitur tanpa pembayaran.' }
    case 'revoked':
      refresh(target.owner)
      return { success: true, message: 'Akses penguji dicabut. Owner kembali mengikuti status langganan normal.' }
    case 'not_tester':
      return { success: false, message: 'Owner ini tidak sedang memiliki akses penguji.' }
    case 'invalid_period':
      return { success: false, message: 'Durasi akses penguji tidak valid.' }
    case 'owner_not_found':
      return { success: false, message: 'Akun Owner sudah tidak tersedia.' }
    default:
      return { success: false, message: 'Akses penguji belum berhasil disimpan. Muat ulang halaman sebelum mencoba lagi.' }
  }
}
