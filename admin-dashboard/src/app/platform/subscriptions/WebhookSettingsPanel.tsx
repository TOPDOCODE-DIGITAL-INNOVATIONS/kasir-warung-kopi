'use client'

import { useState, type FormEvent } from 'react'
import { Check, Copy, KeyRound } from 'lucide-react'
import { Badge } from '@/components/ui'
import { saveWebhookToken } from './xendit-actions'

type EnvStatus = {
  hasDbToken: boolean
  hasEnvToken: boolean
  maskedToken: string | null
}

export default function WebhookSettingsPanel({
  webhookUrl,
  testStatus,
  liveStatus,
}: {
  webhookUrl: string
  testStatus: EnvStatus
  liveStatus: EnvStatus
}) {
  const [copied, setCopied] = useState(false)
  const [editingEnv, setEditingEnv] = useState<'test' | 'live' | null>(null)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(webhookUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore
    }
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (pending) return
    const fd = new FormData(e.currentTarget)
    setPending(true)
    setMessage(null)
    try {
      const res = await saveWebhookToken(fd)
      setMessage({ ok: res.success, text: res.message })
      if (res.success) setEditingEnv(null)
    } catch {
      setMessage({ ok: false, text: 'Token webhook belum berhasil disimpan.' })
    } finally {
      setPending(false)
    }
  }

  const items = [
    { env: 'test' as const, label: 'Test Mode (Development)', envVar: 'XENDIT_TEST_WEBHOOK_TOKEN', status: testStatus },
    { env: 'live' as const, label: 'Live Mode (Production)', envVar: 'XENDIT_LIVE_WEBHOOK_TOKEN', status: liveStatus },
  ]

  return (
    <section aria-labelledby="webhook-settings" className="overflow-hidden rounded-2xl border border-gray-200/70 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-5 py-4 sm:px-6">
        <h2 id="webhook-settings" className="text-[15px] font-semibold text-gray-900">Webhook Xendit</h2>
        <p className="mt-0.5 text-xs text-gray-500">
          Tempel URL endpoint di bawah ke Xendit Dashboard → Settings → Webhooks, lalu simpan Verification Token (`x-callback-token`) lewat form ini atau lewat `.env`.
        </p>
      </div>

      <div className="space-y-4 p-5 sm:p-6">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            URL Endpoint Webhook (untuk Test &amp; Live)
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              readOnly
              value={webhookUrl}
              aria-label="URL Endpoint Webhook Xendit"
              className="w-full rounded-xl border border-gray-200 bg-gray-50/70 px-3 py-2 text-xs font-mono text-gray-700"
            />
            <button
              type="button"
              onClick={copyUrl}
              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
            >
              {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Tersalin' : 'Salin URL Webhook'}
            </button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {items.map(({ env, label, envVar, status }) => {
            const configured = status.hasDbToken || status.hasEnvToken
            const isEditing = editingEnv === env
            return (
              <div key={env} className="rounded-2xl border border-gray-200/70 bg-gray-50/40 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <KeyRound className="h-4 w-4 text-gray-500" />
                    <h3 className="text-sm font-semibold text-gray-900">{label}</h3>
                  </div>
                  <Badge tone={configured ? 'green' : 'amber'}>
                    {status.hasDbToken ? 'Aktif (Dashboard)' : status.hasEnvToken ? 'Aktif (.env)' : 'Belum diisi'}
                  </Badge>
                </div>

                <p className="text-xs text-gray-500 font-mono">
                  {status.maskedToken ? `Token: ${status.maskedToken}` : `Env: ${envVar}`}
                </p>

                {isEditing ? (
                  <form onSubmit={submit} className="space-y-2">
                    <input type="hidden" name="environment" value={env} />
                    <input
                      name="callback_token"
                      type="password"
                      autoComplete="off"
                      placeholder="Tempel Verification Token dari Xendit..."
                      className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs text-gray-900 focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-100"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="submit"
                        disabled={pending}
                        className="rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        {pending ? 'Menyimpan...' : 'Simpan Token'}
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => setEditingEnv(null)}
                        className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                      >
                        Batal
                      </button>
                    </div>
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setMessage(null)
                      setEditingEnv(env)
                    }}
                    className="text-xs font-semibold text-blue-600 hover:underline"
                  >
                    {configured ? 'Ubah Verification Token' : '+ Isi Verification Token'}
                  </button>
                )}
              </div>
            )
          })}
        </div>

        {message && (
          <p role={message.ok ? 'status' : 'alert'} className={`text-xs ${message.ok ? 'text-green-700' : 'text-red-700'}`}>
            {message.text}
          </p>
        )}
      </div>
    </section>
  )
}
