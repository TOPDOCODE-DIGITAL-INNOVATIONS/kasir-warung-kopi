import { NextResponse, type NextRequest } from 'next/server'
import { platformLandingPath } from '@/lib/platform-account'
import { createClient } from '@/utils/supabase/server'

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error && data.user) return NextResponse.redirect(new URL(platformLandingPath(data.user), request.url))
  }

  const loginUrl = new URL('/login', request.url)
  loginUrl.searchParams.set('message', 'Tautan konfirmasi tidak valid atau sudah kedaluwarsa. Silakan coba masuk atau daftar kembali.')
  return NextResponse.redirect(loginUrl)
}
