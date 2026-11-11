'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { Coffee } from 'lucide-react'
import { register, type RegisterState } from './actions'

const initialState: RegisterState = { status: 'idle', message: '' }
const inputClassName = 'w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white transition-all'
const labelClassName = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'

export default function RegisterPage() {
  const [state, formAction, pending] = useActionState(register, initialState)

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
      <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden">
        <div className="p-8">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center transform rotate-12 shadow-lg">
              <Coffee className="text-white w-8 h-8 -rotate-12" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-center text-gray-900 dark:text-white mb-2">Buat Akun Owner</h1>
          <p className="text-center text-gray-500 dark:text-gray-400 mb-8">
            Daftar untuk mulai mengelola kasir warung kopi Anda
          </p>

          {state.status === 'success' ? (
            <p role="status" className="text-sm text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/30 p-4 rounded-lg">
              {state.message}
            </p>
          ) : (
            <form action={formAction} className="space-y-6" aria-busy={pending}>
              <div>
                <label htmlFor="name" className={labelClassName}>Nama lengkap</label>
                <input id="name" name="name" type="text" autoComplete="name" required maxLength={100}
                  defaultValue={state.values?.name} className={inputClassName} placeholder="Nama Anda" />
              </div>
              <div>
                <label htmlFor="email" className={labelClassName}>Email</label>
                <input id="email" name="email" type="email" autoComplete="email" required maxLength={254}
                  defaultValue={state.values?.email} className={inputClassName} placeholder="owner@example.com" />
              </div>
              <div>
                <label htmlFor="password" className={labelClassName}>Password</label>
                <input id="password" name="password" type="password" autoComplete="new-password" required
                  minLength={8} maxLength={128} aria-describedby="password-help" className={inputClassName} placeholder="Minimal 8 karakter" />
                <p id="password-help" className="mt-2 text-xs text-gray-500 dark:text-gray-400">Gunakan minimal 8 karakter untuk password Anda.</p>
              </div>
              <div>
                <label htmlFor="confirmPassword" className={labelClassName}>Konfirmasi password</label>
                <input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required
                  minLength={8} maxLength={128} className={inputClassName} placeholder="Ulangi password Anda" />
              </div>

              {state.status === 'error' && (
                <p role="alert" className="text-sm text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-900/30 p-3 rounded-lg text-center">
                  {state.message}
                </p>
              )}
              <button type="submit" disabled={pending}
                className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all disabled:opacity-60 disabled:cursor-not-allowed">
                {pending ? 'Mendaftarkan akun...' : 'Daftar Akun'}
              </button>
            </form>
          )}

          <p className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
            Sudah punya akun?{' '}
            <Link href="/login" className="font-semibold text-blue-600 hover:text-blue-700 hover:underline dark:text-blue-400">Masuk Dashboard</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
