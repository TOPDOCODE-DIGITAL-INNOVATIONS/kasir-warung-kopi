import Link from 'next/link'
import { login } from './actions'
import SubmitButton from '@/components/SubmitButton'
import { safeNextPath } from '@/lib/auth-flow'
import AuthCard, { GoogleSignIn, authInput, authLabel, authPrimary } from '@/components/AuthCard'

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ message?: string; next?: string }> }) {
  const { message, next: rawNext } = await searchParams
  const next = safeNextPath(rawNext)
  return (
    <AuthCard title="Masuk KasirKu" subtitle={next === '/kasir-connect' ? 'Masuk untuk menghubungkan aplikasi kasir' : 'Masuk ke dashboard Owner'}
      footer={<>Belum punya akun?{' '}<Link href="/register" className="font-semibold text-blue-600 hover:text-blue-700 hover:underline dark:text-blue-400">Daftar gratis 14 hari</Link></>}>
      <GoogleSignIn next={next} />
      <form className="space-y-6">
        {next && <input type="hidden" name="next" value={next} />}
        <div>
          <label className={authLabel} htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required className={authInput} placeholder="owner@example.com" />
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300" htmlFor="password">Password</label>
            <Link href="/forgot-password" className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400">Lupa password?</Link>
          </div>
          <input id="password" name="password" type="password" autoComplete="current-password" required className={authInput} placeholder="••••••••" />
        </div>
        {message && <p role="alert" className="text-sm text-red-600 bg-red-50 p-3 rounded-lg text-center">{message}</p>}
        <SubmitButton pendingLabel="Sedang masuk..." formAction={login} className={authPrimary}>Masuk Dashboard</SubmitButton>
      </form>
    </AuthCard>
  )
}
