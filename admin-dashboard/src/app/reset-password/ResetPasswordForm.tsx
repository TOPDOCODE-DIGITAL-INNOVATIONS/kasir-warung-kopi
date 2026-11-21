'use client'

import { useActionState } from 'react'
import SubmitButton from '@/components/SubmitButton'
import { authInput, authLabel, authPrimary } from '@/components/AuthCard'
import { updatePassword, type ResetState } from './actions'

const initial: ResetState = { status: 'idle', message: '' }

export default function ResetPasswordForm() {
  const [state, action, pending] = useActionState(updatePassword, initial)
  return (
    <form action={action} className="space-y-6" aria-busy={pending}>
      <div>
        <label htmlFor="password" className={authLabel}>Password baru</label>
        <input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={128} className={authInput} placeholder="Minimal 8 karakter" />
      </div>
      <div>
        <label htmlFor="confirmPassword" className={authLabel}>Ulangi password baru</label>
        <input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required minLength={8} maxLength={128} className={authInput} />
      </div>
      {state.status === 'error' && <p role="alert" className="text-sm text-red-600 bg-red-50 p-3 rounded-lg text-center">{state.message}</p>}
      <SubmitButton pending={pending} pendingLabel="Menyimpan..." className={authPrimary}>Simpan Password</SubmitButton>
    </form>
  )
}
