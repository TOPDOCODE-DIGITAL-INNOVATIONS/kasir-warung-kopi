'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { platformLandingPath } from '@/lib/platform-account'
import { getSiteUrl } from '@/lib/site-url'
import { safeNextPath } from '@/lib/auth-flow'
import { createClient } from '@/utils/supabase/server'

export async function login(formData: FormData) {
  const supabase = await createClient()

  const { data, error } = await supabase.auth.signInWithPassword({
    email: String(formData.get('email') ?? ''),
    password: String(formData.get('password') ?? ''),
  })

  const next = safeNextPath(String(formData.get('next') ?? ''))
  if (error || !data.user) {
    const message = error?.code === 'email_not_confirmed'
      ? 'Email belum dikonfirmasi. Buka tautan konfirmasi di inbox Anda.'
      : 'Email atau password salah'
    redirect('/login?message=' + encodeURIComponent(message) + (next ? '&next=' + encodeURIComponent(next) : ''))
  }

  const path = next ?? platformLandingPath(data.user)
  revalidatePath(path, 'layout')
  redirect(path)
}

/** Masuk / daftar dengan Google (Supabase OAuth, PKCE). Akun baru otomatis menjadi Owner. */
export async function signInWithGoogle(formData?: FormData) {
  const supabase = await createClient()
  const next = safeNextPath(String(formData?.get('next') ?? ''))
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${await getSiteUrl()}/auth/confirm${next ? `?next=${encodeURIComponent(next)}` : ''}` },
  })
  if (error || !data.url) {
    redirect('/login?message=' + encodeURIComponent(
      error?.code === 'provider_disabled' || error?.message?.includes('not enabled')
        ? 'Login Google belum diaktifkan. Hubungi pengelola aplikasi.'
        : 'Login Google belum berhasil. Silakan coba lagi.'))
  }
  redirect(data.url)
}
