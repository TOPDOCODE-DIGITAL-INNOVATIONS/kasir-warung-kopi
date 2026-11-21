/** Fungsi murni untuk alur auth (lupa password, OAuth). Tanpa import server agar mudah diuji. */

/** Halaman yang boleh dituju setelah /auth/confirm. Mencegah open redirect ke domain lain. */
const ALLOWED_NEXT = ['/reset-password', '/dashboard', '/platform', '/kasir-connect']

export function safeNextPath(next: string | null | undefined): string | null {
  if (!next || typeof next !== 'string') return null
  // Tolak URL absolut, protocol-relative (//evil.com) dan backslash trick (/\evil.com).
  if (!next.startsWith('/') || next.startsWith('//') || next.includes('\\') || next.includes('://')) return null
  const path = next.split(/[?#]/)[0]
  return ALLOWED_NEXT.some(p => path === p || path.startsWith(p + '/')) ? next : null
}

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validEmail(email: string) {
  return email.length <= 254 && EMAIL_PATTERN.test(email)
}

/** Pesan kesalahan password baru, atau null bila valid. Sama dengan aturan pendaftaran. */
export function newPasswordError(password: string, confirmation: string): string | null {
  if (password.length < 8 || password.length > 128) return 'Password harus terdiri dari 8 hingga 128 karakter.'
  if (password !== confirmation) return 'Konfirmasi password tidak sama.'
  return null
}

/** Tipe OTP email yang diterima /auth/confirm (template email Supabase memakai token_hash). */
export function emailOtpType(type: string | null): 'signup' | 'recovery' | 'email' | 'invite' | 'email_change' | null {
  return type === 'signup' || type === 'recovery' || type === 'email' || type === 'invite' || type === 'email_change' ? type : null
}
