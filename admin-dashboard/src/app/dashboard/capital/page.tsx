import DataPanel from '@/components/DataPanel'
import LoadingLink from '@/components/LoadingLink'
import { EMPTY_BUSINESS_ID, getBusinessContext } from '@/lib/business-context'
import { formatRange } from '@/lib/book-period'
import { dayKey, rupiah } from '@/lib/format'
import PrintButton from '../recap/PrintButton'
import CapitalClient from './CapitalClient'
import MonthFilter, { type MonthOption, type Preset } from './MonthFilter'
import PaybackChart from './PaybackChart'
import {
  filterRows, monthLabel, resolveMonthFilter, shiftMonth, sumRows, summarizeCapital,
  type CapitalEntry, type MonthRow, type RecapPeriod,
} from './domain'

const pct = (v: number | null) => (v === null ? '-' : `${(v * 100).toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`)
const shortMonth = new Intl.DateTimeFormat('id-ID', { month: 'short', year: '2-digit', timeZone: 'UTC' })
const fmtDate = new Intl.DateTimeFormat('id-ID', { dateStyle: 'long', timeZone: 'UTC' })

export default async function CapitalPage({ searchParams }: { searchParams: Promise<{ from?: string | string[]; to?: string | string[] }> }) {
  const sp = await searchParams
  const { supabase, businessId, businesses } = await getBusinessContext()
  const scoped = businessId ?? EMPTY_BUSINESS_ID
  const today = dayKey(new Date())

  const [capRes, recapRes] = await Promise.all([
    supabase.from('capital_entries').select('id, date, kind, amount, note').eq('business_id', scoped).order('date', { ascending: false }).limit(1000),
    businessId ? supabase.rpc('book_recap', { p_business: businessId, p_limit: 600 }) : Promise.resolve({ data: [], error: null }),
  ])
  const capital = (capRes.data ?? []) as CapitalEntry[]
  const loadError = capRes.error
    ? `Gagal memuat data modal: ${capRes.error.message}. Pastikan migration terbaru (capital_entries) sudah dijalankan.`
    : recapRes.error?.message ?? null

  const s = summarizeCapital((recapRes.data ?? []) as RecapPeriod[], capital, today)
  const filter = resolveMonthFilter(sp.from, sp.to)
  const filtered = filterRows(s.rows, filter)
  const ft = sumRows(filtered)
  const isFiltered = Boolean(filter.from || filter.to)

  const thisMonth = today.slice(0, 7)
  const year = today.slice(0, 4)
  const presets: Preset[] = [
    { label: 'Semua', from: '', to: '' },
    { label: 'Bulan ini', from: thisMonth, to: thisMonth },
    { label: '3 bulan terakhir', from: shiftMonth(thisMonth, -2), to: thisMonth },
    { label: '6 bulan terakhir', from: shiftMonth(thisMonth, -5), to: thisMonth },
    { label: '12 bulan terakhir', from: shiftMonth(thisMonth, -11), to: thisMonth },
    { label: `Tahun ${year}`, from: `${year}-01`, to: `${year}-12` },
    { label: `Tahun ${Number(year) - 1}`, from: `${Number(year) - 1}-01`, to: `${Number(year) - 1}-12` },
  ]
  const monthSet = new Set([...s.rows.map((r) => r.month), thisMonth, filter.from, filter.to].filter(Boolean))
  const months: MonthOption[] = [...monthSet].sort().reverse().map((m) => ({ value: m, label: monthLabel(m) }))

  const bizName = businesses.find((b) => b.id === businessId)?.name ?? 'Belum ada cabang'
  const progress = s.payback === null ? 0 : Math.min(Math.max(s.payback, 0), 1)
  const avgIncome = s.totals.months ? s.totals.income / s.totals.months : 0
  const filterText = !isFiltered
    ? 'Sejak awal'
    : `${filter.from ? monthLabel(filter.from) : 'Awal'} – ${filter.to ? monthLabel(filter.to) : 'sekarang'}`
  const chartRows = isFiltered ? filtered : s.rows

  return (
    <div className="max-w-7xl space-y-6">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Modal & Balik Modal</h1>
          <p className="mt-1 text-sm text-gray-500">
            {bizName}
            {s.firstDate && <> · data sejak {fmtDate.format(new Date(`${s.firstDate}T00:00:00Z`))}</>}
          </p>
        </div>
        <div className="print:hidden"><PrintButton /></div>
      </div>

      {loadError && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{loadError}</p>}

      {/* Progres balik modal */}
      <DataPanel className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        {s.capital === 0 ? (
          <div>
            <h2 className="font-bold text-gray-900">Progres Balik Modal</h2>
            <p className="mt-1 text-sm text-gray-500">
              Belum ada modal yang dicatat. Tambahkan <b>modal awal</b> di bawah untuk melihat berapa persen modal Anda sudah kembali.
              Laba bersih sejak awal saat ini: <b className={s.totals.profit < 0 ? 'text-red-600' : 'text-green-700'}>{rupiah(s.totals.profit)}</b>.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-bold text-gray-900">Progres Balik Modal</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Laba bersih sejak awal {rupiah(s.totals.profit)} dari modal {rupiah(s.capital)}
                </p>
              </div>
              <p className={'text-3xl font-bold ' + (s.surplus > 0 || s.remaining === 0 ? 'text-green-700' : 'text-blue-700')}>{pct(s.payback)}</p>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-gray-100" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} aria-label="Progres balik modal">
              <div className={'h-full rounded-full ' + (progress >= 1 ? 'bg-green-600' : 'bg-blue-600')} style={{ width: `${Math.max(progress * 100, progress > 0 ? 1 : 0)}%` }} />
            </div>
            <p className="text-sm text-gray-700">
              {s.remaining === 0 ? (
                <>
                  🎉 <b>Sudah balik modal</b>
                  {s.paybackRow && <> pada {monthLabel(s.paybackRow.month)}</>}. Keuntungan di atas modal: <b className="text-green-700">{rupiah(s.surplus)}</b>.
                </>
              ) : (
                <>
                  Butuh laba <b>{rupiah(s.remaining)}</b> lagi untuk balik modal.{' '}
                  {s.monthsToPayback !== null ? (
                    <>
                      Dengan rata-rata laba {rupiah(Math.round(s.avgRecentProfit ?? 0))}/bulan ({s.recentMonths} bulan terakhir), perkiraan
                      balik modal sekitar <b>{s.monthsToPayback} bulan lagi</b> ({monthLabel(shiftMonth(thisMonth, s.monthsToPayback))}).
                    </>
                  ) : s.avgRecentProfit !== null && s.avgRecentProfit <= 0 ? (
                    <span className="text-red-600">Rata-rata laba bulan-bulan terakhir belum positif, jadi belum bisa diperkirakan.</span>
                  ) : (
                    <span className="text-gray-500">Perkiraan muncul setelah ada minimal 1 bulan yang selesai.</span>
                  )}
                </>
              )}
            </p>
          </div>
        )}
      </DataPanel>

      {/* Ringkasan sejak awal */}
      <section aria-labelledby="alltime-title" className="space-y-3">
        <h2 id="alltime-title" className="text-sm font-semibold uppercase tracking-wide text-gray-500">Sejak awal usaha</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Total Modal" value={rupiah(s.capital)} hint={`${capital.length} catatan`} />
          <Stat label="Total Omzet" value={rupiah(s.totals.income)} hint={`${s.totals.txCount.toLocaleString('id-ID')} transaksi · ${s.totals.months} bulan`} />
          <Stat label="Total Pengeluaran" value={rupiah(s.totals.expenses)} tone="text-red-600" hint="Operasional & bahan" />
          <Stat label={s.totals.profit >= 0 ? 'Laba Bersih' : 'Rugi Bersih'} value={rupiah(s.totals.profit)} tone={s.totals.profit >= 0 ? 'text-green-700' : 'text-red-600'}
            hint={s.totals.income > 0 ? `Margin ${pct(s.totals.profit / s.totals.income)}` : '-'} />
          <Stat label="Rata-rata Omzet / Bulan" value={rupiah(Math.round(avgIncome))} hint={`dari ${s.totals.months} bulan`} />
          <Stat label="Rata-rata Laba / Bulan" value={s.avgRecentProfit === null ? '-' : rupiah(Math.round(s.avgRecentProfit))} hint={`${s.recentMonths} bulan selesai terakhir`} />
          <Stat label="Bulan Terbaik" value={s.bestMonth ? monthLabel(s.bestMonth.month) : '-'} hint={s.bestMonth ? `Laba ${rupiah(s.bestMonth.profit)}` : '-'} />
          <Stat label="Bulan Terendah" value={s.worstMonth ? monthLabel(s.worstMonth.month) : '-'} hint={s.worstMonth ? `Laba ${rupiah(s.worstMonth.profit)}` : '-'} />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <CapitalClient key={businessId ?? 'none'} businessId={businessId ?? ''} entries={capital} today={today} />
        </div>
        <DataPanel className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm lg:col-span-3">
          <h2 className="font-bold text-gray-900">Omzet, Laba & Posisi Modal</h2>
          <p className="mb-3 text-xs text-gray-500">Garis hijau melewati garis merah = sudah balik modal. {isFiltered && `Periode: ${filterText}.`}</p>
          <PaybackChart
            data={chartRows.map((r) => ({
              label: shortMonth.format(new Date(`${r.month}-01T00:00:00Z`)),
              income: r.income, profit: r.profit, cumProfit: r.cumProfit, cumCapital: r.cumCapital,
            }))}
          />
        </DataPanel>
      </div>

      <MonthFilter months={months} from={filter.from} to={filter.to} presets={presets} />

      {/* Ringkasan periode terpilih */}
      <section aria-labelledby="filtered-title" className="space-y-3">
        <h2 id="filtered-title" className="text-sm font-semibold uppercase tracking-wide text-gray-500">Rekap {filterText}</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Stat label="Omzet" value={rupiah(ft.income)} hint={`${ft.txCount.toLocaleString('id-ID')} transaksi`} />
          <Stat label="Pengeluaran" value={rupiah(ft.expenses)} tone="text-red-600" hint={`${ft.months} bulan`} />
          <Stat label={ft.profit >= 0 ? 'Laba' : 'Rugi'} value={rupiah(ft.profit)} tone={ft.profit >= 0 ? 'text-green-700' : 'text-red-600'}
            hint={ft.income > 0 ? `Margin ${pct(ft.profit / ft.income)}` : '-'} />
          <Stat label="Rata-rata Laba / Bulan" value={ft.months ? rupiah(Math.round(ft.profit / ft.months)) : '-'} hint={ft.months ? `Omzet ${rupiah(Math.round(ft.income / ft.months))}/bln` : '-'} />
          <Stat label="Modal Masuk" value={rupiah(ft.capitalIn)} hint={s.capital > 0 ? `Laba ini = ${pct(ft.profit / s.capital)} dari modal` : 'Belum ada modal'} />
        </div>
      </section>

      <MonthTable rows={[...filtered].reverse()} totals={ft} />
    </div>
  )
}

