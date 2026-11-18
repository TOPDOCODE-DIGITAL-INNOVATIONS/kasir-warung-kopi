'use client'

import { useState, type FormEvent } from 'react'
import { Check, Copy, ExternalLink, RefreshCw, CreditCard, Ban, Zap } from 'lucide-react'
import AdminModal from '@/components/AdminModal'
import SubmitButton from '@/components/SubmitButton'
import { rupiah } from '@/lib/format'
import {
  cancelOpenXenditCheckout,
  createXenditCheckout,
  simulateXenditCycle,
  stopXenditAutoRenewal,
  syncXenditStatus,
  type CheckoutContext,
} from './xendit-actions'
import type { BillingEnvironment } from './types'

const primary =
  'inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50'
const secondary =
  'inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50'
const danger =
  'inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50'

export default function XenditSubscriptionPanel({
  ownerId,
  ownerName,
  environment,
  context,
}: {
  ownerId: string
  ownerName: string
  environment: BillingEnvironment
  context: CheckoutContext | null
}) {
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'yearly'>('monthly')
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [copied, setCopied] = useState(false)

  const plans = context?.plans ?? []
  const openCheckout = context?.open_checkout ?? null
  const currentSub = context?.current_subscription ?? null
  const envLabel = environment === 'test' ? 'Test Mode' : 'Live Mode'

  async function runAction(name: string, fn: () => Promise<{ success: boolean; message: string; checkoutUrl?: string }>) {
    if (pendingAction) return
    setPendingAction(name)
    setError('')
    setNotice('')
    try {
      const result = await fn()
      if (result.success) {
        setNotice(result.message)
        if (name === 'create') setModalOpen(false)
      } else {
        setError(result.message)
      }
    } catch {
      setError('Permintaan ke Xendit belum berhasil diproses. Silakan coba kembali.')
    } finally {
      setPendingAction(null)
    }
  }

  function handleCreateCheckout(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    void runAction('create', () => createXenditCheckout(formData))
  }

  function makeFormData() {
    const fd = new FormData()
    fd.set('owner_id', ownerId)
    fd.set('environment', environment)
    return fd
  }

  async function copyUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore
    }
  }

  return (
    <div className="mt-5 space-y-4 border-t border-gray-100 pt-4">
      {openCheckout?.checkout_url && (
        <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                Checkout Xendit Aktif ({envLabel})
              </p>
              <p className="text-sm font-medium text-gray-900 mt-0.5">
                Paket {openCheckout.plan_name} · {rupiah(openCheckout.amount)}
              </p>
            </div>
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
              Menunggu Pembayaran
            </span>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              readOnly
              value={openCheckout.checkout_url}
              aria-label="Tautan pembayaran Xendit"
              className="w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs text-gray-700 font-mono"
            />
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => copyUrl(openCheckout.checkout_url!)}
                className={secondary}
              >
                {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Tersalin' : 'Salin Link'}
              </button>
              <a
                href={openCheckout.checkout_url}
                target="_blank"
                rel="noopener noreferrer"
                className={primary}
              >
                <ExternalLink className="h-4 w-4" />
                Bayar di Xendit
              </a>
            </div>
          </div>
        </div>
      )}

      {openCheckout && !openCheckout.checkout_url && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Checkout {openCheckout.plan_name} ({rupiah(openCheckout.amount)}) belum terkonfirmasi dari Xendit. Lanjutkan
          untuk mengambil tautan dengan referensi yang sama tanpa membuat tagihan ganda.
          <div className="mt-3">
            <button
              type="button"
              disabled={!!pendingAction}
              onClick={() => {
                const fd = makeFormData()
                fd.set('plan_code', openCheckout.plan_code)
                void runAction('create', () => createXenditCheckout(fd))
              }}
              className={primary}
            >
              <RefreshCw className={`h-4 w-4 ${pendingAction === 'create' ? 'animate-spin' : ''}`} />
              {pendingAction === 'create' ? 'Menghubungi Xendit...' : 'Lanjutkan Checkout'}
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {!openCheckout && (
          <button
            type="button"
            disabled={!!pendingAction}
            onClick={() => {
              setError('')
              setNotice('')
              setModalOpen(true)
            }}
            className={primary}
          >
            <CreditCard className="h-4 w-4" />
            Buat Checkout Xendit ({envLabel})
          </button>
        )}

        {(openCheckout || currentSub?.xendit_plan_id) && (
          <button
            type="button"
            disabled={!!pendingAction}
            onClick={() => runAction('sync', () => syncXenditStatus(makeFormData()))}
            className={secondary}
          >
            <RefreshCw className={`h-4 w-4 ${pendingAction === 'sync' ? 'animate-spin' : ''}`} />
            {pendingAction === 'sync' ? 'Menyinkronkan...' : 'Cek Status Xendit'}
          </button>
        )}

        {environment === 'test' && (openCheckout || currentSub?.xendit_plan_id) && currentSub?.status !== 'active' && (
          <button
            type="button"
            disabled={!!pendingAction}
            onClick={() => runAction('simulate', () => simulateXenditCycle(makeFormData()))}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            <Zap className="h-4 w-4" />
            {pendingAction === 'simulate' ? 'Memproses...' : 'Simulasi Bayar Lunas (Test)'}
          </button>
        )}

        {openCheckout?.xendit_session_id && (
          <button
            type="button"
            disabled={!!pendingAction}
            onClick={() => runAction('cancel', () => cancelOpenXenditCheckout(makeFormData()))}
            className={danger}
          >
            <Ban className="h-4 w-4" />
            {pendingAction === 'cancel' ? 'Membatalkan...' : 'Batalkan Checkout'}
          </button>
        )}

        {(currentSub?.status === 'active' || currentSub?.status === 'past_due') && currentSub.renewal_enabled && currentSub.xendit_plan_id && (
          <button
            type="button"
            disabled={!!pendingAction}
            onClick={() => runAction('stop', () => stopXenditAutoRenewal(makeFormData()))}
            className={danger}
          >
            <Ban className="h-4 w-4" />
            {pendingAction === 'stop' ? 'Menghentikan...' : 'Hentikan Perpanjangan'}
          </button>
        )}
      </div>

      {notice && (
        <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-700">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {modalOpen && (
        <AdminModal
          title="Buat Checkout Langganan Xendit"
          description={`${ownerName} · ${envLabel}`}
          pending={pendingAction === 'create'}
          onClose={() => setModalOpen(false)}
        >
          <form onSubmit={handleCreateCheckout} aria-busy={pendingAction === 'create'} className="space-y-4 p-5">
            <input type="hidden" name="owner_id" value={ownerId} />
            <input type="hidden" name="environment" value={environment} />

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Pilih Paket Langganan</label>
              <div className="grid gap-3 sm:grid-cols-2">
                {plans.map((p) => {
                  const active = selectedPlan === p.code
                  return (
                    <label
                      key={p.code}
                      className={`flex cursor-pointer flex-col justify-between rounded-lg border p-3.5 transition-colors ${
                        active ? 'border-blue-600 bg-blue-50/50 ring-1 ring-blue-600' : 'border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-gray-900">{p.name}</span>
                        <input
                          type="radio"
                          name="plan_code"
                          value={p.code}
                          checked={active}
                          onChange={() => setSelectedPlan(p.code)}
                          className="h-4 w-4 accent-blue-600"
                        />
                      </div>
                      <p className="mt-2 text-base font-bold text-gray-900">
                        {rupiah(p.amount)}
                        <span className="text-xs font-normal text-gray-500">
                          {' '}
                          / {p.code === 'monthly' ? 'bulan' : 'tahun'}
                        </span>
                      </p>
                    </label>
                  )
                })}
              </div>
            </div>

            <p className="text-xs text-gray-500">
              Server membuat tautan pembayaran langganan Xendit pada {envLabel}. Kirim tautan ke Owner; status lunas
              tercatat otomatis setelah Xendit melaporkan pembayaran berhasil.
            </p>

            {error && (
              <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
                {error}
              </p>
            )}

            <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 pt-4">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                disabled={pendingAction === 'create'}
                className={secondary}
              >
                Batal
              </button>
              <SubmitButton
                pending={pendingAction === 'create'}
                pendingLabel="Membuat sesi Xendit..."
                className={primary}
              >
                Buat Link Pembayaran
              </SubmitButton>
            </div>
          </form>
        </AdminModal>
      )}
    </div>
  )
}

