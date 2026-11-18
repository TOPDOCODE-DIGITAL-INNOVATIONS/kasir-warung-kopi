'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { platformLandingPath } from '@/lib/platform-account'
import { createClient } from '@/utils/supabase/server'

export async function login(formData: FormData) {
  const supabase = await createClient()

  const { data, error } = await supabase.auth.signInWithPassword({
    email: String(formData.get('email') ?? ''),
    password: String(formData.get('password') ?? ''),
  })

  if (error || !data.user) {
    redirect('/login?message=' + encodeURIComponent('Email atau password salah'))
  }

  const path = platformLandingPath(data.user)
  revalidatePath(path, 'layout')
  redirect(path)
}
