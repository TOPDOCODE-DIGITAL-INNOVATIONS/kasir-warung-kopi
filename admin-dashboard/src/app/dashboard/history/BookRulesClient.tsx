'use client'

import LoadingSpinner from '@/components/LoadingSpinner'
import DataPanel from '@/components/DataPanel'
import { useDataLoading } from '@/components/DataLoadingContext'

import { useState, useTransition } from 'react'
import { CalendarClock, Trash2 } from 'lucide-react'
import { bookPeriod, describeRule, formatRange, SINCE_BEGINNING, type BookRule } from '@/lib/book-period'
import { saveBookRule, deleteBookRule } from './actions'

export type Rule = BookRule & { id: string; business_id: string }

const fmtDate = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeZone: 'UTC' })

export default function BookRulesClient({
  businesses,
  rules,
  today,
}: {
  businesses: { id: string; name: string }[]
  rules: Rule[]
  today: string
}) {
  const [openFor, setOpenFor] = useState<string | null>(null)
  const [loading, startTransition] = useTransition()
  const routePending = useDataLoading()
  const [operationKey, setOperationKey] = useState('save')
  const [error, setError] = useState<string | null>(null)

  function run(fn: () => Promise<void>, key = 'save') {
    setOperationKey(key)
    setError(null)
    return new Promise<void>(resolve => {
      startTransition(async () => {
        try { await fn() } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
        finally { resolve() }
      })
    })
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200/70 overflow-hidden">
      <div className="px-5 py-4 sm:px-6 border-b border-gray-100 flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 ring-1 ring-blue-100"><CalendarClock aria-hidden="true" className="h-[18px] w-[18px]" /></span>
        <div>
          <h2 className="font-semibold text-[15px] text-gray-900">Periode Tutup Buku</h2>
          <p className="text-xs text-gray-500 mt-1">
            Menentukan cara rekap & kartu &quot;periode ini&quot; dihitung. Saat aturan diganti, periode sebelum tanggal
            berlaku tetap memakai aturan lama, jadi laporan lama tidak berubah.
          </p>
        </div>
      </div>

      {error && <p className="m-4 text-sm text-red-700 bg-red-50 p-3 rounded-xl border border-red-100">{error}</p>}

      <DataPanel loading={loading || routePending} label="Memuat aturan buku..."><ul className="divide-y divide-gray-100">
        {businesses.map((b) => {
          const own = rules
            .filter((r) => r.business_id === b.id)
            .sort((x, y) => y.effective_from.localeCompare(x.effective_from))
          const current = bookPeriod(own, today)
          const active = own.find((r) => r.effective_from <= today)
          return (
            <li key={b.id} className="space-y-4 p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  {businesses.length > 1 && <p className="font-semibold text-gray-900">{b.name}</p>}
                  <p className="text-sm text-gray-900">{describeRule(active?.start_day ?? 1)}</p>
                  <p className="text-xs text-gray-500">Periode berjalan: {formatRange(current.start, current.end)}</p>
                </div>
                <button
                  onClick={() => setOpenFor(openFor === b.id ? null : b.id)}
                  className="rounded-xl bg-blue-50 px-3.5 py-2 text-sm font-semibold text-blue-800 ring-1 ring-blue-100 transition-colors hover:bg-blue-100"
                >
                  {openFor === b.id ? 'Tutup' : own.length ? 'Ubah Aturan' : 'Atur'}
                </button>
              </div>

              {openFor === b.id && (
                <form
                  action={(fd) =>
                    run(async () => {
                      await saveBookRule(fd)
                      setOpenFor(null)
                    })
                  }
                  className="grid grid-cols-1 items-end gap-3 rounded-xl bg-gray-50/80 p-4 ring-1 ring-gray-100 sm:grid-cols-3"
                >
                  <input type="hidden" name="business_id" value={b.id} />
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Buka buku baru tgl</label>
                    <input
                      type="number"
                      name="start_day"
                      min={1}
                      max={28}
                      required
                      defaultValue={active?.start_day ?? 26}
                      className="rounded-xl border border-gray-200 bg-gray-50/60 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition-colors hover:border-gray-300 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100 w-full"
                    />
                    <p className="text-[11px] text-gray-500 mt-1">26 = tutup buku tgl 25. Isi 1 untuk akhir bulan.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Berlaku mulai</label>
                    <input
                      type="date"
                      name="effective_from"
                      className="rounded-xl border border-gray-200 bg-gray-50/60 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition-colors hover:border-gray-300 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100 w-full"
                    />
                    <p className="text-[11px] text-gray-500 mt-1">
                      Kosongkan = sejak awal. Untuk perubahan, isi tanggal buka buku baru yang pertama.
                    </p>
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl disabled:opacity-50 transition-colors"
                  >
                    {loading && operationKey === 'save' && <LoadingSpinner className="mr-2" />}{loading && operationKey === 'save' ? 'Menyimpan...' : 'Simpan Aturan'}
                  </button>
                </form>
              )}

              {own.length > 0 && (
                <div className="text-xs text-gray-600">
                  <p className="font-medium text-gray-700 mb-1">Riwayat aturan</p>
                  <ul className="space-y-1">
                    {own.map((r) => (
                      <li key={r.id} className="flex items-center gap-2">
                        <span className="w-28 shrink-0 text-gray-500">
                          {r.effective_from <= SINCE_BEGINNING ? 'Sejak awal' : `Mulai ${fmtDate.format(new Date(r.effective_from + 'T00:00:00Z'))}`}
                        </span>
                        <span>{describeRule(r.start_day)}</span>
                        <button
                          title="Hapus aturan"
                          disabled={loading}
                          onClick={() => {
                            if (confirm('Hapus aturan ini? Rekap akan dihitung ulang dengan aturan yang tersisa.')) {
                              run(() => deleteBookRule(r.id), r.id)
                            }
                          }}
                          className="p-1 rounded hover:bg-red-50 text-red-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </li>
          )
        })}
      </ul></DataPanel>
    </div>
  )
}
