import DataPanel from '@/components/DataPanel'
import InfoTip from '@/components/InfoTip'
import { PiggyBank } from 'lucide-react'
import { Badge, Notice, PageHeader, Panel, ui } from '@/components/ui'
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
    <div className="space-y-6">
      <PageHeader eyebrow="Penjualan & Keuangan" title="Modal & Balik Modal"
        description={<><span className="font-medium text-gray-700">{bizName}</span>{s.firstDate && <> · data sejak {fmtDate.format(new Date(`${s.firstDate}T00:00:00Z`))}</>}</>}
        actions={<PrintButton />} />

      {loadError && <Notice tone="error">{loadError}</Notice>}

      {/* Progres balik modal */}
      <DataPanel className="relative overflow-hidden rounded-3xl bg-espresso-900 p-6 text-white shadow-lg sm:p-8">
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-28 h-80 w-80 rounded-full bg-champagne/20 blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-champagne ring-1 ring-white/10">
              <PiggyBank aria-hidden="true" className="h-3.5 w-3.5" /> Progres Balik Modal
            </span>
            <InfoTip tone="dark" label="Progres balik modal" text="Persentase laba bersih sejak awal usaha dibandingkan total modal yang dicatat." />
          </div>
          {s.capital === 0 ? (
            <p className="mt-5 max-w-2xl text-sm leading-relaxed text-gray-300">
              Belum ada modal yang dicatat. Tambahkan <b className="text-white">modal awal</b> di bawah untuk melihat berapa persen modal Anda sudah kembali.
              Laba bersih sejak awal saat ini: <b className={s.totals.profit < 0 ? 'text-red-300' : 'text-champagne'}>{rupiah(s.totals.profit)}</b>.
            </p>
          ) : (
            <div className="mt-5 grid gap-6 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-end">
              <div>
                <p className={'font-display text-6xl font-semibold tabular-nums ' + (s.surplus > 0 || s.remaining === 0 ? 'text-emerald-300' : 'text-champagne')}>{pct(s.payback)}</p>
                <p className="mt-2 text-sm text-gray-400">Laba {rupiah(s.totals.profit)} dari modal {rupiah(s.capital)}</p>
              </div>
              <div className="space-y-3">
                <div className="h-2.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} aria-label="Progres balik modal">
                  <div className={'h-full rounded-full ' + (progress >= 1 ? 'bg-emerald-400' : 'bg-linear-to-r from-[#a88340] to-champagne')} style={{ width: `${Math.max(progress * 100, progress > 0 ? 1 : 0)}%` }} />
                </div>
                <p className="text-sm leading-relaxed text-gray-300">
                  {s.remaining === 0 ? (
                    <>
                      <b className="text-white">Sudah balik modal</b>
                      {s.paybackRow && <> pada {monthLabel(s.paybackRow.month)}</>}. Keuntungan di atas modal: <b className="text-emerald-300">{rupiah(s.surplus)}</b>.
                    </>
                  ) : (
                    <>
                      Butuh laba <b className="text-white">{rupiah(s.remaining)}</b> lagi untuk balik modal.{' '}
                      {s.monthsToPayback !== null ? (
                        <>
                          Dengan rata-rata laba {rupiah(Math.round(s.avgRecentProfit ?? 0))}/bulan ({s.recentMonths} bulan terakhir), perkiraan
                          balik modal sekitar <b className="text-champagne">{s.monthsToPayback} bulan lagi</b> ({monthLabel(shiftMonth(thisMonth, s.monthsToPayback))}).
                        </>
                      ) : s.avgRecentProfit !== null && s.avgRecentProfit <= 0 ? (
                        <span className="text-red-300">Rata-rata laba bulan-bulan terakhir belum positif, jadi belum bisa diperkirakan.</span>
                      ) : (
                        <span className="text-gray-400">Perkiraan muncul setelah ada minimal 1 bulan yang selesai.</span>
                      )}
                    </>
                  )}
                </p>
              </div>
            </div>
          )}
        </div>
      </DataPanel>

      <StatGrid title="Sejak awal usaha" info="Akumulasi seluruh data sejak transaksi atau catatan pertama." items={[
        { label: 'Total Modal', value: rupiah(s.capital), hint: `${capital.length} catatan` },
        { label: 'Total Omzet', value: rupiah(s.totals.income), hint: `${s.totals.txCount.toLocaleString('id-ID')} transaksi · ${s.totals.months} bulan` },
        { label: 'Total Pengeluaran', value: rupiah(s.totals.expenses), tone: 'text-red-600', hint: 'Operasional & bahan' },
        { label: s.totals.profit >= 0 ? 'Laba Bersih' : 'Rugi Bersih', value: rupiah(s.totals.profit), tone: s.totals.profit >= 0 ? 'text-emerald-700' : 'text-red-600',
          hint: s.totals.income > 0 ? `Margin ${pct(s.totals.profit / s.totals.income)}` : '-' },
        { label: 'Rata-rata Omzet / Bulan', value: rupiah(Math.round(avgIncome)), hint: `dari ${s.totals.months} bulan` },
        { label: 'Rata-rata Laba / Bulan', value: s.avgRecentProfit === null ? '-' : rupiah(Math.round(s.avgRecentProfit)), hint: `${s.recentMonths} bulan selesai terakhir` },
        { label: 'Bulan Terbaik', value: s.bestMonth ? monthLabel(s.bestMonth.month) : '-', hint: s.bestMonth ? `Laba ${rupiah(s.bestMonth.profit)}` : '-' },
        { label: 'Bulan Terendah', value: s.worstMonth ? monthLabel(s.worstMonth.month) : '-', hint: s.worstMonth ? `Laba ${rupiah(s.worstMonth.profit)}` : '-' },
      ]} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <CapitalClient key={businessId ?? 'none'} businessId={businessId ?? ''} entries={capital} today={today} />
        </div>
        <Panel data className="lg:col-span-3" title="Omzet, Laba & Posisi Modal"
          info="Batang: omzet & laba per bulan. Garis hijau: laba kumulatif. Garis merah putus-putus: total modal."
          description={<>Garis hijau melewati garis merah = sudah balik modal. {isFiltered && `Periode: ${filterText}.`}</>}>
          <PaybackChart
            data={chartRows.map((r) => ({
              label: shortMonth.format(new Date(`${r.month}-01T00:00:00Z`)),
              income: r.income, profit: r.profit, cumProfit: r.cumProfit, cumCapital: r.cumCapital,
            }))}
          />
        </Panel>
      </div>

      <MonthFilter months={months} from={filter.from} to={filter.to} presets={presets} />

      <StatGrid title={`Rekap ${filterText}`} info="Ringkasan sesuai filter bulan di atas." items={[
        { label: 'Omzet', value: rupiah(ft.income), hint: `${ft.txCount.toLocaleString('id-ID')} transaksi` },
        { label: 'Pengeluaran', value: rupiah(ft.expenses), tone: 'text-red-600', hint: `${ft.months} bulan` },
        { label: ft.profit >= 0 ? 'Laba' : 'Rugi', value: rupiah(ft.profit), tone: ft.profit >= 0 ? 'text-emerald-700' : 'text-red-600',
          hint: ft.income > 0 ? `Margin ${pct(ft.profit / ft.income)}` : '-' },
        { label: 'Rata-rata Laba / Bulan', value: ft.months ? rupiah(Math.round(ft.profit / ft.months)) : '-', hint: ft.months ? `Omzet ${rupiah(Math.round(ft.income / ft.months))}/bln` : '-' },
        { label: 'Modal Masuk', value: rupiah(ft.capitalIn), hint: s.capital > 0 ? `Laba ini = ${pct(ft.profit / s.capital)} dari modal` : 'Belum ada modal' },
      ]} />

      <MonthTable rows={[...filtered].reverse()} totals={ft} />
    </div>
  )
}