function MonthTable({ rows, totals }: { rows: MonthRow[]; totals: ReturnType<typeof sumRows> }) {
  return (
    <DataPanel className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
      <div className="px-5 pb-3 pt-5">
        <h2 className="font-bold text-gray-900">Rincian per Bulan</h2>
        <p className="text-xs text-gray-500">Bulan mengikuti periode tutup buku. Klik bulan untuk melihat rekap lengkapnya.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium">Bulan</th>
              <th className="px-4 py-2.5 text-right font-medium">Trx</th>
              <th className="px-4 py-2.5 text-right font-medium">Penjualan</th>
              <th className="px-4 py-2.5 text-right font-medium">Lain-lain*</th>
              <th className="px-4 py-2.5 text-right font-medium">Omzet</th>
              <th className="px-4 py-2.5 text-right font-medium">Pengeluaran</th>
              <th className="px-4 py-2.5 text-right font-medium">Laba</th>
              <th className="px-4 py-2.5 text-right font-medium">Margin</th>
              <th className="px-4 py-2.5 text-right font-medium">Modal Masuk</th>
              <th className="px-4 py-2.5 text-right font-medium">Laba Kumulatif</th>
              <th className="px-4 py-2.5 text-right font-medium">Balik Modal</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 && (
              <tr><td colSpan={11} className="px-4 py-8 text-center text-gray-400">Tidak ada data pada bulan yang dipilih.</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.start} className="text-gray-700">
                <td className="whitespace-nowrap px-4 py-2">
                  <LoadingLink href={`/dashboard/recap?${new URLSearchParams({ p: `${r.start}_${r.end}` })}`} className="font-medium text-blue-700 hover:underline">
                    {monthLabel(r.month)}
                  </LoadingLink>
                  {r.running && <span className="ml-1.5 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">berjalan</span>}
                  <span className="block text-[11px] text-gray-400">{formatRange(r.start, r.end)}</span>
                </td>
                <td className="px-4 py-2 text-right">{r.txCount.toLocaleString('id-ID')}</td>
                <td className="whitespace-nowrap px-4 py-2 text-right">{rupiah(r.salesPos)}</td>
                <td className="whitespace-nowrap px-4 py-2 text-right text-gray-500">{r.overpay + r.salesManual ? rupiah(r.overpay + r.salesManual) : '-'}</td>
                <td className="whitespace-nowrap px-4 py-2 text-right font-medium text-gray-900">{rupiah(r.income)}</td>
                <td className="whitespace-nowrap px-4 py-2 text-right text-red-600">{rupiah(r.expenses)}</td>
                <td className={'whitespace-nowrap px-4 py-2 text-right font-semibold ' + (r.profit < 0 ? 'text-red-600' : 'text-green-700')}>{rupiah(r.profit)}</td>
                <td className="px-4 py-2 text-right text-gray-500">{r.income > 0 ? pct(r.profit / r.income) : '-'}</td>
                <td className="whitespace-nowrap px-4 py-2 text-right">{r.capitalIn ? rupiah(r.capitalIn) : '-'}</td>
                <td className={'whitespace-nowrap px-4 py-2 text-right ' + (r.cumProfit < 0 ? 'text-red-600' : 'text-gray-900')}>{rupiah(r.cumProfit)}</td>
                <td className={'whitespace-nowrap px-4 py-2 text-right font-medium ' + (r.payback !== null && r.payback >= 1 ? 'text-green-700' : 'text-gray-900')}>
                  {pct(r.payback)}
                </td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="bg-gray-50 font-semibold text-gray-900">
              <tr>
                <td className="px-4 py-2.5">Total ({totals.months} bulan)</td>
                <td className="px-4 py-2.5 text-right">{totals.txCount.toLocaleString('id-ID')}</td>
                <td className="whitespace-nowrap px-4 py-2.5 text-right">{rupiah(totals.salesPos)}</td>
                <td className="whitespace-nowrap px-4 py-2.5 text-right">{rupiah(totals.overpay + totals.salesManual)}</td>
                <td className="whitespace-nowrap px-4 py-2.5 text-right">{rupiah(totals.income)}</td>
                <td className="whitespace-nowrap px-4 py-2.5 text-right text-red-600">{rupiah(totals.expenses)}</td>
                <td className={'whitespace-nowrap px-4 py-2.5 text-right ' + (totals.profit < 0 ? 'text-red-600' : 'text-green-700')}>{rupiah(totals.profit)}</td>
                <td className="px-4 py-2.5 text-right">{totals.income > 0 ? pct(totals.profit / totals.income) : '-'}</td>
                <td className="whitespace-nowrap px-4 py-2.5 text-right">{rupiah(totals.capitalIn)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <p className="px-5 py-3 text-[11px] text-gray-400">
        * Lain-lain = kelebihan bayar (kembalian tidak diambil) + data lama yang diinput manual. Transaksi batal tidak dihitung.
      </p>
    </DataPanel>
  )
}

function Stat({ label, value, hint, tone = 'text-gray-900' }: { label: string; value: string; hint: string; tone?: string }) {
  return (
    <DataPanel compact className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className={`mt-1 truncate text-lg font-bold sm:text-xl ${tone}`}>{value}</p>
      <p className="mt-0.5 truncate text-[11px] text-gray-400">{hint}</p>
    </DataPanel>
  )
}
