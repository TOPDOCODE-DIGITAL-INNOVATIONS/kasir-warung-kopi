'use client'

import LoadingSpinner from '@/components/LoadingSpinner'
import DataPanel from '@/components/DataPanel'
import { useDataLoading } from '@/components/DataLoadingContext'

import { useState, useTransition } from 'react'
import { Edit, Trash2 } from 'lucide-react'
import { rupiah } from '@/lib/format'
import { formatMoney, parseMoney } from '@/lib/money'
import { anchorDate, bookPeriod, formatRange } from '@/lib/book-period'
import type { Rule } from './BookRulesClient'
import { saveSummary, deleteSummary } from './actions'

type Entry = {
  id: string
  business_id: string
  period: 'day' | 'month'
  date: string
  sales: number
  expenses: number
  overpay: number
  note: string | null
  businessName: string
}

const dayFmt = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeZone: 'UTC' })
const monthFmt = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' })

function formatPeriod(e: Pick<Entry, 'period' | 'date'>) {
  return e.period === 'month'
    ? monthFmt.format(new Date(e.date + '-01T00:00:00Z'))
    : dayFmt.format(new Date(e.date + 'T00:00:00Z'))
}

/** Input nominal; boleh ditempel dari buku/Excel (7,419,797.28), dirapikan saat selesai mengetik. */
function MoneyInput({ name, defaultValue }: { name: string; defaultValue?: number }) {
  const [value, setValue] = useState(defaultValue ? formatMoney(defaultValue) : '')
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">Rp</span>
      <input
        name={name}
        inputMode="decimal"
        placeholder="0"
        value={value}
        onChange={(e) => setValue(e.target.value.replace(/[^\d.,]/g, ''))}
        onBlur={() => {
          const n = parseMoney(value)
          setValue(value && Number.isFinite(n) ? formatMoney(n) : '')
        }}
        className="rounded-xl border border-gray-200 bg-gray-50/60 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition-colors hover:border-gray-300 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100 w-full pl-10 text-right"
      />
    </div>
  )
}

/** Menampilkan periode buku tujuan agar owner yakin data masuk ke periode yang benar. */
function PeriodPreview({ rules, businessId, date }: { rules: Rule[]; businessId: string; date: string }) {
  if (!date) return null
  const p = bookPeriod(
    rules.filter((r) => r.business_id === businessId),
    anchorDate(date)
  )
  return (
    <p className="text-xs text-blue-700 bg-blue-50 rounded-md px-2 py-1 mt-1">
      Masuk ke periode buku {formatRange(p.start, p.end)}
    </p>
  )
}

