'use client'

import { useState, type FormEvent } from 'react'
import { updatePlanPrice } from './xendit-actions'

export default function PlanPriceForm({ code, amount }: { code: 'monthly' | 'yearly'; amount: number | null }) {
  const [editing, setEditing] = useState(false)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    const data = new FormData(event.currentTarget)
    setPending(true)
    setMessage(null)
    try {
      const result = await updatePlanPrice(data)
      setMessage({ ok: result.success, text: result.message })
      if (result.success) setEditing(false)
    } catch {
      setMessage({ ok: false, text: 'Harga belum berhasil disimpan. Silakan coba kembali.' })
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="mt-3">
      {editing ? (
        <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="plan_code" value={code} />
          <label className="text-xs font-medium text-gray-600">
            Harga baru (Rp)
            <input
              name="amount"
              inputMode="numeric"
              required
              defaultValue={amount ?? ''}
              className="mt-1 block w-36 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
          <button type="submit" disabled={pending}
            className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {pending ? 'Menyimpan...' : 'Simpan'}
          </button>
          <button type="button" disabled={pending} onClick={() => setEditing(false)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            Batal
          </button>
        </form>
      ) : (
        <button type="button" onClick={() => { setMessage(null); setEditing(true) }}
          className="text-sm font-medium text-blue-600 hover:underline">
          Ubah harga
        </button>
      )}
      {message && (
        <p role={message.ok ? 'status' : 'alert'} className={`mt-2 text-xs ${message.ok ? 'text-green-700' : 'text-red-700'}`}>
          {message.text}
        </p>
      )}
    </div>
  )
}
