'use client'

import { useActionState, useTransition, useState } from 'react'
import SubmitButton from '@/components/SubmitButton'
import LoadingSpinner from '@/components/LoadingSpinner'
import { startCheckout, type BillingActionState } from './actions'

const idle: BillingActionState = { status: 'idle', message: '' }

function Message({ state }: { state: BillingActionState }) {
  if (state.status === 'idle') return null
  return (
    <p role={state.status === 'error' ? 'alert' : 'status'}
      className={`mt-2 text-sm ${state.status === 'error' ? 'text-red-600' : 'text-emerald-700'}`}>{state.message}</p>
  )
}

/** Pilih paket lalu diarahkan ke checkout Xendit. */
export function PlanCheckoutButton({ planCode, label, featured = false }: { planCode: 'monthly' | 'yearly'; label: string; featured?: boolean }) {
  const [state, action, pending] = useActionState(startCheckout, idle)
  return (
    <form action={action} className="mt-5">
      <input type="hidden" name="plan_code" value={planCode} />
      <SubmitButton pending={pending} pendingLabel="Menyiapkan pembayaran..."
        className={`w-full rounded-xl px-4 py-3 text-sm font-semibold transition ${featured ? 'bg-champagne text-espresso-900 hover:brightness-105' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
        {label}
      </SubmitButton>
      <Message state={state} />
    </form>
  )
}

export function BillingActionButton({ action, label, pendingLabel, danger = false, confirmText }: {
  action: () => Promise<BillingActionState>; label: string; pendingLabel: string; danger?: boolean; confirmText?: string
}) {
  const [state, setState] = useState(idle)
  const [confirming, setConfirming] = useState(false)
  const [pending, startTransition] = useTransition()
  const run = () => startTransition(async () => { setConfirming(false); setState(await action()) })
  const base = 'inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50 '
  const tone = danger ? 'border border-red-200 text-red-700 hover:bg-red-50' : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'

  return (
    <div>
      {confirming && confirmText ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p>{confirmText}</p>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={run} className="rounded-md bg-red-600 px-3 py-1.5 font-semibold text-white hover:bg-red-700">Ya, hentikan</button>
            <button type="button" onClick={() => setConfirming(false)} className="rounded-md px-3 py-1.5 font-semibold text-red-700 hover:bg-red-100">Batal</button>
          </div>
        </div>
      ) : (
        <button type="button" disabled={pending} onClick={() => (confirmText ? setConfirming(true) : run())} className={base + tone}>
          {pending && <LoadingSpinner label={pendingLabel} />}{pending ? pendingLabel : label}
        </button>
      )}
      <Message state={state} />
    </div>
  )
}
