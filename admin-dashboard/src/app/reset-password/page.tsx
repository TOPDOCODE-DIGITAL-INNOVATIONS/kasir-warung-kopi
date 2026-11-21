import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import AuthCard from '@/components/AuthCard'
import ResetPasswordForm from './ResetPasswordForm'

export const dynamic = 'force-dynamic'

export default async function ResetPasswordPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return (
    <AuthCard title="Buat Password Baru" subtitle={user?.email ? `Untuk akun ${user.email}` : 'Tautan reset diperlukan'}>
      {user ? <ResetPasswordForm /> : (
        <p role="alert" className="text-sm text-red-600 bg-red-50 p-4 rounded-lg">
          Tautan reset tidak valid atau sudah kedaluwarsa.{' '}
          <Link href="/forgot-password" className="font-semibold underline">Minta tautan baru</Link>.
        </p>
      )}
    </AuthCard>
  )
}
