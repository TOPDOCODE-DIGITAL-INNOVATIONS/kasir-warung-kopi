'use client'

import { useState } from 'react'
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
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(fn: () => Promise<void>) {
    setLoading(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="p-4 md:p-6 border-b border-gray-100 flex items-start gap-3">
        <CalendarClock className="w-6 h-6 text-blue-600 shrink-0" />
        <div>
          <h2 className="font-semibold text-lg text-gray-900">Periode Tutup Buku</h2>
          <p className="text-xs text-gray-500 mt-1">
            Menentukan cara rekap & kartu &quot;periode ini&quot; dihitung. Saat aturan diganti, periode sebelum tanggal
            berlaku tetap memakai aturan lama, jadi laporan lama tidak berubah.
          </p>
        </div>
      </div>

      {error && <p className="m-4 text-sm text-red-600 bg-red-50 p-3 rounded-lg">{error}</p>}

      <ul className="divide-y divide-gray-100">
        {businesses.map((b) => {
          const own = rules
            .filter((r) => r.business_id === b.id)
            .sort((x, y) => y.effective_from.localeCompare(x.effective_from))
          const current = bookPeriod(own, today)
          const active = own.find((r) => r.effective_from <= today)
          return (
            <li key={b.id} className="p-4 md:p-6 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  {businesses.length > 1 && <p className="font-semibold text-gray-900">{b.name}</p>}
                  <p className="text-sm text-gray-900">{describeRule(active?.start_day ?? 1)}</p>
                  <p className="text-xs text-gray-500">Periode berjalan: {formatRange(current.start, current.end)}</p>
                </div>
                <button
                  onClick={() => setOpenFor(openFor === b.id ? null : b.id)}
                  className="px-3 py-2 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg"
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
                  className="bg-gray-50 rounded-lg p-4 grid grid-cols-1 sm:grid-cols-3 gap-3 items-end"
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
                      className="w-full border-gray-300 rounded-lg p-2.5 border bg-white"
                    />
                    <p className="text-[11px] text-gray-500 mt-1">26 = tutup buku tgl 25. Isi 1 untuk akhir bulan.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Berlaku mulai</label>
                    <input
                      type="date"
                      name="effective_from"
                      className="w-full border-gray-300 rounded-lg p-2.5 border bg-white"
                    />
                    <p className="text-[11px] text-gray-500 mt-1">
                      Kosongkan = sejak awal. Untuk perubahan, isi tanggal buka buku baru yang pertama.
                    </p>
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50"
                  >
                    {loading ? 'Menyimpan...' : 'Simpan Aturan'}
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
                              run(() => deleteBookRule(r.id))
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
      </ul>
    </div>
  )
}
