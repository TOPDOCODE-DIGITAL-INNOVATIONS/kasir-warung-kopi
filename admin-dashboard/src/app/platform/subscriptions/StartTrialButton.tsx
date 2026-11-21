'use client'

import { useState, type FormEvent } from 'react'
import AdminModal from '@/components/AdminModal'
import SubmitButton from '@/components/SubmitButton'
import { startTrial } from './trial-actions'
import { TRIAL_DURATION_DAYS, type BillingEnvironment } from './types'

const primary = 'rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors'

export default function StartTrialButton({ ownerId, name, environment, canStart }: {
  ownerId: string; name: string; environment: BillingEnvironment; canStart: boolean
}) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const label = environment === 'test' ? 'Test' : 'Live'

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    const data = new FormData(event.currentTarget)
    setPending(true)
    setError('')
    try {
      const result = await startTrial(data)
      if (result.success) {
        setNotice(result.message)
        setOpen(false)
      } else {
        setError(result.message)
      }
    } catch {
      setError('Trial belum berhasil dimulai. Silakan coba kembali.')
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      {canStart && (
        <button type="button" className={`mt-5 ${primary}`} onClick={() => { setError(''); setOpen(true) }}>
          Mulai Trial
        </button>
      )}
      {notice && <p role="status" className="mt-4 text-sm text-green-700">{notice}</p>}
      {open && (
        <AdminModal title="Mulai Trial" description={`${name} · Lingkungan ${label}`} pending={pending} onClose={() => setOpen(false)}>
          <form onSubmit={submit} aria-busy={pending} className="space-y-4 p-5">
            <input type="hidden" name="owner_id" value={ownerId} />
            <input type="hidden" name="environment" value={environment} />
            <p className="text-sm text-gray-600">Trial gratis berlaku selama {TRIAL_DURATION_DAYS} hari sejak dikonfirmasi. Kesempatan trial ini hanya tersedia sekali di lingkungan {label}.</p>
            {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 pt-4">
              <button type="button" onClick={() => setOpen(false)} disabled={pending}
                className="rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">Batal</button>
              <SubmitButton pending={pending} pendingLabel="Memulai trial..." className={primary}>Mulai Trial</SubmitButton>
            </div>
          </form>
        </AdminModal>
      )}
    </>
  )
}
