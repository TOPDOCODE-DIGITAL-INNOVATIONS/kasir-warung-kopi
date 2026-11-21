'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import SubmitButton from '@/components/SubmitButton'
import AuthCard, { authInput, authLabel, authPrimary } from '@/components/AuthCard'
import { requestPasswordReset, type ForgotState } from './actions'

const initial: ForgotState = { status: 'idle', message: '' }

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState(requestPasswordReset, initial)
  return (
    <AuthCard title="Lupa Password" subtitle="Kami kirim tautan untuk membuat password baru"
      footer={<Link href="/login" className="font-semibold text-blue-600 hover:underline dark:text-blue-400">Kembali ke halaman masuk</Link>}>
      {state.status === 'success' ? (
        <p role="status" className="text-sm text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/30 p-4 rounded-lg">{state.message}</p>
      ) : (
        <form action={action} className="space-y-6" aria-busy={pending}>
          <div>
            <label htmlFor="email" className={authLabel}>Email akun</label>
            <input id="email" name="email" type="email" autoComplete="email" required defaultValue={state.email} className={authInput} placeholder="owner@example.com" />
          </div>
          {state.status === 'error' && <p role="alert" className="text-sm text-red-600 bg-red-50 p-3 rounded-lg text-center">{state.message}</p>}
          <SubmitButton pending={pending} pendingLabel="Mengirim..." className={authPrimary}>Kirim Tautan Reset</SubmitButton>
        </form>
      )}
    </AuthCard>
  )
}
