'use server'

import { validEmail } from '@/lib/auth-flow'
import { getSiteUrl } from '@/lib/site-url'
import { createClient } from '@/utils/supabase/server'

export type ForgotState = { status: 'idle' | 'error' | 'success'; message: string; email?: string }

export async function requestPasswordReset(_prev: ForgotState, formData: FormData): Promise<ForgotState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  if (!validEmail(email)) return { status: 'error', message: 'Masukkan alamat email yang valid.', email }

  const supabase = await createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await getSiteUrl()}/auth/confirm?next=/reset-password`,
  })
  if (error?.code === 'over_email_send_rate_limit' || error?.code === 'over_request_rate_limit') {
    return { status: 'error', message: 'Terlalu banyak permintaan. Tunggu beberapa menit lalu coba lagi.', email }
  }
  // Pesan sama untuk email terdaftar/tidak agar daftar akun tidak bisa ditebak.
  return {
    status: 'success',
    message: 'Jika email tersebut terdaftar, tautan untuk membuat password baru sudah dikirim. Periksa inbox atau folder spam, lalu buka tautan di browser ini.',
  }
}