function MonthTable({ rows, totals }: { rows: MonthRow[]; totals: ReturnType<typeof sumRows> }) {
  return (
    <Panel data className="overflow-hidden" title="Rincian per Bulan" bodyClassName=""
      description="Bulan mengikuti periode tutup buku. Klik bulan untuk melihat rekap lengkapnya.">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-100 bg-gray-50/70 text-[11px] uppercase tracking-[0.08em] text-gray-500">
            <tr>
              <th className="px-4 py-3.5 text-left font-semibold">Bulan</th>
              <th className="px-4 py-3.5 text-right font-semibold">Trx</th>
              <th className="px-4 py-3.5 text-right font-semibold">Penjualan</th>
              <th className="px-4 py-3.5 text-right font-semibold">Lain-lain*</th>
              <th className="px-4 py-3.5 text-right font-semibold">Omzet</th>
              <th className="px-4 py-3.5 text-right font-semibold">Pengeluaran</th>
              <th className="px-4 py-3.5 text-right font-semibold">Laba</th>
              <th className="px-4 py-3.5 text-right font-semibold">Margin</th>
              <th className="px-4 py-3.5 text-right font-semibold">Modal Masuk</th>
              <th className="px-4 py-3.5 text-right font-semibold">Laba Kumulatif</th>
              <th className="px-4 py-3.5 text-right font-semibold">Balik Modal</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 && (
              <tr><td colSpan={11} className="px-4 py-8 text-center text-gray-400">Tidak ada data pada bulan yang dipilih.</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.start} className="text-gray-700 transition-colors hover:bg-blue-50/30">
                <td className="whitespace-nowrap px-4 py-3">
                  <LoadingLink href={`/dashboard/recap?${new URLSearchParams({ p: `${r.start}_${r.end}` })}`} className="font-medium text-blue-700 hover:underline">
                    {monthLabel(r.month)}
                  </LoadingLink>
                  {r.running && <Badge tone="gold" className="ml-1.5">berjalan</Badge>}
                  <span className="block text-[11px] text-gray-400">{formatRange(r.start, r.end)}</span>
                </td>
                <td className="px-4 py-3 text-right">{r.txCount.toLocaleString('id-ID')}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right">{rupiah(r.salesPos)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-gray-500">{r.overpay + r.salesManual ? rupiah(r.overpay + r.salesManual) : '-'}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-gray-900">{rupiah(r.income)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-red-600">{rupiah(r.expenses)}</td>
                <td className={'whitespace-nowrap px-4 py-3 text-right font-semibold ' + (r.profit < 0 ? 'text-red-600' : 'text-green-700')}>{rupiah(r.profit)}</td>
                <td className="px-4 py-3 text-right text-gray-500">{r.income > 0 ? pct(r.profit / r.income) : '-'}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right">{r.capitalIn ? rupiah(r.capitalIn) : '-'}</td>
                <td className={'whitespace-nowrap px-4 py-3 text-right ' + (r.cumProfit < 0 ? 'text-red-600' : 'text-gray-900')}>{rupiah(r.cumProfit)}</td>
                <td className={'whitespace-nowrap px-4 py-3 text-right font-medium ' + (r.payback !== null && r.payback >= 1 ? 'text-green-700' : 'text-gray-900')}>
                  {pct(r.payback)}
                </td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="border-t border-gray-200 bg-gray-50/80 font-semibold text-gray-900">
              <tr>
                <td className="px-4 py-3.5">Total ({totals.months} bulan)</td>
                <td className="px-4 py-3.5 text-right">{totals.txCount.toLocaleString('id-ID')}</td>
                <td className="whitespace-nowrap px-4 py-3.5 text-right">{rupiah(totals.salesPos)}</td>
                <td className="whitespace-nowrap px-4 py-3.5 text-right">{rupiah(totals.overpay + totals.salesManual)}</td>
                <td className="whitespace-nowrap px-4 py-3.5 text-right">{rupiah(totals.income)}</td>
                <td className="whitespace-nowrap px-4 py-3.5 text-right text-red-600">{rupiah(totals.expenses)}</td>
                <td className={'whitespace-nowrap px-4 py-3.5 text-right ' + (totals.profit < 0 ? 'text-red-600' : 'text-green-700')}>{rupiah(totals.profit)}</td>
                <td className="px-4 py-3.5 text-right">{totals.income > 0 ? pct(totals.profit / totals.income) : '-'}</td>
                <td className="whitespace-nowrap px-4 py-3.5 text-right">{rupiah(totals.capitalIn)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <p className="px-5 py-3 text-[11px] text-gray-400">
        * Lain-lain = kelebihan bayar (kembalian tidak diambil) + data lama yang diinput manual. Transaksi batal tidak dihitung.
      </p>
    </Panel>
  )
}

function StatGrid({ title, info, items }: {
  title: string; info: string; items: { label: string; value: string; hint: string; tone?: string }[]
}) {
  return (
    <DataPanel className={`${ui.panel} overflow-hidden`}>
      <div className="flex items-center gap-1.5 border-b border-gray-100 px-5 py-3.5 sm:px-6">
        <h2 className="text-[15px] font-semibold text-gray-900">{title}</h2>
        <InfoTip label={title} text={info} />
      </div>
      <dl className={`grid grid-cols-2 ${items.length === 5 ? 'lg:grid-cols-5' : 'lg:grid-cols-4'} [&>div]:border-gray-100 [&>div]:border-b [&>div]:border-r`}>
        {items.map(item => (
          <div key={item.label} className="min-w-0 px-5 py-4 sm:px-6">
            <dt className="truncate text-xs font-medium text-gray-500">{item.label}</dt>
            <dd className={`mt-1 truncate text-lg font-semibold tabular-nums sm:text-xl ${item.tone ?? 'text-gray-900'}`} title={item.value}>{item.value}</dd>
            <dd className="mt-0.5 truncate text-[11px] text-gray-400" title={item.hint}>{item.hint}</dd>
          </div>
        ))}
      </dl>
    </DataPanel>
  )
}
