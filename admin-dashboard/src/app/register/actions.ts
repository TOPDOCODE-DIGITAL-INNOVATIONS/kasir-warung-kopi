'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getSiteUrl } from '@/lib/site-url'
import { createClient } from '@/utils/supabase/server'

export type RegisterState = {
  status: 'idle' | 'error' | 'success'
  message: string
  values?: { name: string; email: string }
}

export async function register(_previousState: RegisterState, formData: FormData): Promise<RegisterState> {
  const name = String(formData.get('name') ?? '').trim()
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const password = String(formData.get('password') ?? '')
  const confirmPassword = String(formData.get('confirmPassword') ?? '')
  const values = { name, email }
  const fail = (message: string): RegisterState => ({ status: 'error', message, values })

  if (!name || name.length > 100) return fail('Isi nama lengkap maksimal 100 karakter.')
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return fail('Masukkan alamat email yang valid.')
  }
  if (password.length < 8 || password.length > 128) {
    return fail('Password harus terdiri dari 8 hingga 128 karakter.')
  }
  if (password !== confirmPassword) return fail('Konfirmasi password tidak sama.')

  const supabase = await createClient()
  const { data: currentUser } = await supabase.auth.getUser()
  if (currentUser.user) redirect('/dashboard')

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${await getSiteUrl()}/auth/confirm`,
      // Descriptive user metadata; access to business data still uses owner_id and RLS.
      data: { name, role: 'Owner' },
    },
  })

  if (error) {
    switch (error.code) {
      case 'user_already_exists':
      case 'email_exists':
        return fail('Email sudah terdaftar. Silakan masuk menggunakan akun Anda.')
      case 'weak_password':
        return fail('Password belum memenuhi ketentuan keamanan. Gunakan password yang lebih kuat.')
      case 'signup_disabled':
      case 'email_provider_disabled':
        return fail('Pendaftaran belum diaktifkan. Silakan hubungi pengelola aplikasi.')
      case 'over_email_send_rate_limit':
      case 'over_request_rate_limit':
        return fail('Terlalu banyak percobaan. Tunggu beberapa saat sebelum mencoba kembali.')
      case 'email_address_invalid':
      case 'email_address_not_authorized':
        return fail('Alamat email ini belum dapat digunakan untuk pendaftaran. Gunakan email lain atau hubungi pengelola.')
      default:
        return fail('Pendaftaran belum berhasil. Silakan coba kembali beberapa saat lagi.')
    }
  }

  if (data.session) {
    revalidatePath('/dashboard', 'layout')
    redirect('/dashboard')
  }

  return {
    status: 'success',
    message: 'Jika email ini dapat digunakan, tautan konfirmasi telah dikirim. Periksa inbox atau folder spam dan buka tautan di browser yang sama. Jika sudah memiliki akun, silakan masuk.',
  }
}