export default function HistoryClient({
  rules,
  businesses,
  defaultBusinessId,
  entries,
}: {
  rules: Rule[]
  businesses: { id: string; name: string }[]
  defaultBusinessId: string
  entries: Entry[]
}) {
  const [period, setPeriod] = useState<'day' | 'month'>('month')
  const [editing, setEditing] = useState<Entry | null>(null)
  const [loading, startTransition] = useTransition()
  const routePending = useDataLoading()
  const [operationKey, setOperationKey] = useState('save')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [formKey, setFormKey] = useState(0)
  const [pickedBusiness, setPickedBusiness] = useState(defaultBusinessId)
  const [pickedDate, setPickedDate] = useState('')

  const activePeriod = editing?.period ?? period

  function run(fn: () => Promise<void>, key = 'save') {
    setOperationKey(key)
    setError(null)
    setSaved(null)
    return new Promise<void>(resolve => {
      startTransition(async () => {
        try { await fn() } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
        finally { resolve() }
      })
    })
  }

  if (businesses.length === 0) {
    return (
      <p className="text-sm text-gray-600 bg-white border border-gray-200/70 rounded-2xl p-6">
        Buat cabang dulu di menu Cabang & Token sebelum memasukkan data lama.
      </p>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
      <div className="lg:col-span-2 self-start rounded-2xl border border-gray-200/70 bg-white p-5 shadow-sm sm:p-6 lg:sticky lg:top-4">
        <h2 className="font-semibold text-[15px] text-gray-900 mb-4">{editing ? 'Ubah Data Lama' : 'Tambah Data Lama'}</h2>

        <form
          key={editing?.id ?? `new-${activePeriod}-${formKey}`}
          action={(formData) =>
            run(async () => {
              await saveSummary(formData)
              setSaved(`Tersimpan: ${formatPeriod({ period: activePeriod, date: String(formData.get('date')) })}`)
              setEditing(null)
              setFormKey((k) => k + 1)
              setPickedDate('')
            })
          }
          className="space-y-4"
        >
          <input type="hidden" name="period" value={activePeriod} />

          <div className="grid grid-cols-2 gap-1 rounded-xl bg-gray-100 p-1">
            {(['month', 'day'] as const).map((p) => (
              <button
                key={p}
                type="button"
                disabled={!!editing}
                onClick={() => {
                  setPeriod(p)
                  setPickedDate('')
                }}
                className={
                  'py-2 text-sm rounded-lg font-medium transition-colors disabled:cursor-not-allowed ' +
                  (activePeriod === p ? 'bg-white shadow-sm text-blue-700' : 'text-gray-600')
                }
              >
                {p === 'month' ? 'Per Bulan' : 'Per Hari'}
              </button>
            ))}
          </div>

          <div className={businesses.length > 1 ? 'grid grid-cols-2 gap-3' : ''}>
            {businesses.length > 1 ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cabang</label>
                <select
                  name="business_id"
                  defaultValue={editing?.business_id ?? defaultBusinessId}
                  onChange={(e) => setPickedBusiness(e.target.value)}
                  disabled={!!editing}
                  className="rounded-xl border border-gray-200 bg-gray-50/60 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition-colors hover:border-gray-300 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100 w-full"
                >
                  {businesses.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
                {editing && <input type="hidden" name="business_id" value={editing.business_id} />}
              </div>
            ) : (
              <input type="hidden" name="business_id" value={businesses[0].id} />
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {activePeriod === 'month' ? 'Bulan' : 'Tanggal'}
              </label>
              <input
                type={activePeriod === 'month' ? 'month' : 'date'}
                name="date"
                required
                readOnly={!!editing}
                defaultValue={editing?.date}
                onChange={(e) => setPickedDate(e.target.value)}
                className="rounded-xl border border-gray-200 bg-gray-50/60 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition-colors hover:border-gray-300 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100 w-full"
              />
              <PeriodPreview
                rules={rules}
                businessId={editing?.business_id ?? (businesses.length > 1 ? pickedBusiness : businesses[0].id)}
                date={editing?.date ?? pickedDate}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Total Penjualan</label>
            <MoneyInput name="sales" defaultValue={editing?.sales} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Total Pengeluaran</label>
            <MoneyInput name="expenses" defaultValue={editing?.expenses} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Kelebihan <span className="font-normal text-gray-400">(kembalian permen, opsional)</span>
            </label>
            <MoneyInput name="overpay" defaultValue={editing?.overpay} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Catatan (opsional)</label>
            <input
              name="note"
              defaultValue={editing?.note ?? ''}
              placeholder="mis. dari buku kas"
              className="rounded-xl border border-gray-200 bg-gray-50/60 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition-colors hover:border-gray-300 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100 w-full"
            />
          </div>

          <p className="text-xs text-gray-500">
            Isi data yang sama (cabang + {activePeriod === 'month' ? 'bulan' : 'tanggal'}) lagi akan menimpa data
            sebelumnya, bukan menambah. Jangan isi bulan yang juga sudah diisi per hari agar tidak terhitung dua kali.
          </p>

          {error && <p className="text-sm text-red-700 bg-red-50 p-3 rounded-xl border border-red-100">{error}</p>}
          {saved && <p className="text-sm text-emerald-800 bg-emerald-50 p-3 rounded-xl border border-emerald-100">{saved}</p>}

          <div className="flex justify-end gap-3">
            {editing && (
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-200 rounded-xl"
              >
                Batal
              </button>
            )}
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl disabled:opacity-50 transition-colors"
            >
              {loading && operationKey === 'save' && <LoadingSpinner className="mr-2" />}{loading && operationKey === 'save' ? 'Menyimpan...' : 'Simpan'}
            </button>
          </div>
        </form>
      </div>

      <div className="lg:col-span-3 bg-white rounded-2xl shadow-sm border border-gray-200/70 overflow-hidden">
        <div className="px-5 py-4 sm:px-6 border-b border-gray-100">
          <h2 className="font-semibold text-[15px] text-gray-900">Data Lama Tersimpan</h2>
        </div>
        <DataPanel loading={loading || routePending} label="Memuat data lama..."><div className="overflow-x-auto max-h-[32rem]">
          <table className="w-full text-left text-sm text-gray-600">
            <thead className="bg-gray-50 text-[11px] uppercase text-gray-500 sticky top-0 tracking-[0.08em] border-b border-gray-100">
              <tr>
                <th className="px-5 py-3 font-semibold">Periode</th>
                {businesses.length > 1 && <th className="px-5 py-3 font-semibold">Cabang</th>}
                <th className="px-5 py-3 font-semibold text-right">Penjualan</th>
                <th className="px-5 py-3 font-semibold text-right">Pengeluaran</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                    Belum ada data lama.
                  </td>
                </tr>
              ) : (
                entries.map((e) => (
                  <tr key={e.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-gray-900">{formatPeriod(e)}</span>
                      <span className="ml-2 text-xs text-gray-400">{e.period === 'month' ? 'bulanan' : 'harian'}</span>
                      {e.note && <p className="text-xs text-gray-400 truncate max-w-[14rem]">{e.note}</p>}
                    </td>
                    {businesses.length > 1 && <td className="px-4 py-3">{e.businessName}</td>}
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {rupiah(e.sales)}
                      {e.overpay > 0 && <p className="text-xs text-green-700">termasuk kelebihan {rupiah(e.overpay)}</p>}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">{rupiah(e.expenses)}</td>
                    <td className="px-2 py-3 whitespace-nowrap text-right">
                      <button
                        title="Ubah"
                        onClick={() => {
                          setEditing(e)
                          setSaved(null)
                          setError(null)
                        }}
                        className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-blue-50 hover:text-blue-700"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        title="Hapus"
                        disabled={loading}
                        onClick={() => {
                          if (confirm(`Hapus data ${formatPeriod(e)}?`)) run(() => deleteSummary(e.id), e.id)
                        }}
                        className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div></DataPanel>
      </div>
    </div>
  )
}
