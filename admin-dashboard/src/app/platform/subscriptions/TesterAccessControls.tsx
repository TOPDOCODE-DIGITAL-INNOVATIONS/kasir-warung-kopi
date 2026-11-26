'use client'

import { useState, type FormEvent } from 'react'
import { FlaskConical, Ban, UserX } from 'lucide-react'
import AdminModal from '@/components/AdminModal'
import SubmitButton from '@/components/SubmitButton'
import { endTrial, setTesterAccess } from './trial-actions'
import { TESTER_DURATIONS, type BillingEnvironment, type TesterStatus, type TrialStatus } from './types'

const primary = 'rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors'
const danger = 'rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 transition-colors'
const outline = 'inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50'
const field = 'mt-1 w-full rounded-xl border border-gray-200 bg-gray-50/60 px-3 py-2.5 text-sm text-gray-900 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100'

type Dialog = 'end_trial' | 'grant' | 'revoke' | null

export default function TesterAccessControls({ ownerId, name, environment, trialStatus, testerStatus }: {
  ownerId: string; name: string; environment: BillingEnvironment; trialStatus: TrialStatus; testerStatus: TesterStatus
}) {
  const [dialog, setDialog] = useState<Dialog>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const label = environment === 'test' ? 'Test' : 'Live'
  const trialRunning = trialStatus === 'active' || trialStatus === 'scheduled' || trialStatus === 'none'
  const isTester = testerStatus === 'active'

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    const data = new FormData(event.currentTarget)
    setPending(true)
    setError('')
    try {
      const result = dialog === 'end_trial' ? await endTrial(data) : await setTesterAccess(data)
      if (result.success) {
        setNotice(result.message)
        setDialog(null)
      } else setError(result.message)
    } catch {
      setError('Perubahan belum berhasil disimpan. Silakan coba kembali.')
    } finally {
      setPending(false)
    }
  }

  const open = (next: Dialog) => { setError(''); setNotice(''); setDialog(next) }
  const titles = {
    end_trial: 'Hentikan Trial',
    grant: isTester ? 'Perpanjang Akses Penguji' : 'Jadikan Akun Penguji',
    revoke: 'Cabut Akses Penguji',
  } as const

  return (
    <div className="mt-5 border-t border-gray-100 pt-4">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Kontrol Super Admin</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={primary + ' inline-flex items-center gap-1.5'} onClick={() => open('grant')}>
          <FlaskConical aria-hidden="true" className="h-4 w-4" />{titles.grant}
        </button>
        {trialRunning && !isTester && (
          <button type="button" className={outline} onClick={() => open('end_trial')}>
            <Ban aria-hidden="true" className="h-4 w-4" />Hentikan Trial
          </button>
        )}
        {isTester && (
          <button type="button" className={outline + ' text-red-700'} onClick={() => open('revoke')}>
            <UserX aria-hidden="true" className="h-4 w-4" />Cabut Akses
          </button>
        )}
      </div>
      {notice && <p role="status" className="mt-3 text-sm text-green-700">{notice}</p>}

      {dialog && (
        <AdminModal title={titles[dialog]} description={`${name} · Lingkungan ${label}`} pending={pending} onClose={() => setDialog(null)}>
          <form onSubmit={submit} aria-busy={pending} className="space-y-4 p-5">
            <input type="hidden" name="owner_id" value={ownerId} />
            <input type="hidden" name="environment" value={environment} />
            {dialog !== 'end_trial' && <input type="hidden" name="mode" value={dialog} />}

            {dialog === 'end_trial' && (
              <p className="text-sm text-gray-600">
                Trial langsung berakhir dan tidak dapat dimulai lagi di lingkungan {label}. Owner mendapat masa toleransi 3 hari,
                lalu dashboard menjadi hanya-baca sampai berlangganan atau diberi akses penguji.
              </p>
            )}
            {dialog === 'grant' && (
              <>
                <p className="text-sm text-gray-600">
                  Owner mendapat akses penuh dashboard dan kasir tanpa pembayaran. {trialRunning && !isTester && 'Trial yang berjalan otomatis dihentikan. '}
                  Owner tetap dapat mencoba checkout langganan untuk pengujian.
                </p>
                <label className="block text-sm font-medium text-gray-700">
                  Durasi akses
                  <select name="days" defaultValue="90" className={field}>
                    {TESTER_DURATIONS.map(days => <option key={days} value={days}>{days} hari sejak sekarang</option>)}
                  </select>
                </label>
                <label className="block text-sm font-medium text-gray-700">
                  Catatan (opsional)
                  <input name="note" maxLength={200} placeholder="Mis. Beta tester batch 1" className={field} />
                </label>
              </>
            )}
            {dialog === 'revoke' && (
              <p className="text-sm text-gray-600">
                Akses penguji berakhir sekarang. Owner kembali ke status langganan normal dengan masa toleransi 3 hari.
              </p>
            )}

            {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 pt-4">
              <button type="button" onClick={() => setDialog(null)} disabled={pending}
                className="rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">Batal</button>
              <SubmitButton pending={pending} pendingLabel="Menyimpan..." className={dialog === 'grant' ? primary : danger}>
                {titles[dialog]}
              </SubmitButton>
            </div>
          </form>
        </AdminModal>
      )}
    </div>
  )
}
