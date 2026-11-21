import { NextResponse, type NextRequest } from 'next/server'
import { platformLandingPath } from '@/lib/platform-account'
import { emailOtpType, safeNextPath } from '@/lib/auth-flow'
import { createClient } from '@/utils/supabase/server'

/**
 * Callback auth Supabase: konfirmasi email, tautan reset password, dan login Google (OAuth PKCE).
 * `next` hanya menerima halaman internal yang diizinkan (lihat safeNextPath).
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const code = params.get('code')
  const tokenHash = params.get('token_hash')
  const otpType = emailOtpType(params.get('type'))
  const next = safeNextPath(params.get('next'))
  const supabase = await createClient()

  let user = null
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) user = data.user
  } else if (tokenHash && otpType) {
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: otpType })
    if (!error) user = data.user
  }

  if (user) {
    const target = otpType === 'recovery' ? '/reset-password' : next ?? platformLandingPath(user)
    return NextResponse.redirect(new URL(target, request.url))
  }

  const loginUrl = new URL('/login', request.url)
  const providerError = params.get('error_description')
  loginUrl.searchParams.set('message', providerError
    ? 'Login dibatalkan atau ditolak penyedia. Silakan coba lagi.'
    : 'Tautan tidak valid atau sudah kedaluwarsa. Silakan coba masuk atau minta tautan baru.')
  return NextResponse.redirect(loginUrl)
}
