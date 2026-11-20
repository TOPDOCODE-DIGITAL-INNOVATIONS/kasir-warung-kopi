'use client'

import { useActionState } from 'react'
import SubmitButton from '@/components/SubmitButton'
import type { BillingEnvironment } from '../subscriptions/types'
import { recheckPayment } from './actions'

export default function RecheckPaymentButton({ checkoutId, environment }: {
  checkoutId: string
  environment: BillingEnvironment
}) {
  const [state, action] = useActionState(recheckPayment, { success: false, message: '' })
  return (
    <form action={action} className="space-y-1">
      <input type="hidden" name="checkout_id" value={checkoutId} />
      <input type="hidden" name="environment" value={environment} />
      <SubmitButton className="whitespace-nowrap rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
        pendingLabel="Memeriksa…">Cek Status Xendit</SubmitButton>
      {state.message && <p role="status" className={`text-xs ${state.success ? 'text-green-700' : 'text-red-700'}`}>{state.message}</p>}
    </form>
  )
}
