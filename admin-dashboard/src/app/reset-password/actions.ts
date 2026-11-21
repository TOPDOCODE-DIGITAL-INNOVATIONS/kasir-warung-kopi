'use server'

import { redirect } from 'next/navigation'
import { newPasswordError } from '@/lib/auth-flow'
import { platformLandingPath } from '@/lib/platform-account'
import { createClient } from '@/utils/supabase/server'

export type ResetState = { status: 'idle' | 'error'; message: string }

export async function updatePassword(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const password = String(formData.get('password') ?? '')
  const invalid = newPasswordError(password, String(formData.get('confirmPassword') ?? ''))
  if (invalid) return { status: 'error', message: invalid }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { status: 'error', message: 'Sesi reset sudah berakhir. Minta tautan reset password yang baru.' }

  const { error } = await supabase.auth.updateUser({ password })
  if (error) {
    return {
      status: 'error',
      message: error.code === 'same_password'
        ? 'Password baru harus berbeda dari password lama.'
        : error.code === 'weak_password'
          ? 'Password belum memenuhi ketentuan keamanan. Gunakan password yang lebih kuat.'
          : 'Password belum berhasil diubah. Silakan coba lagi.',
    }
  }
  redirect(platformLandingPath(user))
}
