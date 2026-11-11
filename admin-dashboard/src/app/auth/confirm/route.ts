import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  const loginUrl = new URL('/login', request.url)
  loginUrl.searchParams.set('message', 'Tautan konfirmasi tidak valid atau sudah kedaluwarsa. Silakan coba masuk atau daftar kembali.')
  return NextResponse.redirect(loginUrl)
}
