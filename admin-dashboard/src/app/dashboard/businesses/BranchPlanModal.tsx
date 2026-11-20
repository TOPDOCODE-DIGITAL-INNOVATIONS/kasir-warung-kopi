'use client'

import Link from 'next/link'
import { useState } from 'react'
import AdminModal from '@/components/AdminModal'
import { rupiah } from '@/lib/format'
import type { CheckoutContext } from '@/lib/platform-billing/session-service'

export default function BranchPlanModal({ plans, onClose, onContinue }: {
  plans: CheckoutContext['plans']; onClose: () => void; onContinue: () => void
}) {
  const [planCode, setPlanCode] = useState(plans[0]?.code)
  const subscriptionHref = planCode ? `/dashboard/subscription?plan=${planCode}` : '/dashboard/subscription'
  const link = 'inline-flex items-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50'

  return <AdminModal title="Paket Cabang Tambahan" description="Cabang pertama gratis. Lihat pilihan paket untuk cabang berikutnya." pending={false} onClose={onClose}
    footer={<div className="flex flex-wrap items-center gap-2">
      <Link href={subscriptionHref} onClick={onClose} className={link}>Langganan &amp; Pembayaran</Link>
      <Link href="/dashboard/subscription/history" onClick={onClose} className={link}>Riwayat Pembayaran</Link>
      <button type="button" onClick={onContinue} className="ml-auto rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">OK</button>
    </div>}>
    <div className="space-y-4 p-5">
      {plans.length ? <fieldset>
        <legend className="mb-2 text-sm font-medium text-gray-700">Pilih periode</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {plans.map(plan => <label key={plan.code}
            className={`cursor-pointer rounded-lg border p-3 ${plan.code === planCode ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}>
            <span className="flex items-center justify-between text-sm font-medium text-gray-900">
              {plan.name}<input type="radio" name="branch-plan" checked={plan.code === planCode} onChange={() => setPlanCode(plan.code)} className="accent-blue-600" />
            </span>
            <span className="mt-1 block text-sm text-gray-600">{rupiah(plan.amount)} / {plan.code === 'monthly' ? 'bulan' : 'tahun'}</span>
          </label>)}
        </div>
      </fieldset> : <p className="text-sm text-gray-600">Paket bulanan dan tahunan belum tersedia.</p>}
      <p className="text-sm text-gray-500">Klik OK untuk melanjutkan tambah cabang.</p>
    </div>
  </AdminModal>
}
