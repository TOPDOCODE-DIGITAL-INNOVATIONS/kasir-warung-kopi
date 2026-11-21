'use client'

import { useState, useTransition } from 'react'
import { PiggyBank, Pencil, Plus, Trash2 } from 'lucide-react'
import AdminModal from '@/components/AdminModal'
import DataPanel from '@/components/DataPanel'
import { EmptyState, Notice, ui } from '@/components/ui'
import LoadingSpinner from '@/components/LoadingSpinner'
import { rupiah } from '@/lib/format'
import MoneyInput from '../products/MoneyInput'
import { deleteCapital, saveCapital } from './actions'
import type { CapitalEntry } from './domain'

const fmtDate = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeZone: 'UTC' })
const KIND_LABEL = { initial: 'Modal awal', additional: 'Tambahan modal' } as const
const input = ui.inputBare

export default function CapitalClient({ businessId, entries, today }: { businessId: string; entries: CapitalEntry[]; today: string }) {
  const [editing, setEditing] = useState<CapitalEntry | 'new' | null>(null)
  const [pending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const total = entries.reduce((s, e) => s + Number(e.amount), 0)
  const current = editing === 'new' ? null : editing

  function run(fn: () => Promise<void>, id: string | null = null) {
    setError(null)
    setBusyId(id)
    startTransition(async () => {
      try {
        await fn()
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setBusyId(null)
      }
    })
  }

  return (
    <div className={`${ui.panel} overflow-hidden`}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 px-5 py-4 sm:px-6">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 ring-1 ring-blue-100"><PiggyBank className="h-[18px] w-[18px]" aria-hidden="true" /></span>
          <div>
            <h2 className="text-[15px] font-semibold text-gray-900">Catatan Modal</h2>
            <p className="mt-1 text-xs text-gray-500">
              Uang yang Anda keluarkan untuk memulai/mengembangkan usaha (alat, renovasi, stok awal). Jangan dicatat lagi sebagai
              pengeluaran operasional agar tidak dihitung dua kali.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => { setError(null); setEditing('new') }}
          disabled={!businessId}
          className={`${ui.btnPrimary} print:hidden`}
        >
          <Plus className="h-4 w-4" aria-hidden="true" /> Tambah Modal
        </button>
      </div>

      {error && !editing && <Notice tone="error" className="m-4">{error}</Notice>}

      <DataPanel loading={pending && !editing} label="Menyimpan...">
        {entries.length === 0 ? (
          <EmptyState icon={PiggyBank} title="Belum ada catatan modal" description="Tambahkan modal awal untuk melihat progres balik modal." />
        ) : (
          <ul className="divide-y divide-gray-100">
            {entries.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-gray-50/60 sm:px-6">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">
                    {KIND_LABEL[e.kind]} <span className="font-normal text-gray-500">· {fmtDate.format(new Date(`${e.date}T00:00:00Z`))}</span>
                  </p>
                  {e.note && <p className="truncate text-xs text-gray-500">{e.note}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <span className="mr-2 whitespace-nowrap text-sm font-semibold text-gray-900">{rupiah(e.amount)}</span>
                  <button type="button" aria-label="Ubah catatan modal" onClick={() => { setError(null); setEditing(e) }}
                    className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700 print:hidden">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button type="button" aria-label="Hapus catatan modal" disabled={pending}
                    onClick={() => {
                      if (!window.confirm(`Hapus ${KIND_LABEL[e.kind].toLowerCase()} ${rupiah(e.amount)}?`)) return
                      run(() => deleteCapital(e.id), e.id)
                    }}
                    className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 print:hidden">
                    {busyId === e.id ? <LoadingSpinner /> : <Trash2 className="h-4 w-4" />}
                  </button>
                </div>
              </li>
            ))}
            <li className="flex justify-between bg-gray-50/80 px-5 py-3.5 text-sm font-semibold tabular-nums text-gray-900 sm:px-6">
              <span>Total modal</span>
              <span>{rupiah(total)}</span>
            </li>
          </ul>
        )}
      </DataPanel>

      {editing && (
        <AdminModal
          title={current ? 'Ubah Modal' : 'Tambah Modal'}
          description="Catat modal awal saat buka usaha, atau tambahan modal di kemudian hari."
          pending={pending}
          onClose={() => setEditing(null)}
        >
          <form
            action={(fd) => run(async () => { await saveCapital(fd); setEditing(null) })}
            className="space-y-4 p-5"
          >
            <input type="hidden" name="business_id" value={businessId} />
            <input type="hidden" name="id" value={current?.id ?? ''} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="capital-kind" className="mb-1 block text-sm font-medium text-gray-700">Jenis</label>
                <select id="capital-kind" name="kind" defaultValue={current?.kind ?? (entries.length ? 'additional' : 'initial')} className={input}>
                  <option value="initial">Modal awal</option>
                  <option value="additional">Tambahan modal</option>
                </select>
              </div>
              <div>
                <label htmlFor="capital-date" className="mb-1 block text-sm font-medium text-gray-700">Tanggal</label>
                <input id="capital-date" type="date" name="date" required max={today} defaultValue={current?.date ?? today} className={input} />
              </div>
            </div>
            <div>
              <label htmlFor="capital-amount" className="mb-1 block text-sm font-medium text-gray-700">Nominal</label>
              <MoneyInput id="capital-amount" name="amount" required defaultValue={current ? Number(current.amount) : null} className={input} />
            </div>
            <div>
              <label htmlFor="capital-note" className="mb-1 block text-sm font-medium text-gray-700">Catatan (opsional)</label>
              <input id="capital-note" name="note" maxLength={500} defaultValue={current?.note ?? ''} placeholder="mis. mesin espresso, renovasi, stok awal" className={input} />
            </div>
            {error && <Notice tone="error">{error}</Notice>}
            <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
              <button type="button" disabled={pending} onClick={() => setEditing(null)}
                className={ui.btnSecondary}>
                Batal
              </button>
              <button type="submit" disabled={pending}
                className={ui.btnPrimary}>
                {pending && <LoadingSpinner />} {pending ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
          </form>
        </AdminModal>
      )}
    </div>
  )
}
