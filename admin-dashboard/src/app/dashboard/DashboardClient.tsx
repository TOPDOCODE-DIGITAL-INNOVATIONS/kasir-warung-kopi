'use client'

import DataPanel from '@/components/DataPanel'
import InfoTip from '@/components/InfoTip'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useState } from 'react'
import { TrendingUp, Receipt, Wallet, HandCoins, BookOpen, Expand, ArrowUpRight, Trophy } from 'lucide-react'
import { rupiah } from '@/lib/format'
import Link from 'next/link'
import TransactionList from './transactions/TransactionList'
import { formatRange } from '@/lib/book-period'
import TopProductsModal from './TopProductsModal'
import type { OverviewRange, summarizeOverview } from './overview-domain'
import type { TxRow } from './transactions/types'

type Props = {
  summary: ReturnType<typeof summarizeOverview> & { recent: TxRow[] }
  range: OverviewRange
  showBusiness: boolean
}

const panel = 'rounded-2xl border border-gray-200/70 bg-white shadow-sm'

function Metric({ label, value, hint, info, icon: Icon, tone }: {
  label: string; value: string; hint: string; info: string; icon: typeof TrendingUp; tone: string
}) {
  return (
    <DataPanel compact className={`${panel} group p-5 transition-shadow hover:shadow-md`}>
      <div className="flex items-start justify-between gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone}`}>
          <Icon aria-hidden="true" className="h-[18px] w-[18px]" />
        </span>
        <InfoTip label={label} text={info} />
      </div>
      <p className="mt-4 text-[13px] font-medium text-gray-500">{label}</p>
      <p className="mt-1 truncate text-[22px] font-semibold tracking-tight text-gray-900 tabular-nums" title={value}>{value}</p>
      <p className="mt-2 truncate text-xs text-gray-400" title={hint}>{hint}</p>
    </DataPanel>
  )
}

export default function DashboardClient(p: Props) {
  const [showProducts, setShowProducts] = useState(false)
  const rangeLabel = formatRange(p.range.start, p.range.end)
  const dayFormat = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' })
  const longDay = new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
  const chartData = p.summary.daily.map(day => ({
    name: dayFormat.format(new Date(`${day.day}T00:00:00Z`)),
    full: longDay.format(new Date(`${day.day}T00:00:00Z`)),
    sales: day.sales,
  }))
  const peak = chartData.reduce<(typeof chartData)[number] | null>((best, day) => (day.sales > (best?.sales ?? 0) ? day : best), null)
  const top = p.summary.topProducts.slice(0, 10)
  const topQty = top[0]?.qty || 1

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <DataPanel className="relative overflow-hidden rounded-2xl bg-espresso-900 p-6 text-white shadow-lg md:col-span-2 xl:row-span-2">
          <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-champagne/20 blur-3xl" />
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,transparent_55%,rgb(217_191_136/0.08))]" />
          <div className="relative flex h-full flex-col">
            <div className="flex items-start justify-between gap-3">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-champagne ring-1 ring-white/10">
                <TrendingUp aria-hidden="true" className="h-3.5 w-3.5" /> Penjualan
              </span>
              <InfoTip tone="dark" label="Penjualan" text="Total nilai penjualan pada rentang terpilih, termasuk rekap manual. Catatan bulanan dihitung pada tanggal 1." />
            </div>
            <p className="mt-6 font-display text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl" title={rupiah(p.summary.sales)}>{rupiah(p.summary.sales)}</p>
            <p className="mt-2 text-sm text-gray-400">{rangeLabel}</p>
            <dl className="mt-auto grid grid-cols-2 gap-4 border-t border-white/10 pt-5 text-sm max-xl:mt-8">
              <div>
                <dt className="text-xs text-gray-400">Jumlah transaksi</dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums">{p.summary.count.toLocaleString('id-ID')}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs text-gray-400">Hari tertinggi</dt>
                <dd className="mt-1 truncate text-lg font-semibold" title={peak ? `${peak.full} · ${rupiah(peak.sales)}` : undefined}>
                  {peak ? <>{peak.name} <span className="text-sm font-normal text-champagne">{rupiah(peak.sales)}</span></> : '—'}
                </dd>
              </div>
            </dl>
          </div>
        </DataPanel>
        <Metric label="Pemasukan" value={rupiah(p.summary.income)} hint={`Penjualan + kelebihan ${rupiah(p.summary.overpay)}`} icon={BookOpen} tone="bg-blue-50 text-blue-700"
          info="Nilai penjualan ditambah kelebihan pembayaran, termasuk penjualan bon yang belum lunas." />
        <Metric label="Pengeluaran" value={rupiah(p.summary.expenses)} hint={rangeLabel} icon={Wallet} tone="bg-red-50 text-red-600"
          info="Total pengeluaran dari admin dan kasir pada rentang terpilih." />
        <Metric label="Bon Belum Lunas" value={rupiah(p.summary.unpaidDebt)} hint="Dari transaksi pada rentang ini" icon={HandCoins} tone="bg-amber-50 text-amber-700"
          info="Sisa tagihan pelanggan (bon) dari transaksi pada rentang ini yang belum dibayar." />
        <Metric label="Jumlah Transaksi" value={p.summary.count.toLocaleString('id-ID')} hint="Transaksi kasir selesai" icon={Receipt} tone="bg-emerald-50 text-emerald-700"
          info="Jumlah transaksi kasir berstatus selesai pada rentang terpilih." />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <DataPanel className={`${panel} p-6 lg:col-span-2`}>
          <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Tren Penjualan Harian</h2>
              <p className="mt-0.5 text-xs text-gray-500">{rangeLabel} · arahkan kursor ke batang untuk detail</p>
            </div>
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
                <defs>
                  <linearGradient id="salesBar" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#c7a25f" />
                    <stop offset="100%" stopColor="#8a6a30" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 4" vertical={false} stroke="#e8e4dd" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#7a7268', fontSize: 11 }} minTickGap={8} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#7a7268', fontSize: 11 }}
                  tickFormatter={(v: number) => (v >= 1_000_000 ? `${(v / 1_000_000).toLocaleString('id-ID', { maximumFractionDigits: 1 })}jt` : v >= 1000 ? `${Math.round(v / 1000)}rb` : String(v))} />
                <Tooltip
                  cursor={{ fill: '#f4ecda', opacity: 0.6 }}
                  contentStyle={{ borderRadius: 12, border: '1px solid #e8e4dd', boxShadow: '0 12px 32px -16px rgb(28 24 20 / 0.25)', fontSize: 12 }}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.full ?? ''}
                  formatter={(value) => [rupiah(Number(value)), 'Penjualan']}
                />
                <Bar dataKey="sales" fill="url(#salesBar)" radius={[6, 6, 2, 2]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </DataPanel>

        <DataPanel className={`${panel} min-w-0 p-6`}>
          <div className="mb-5 flex items-start justify-between gap-2">
            <div>
              <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900"><Trophy aria-hidden="true" className="h-4 w-4 text-blue-600" />Produk Terlaris</h2>
              <p className="mt-0.5 text-xs text-gray-500">Berdasarkan jumlah terjual</p>
            </div>
            <button type="button" onClick={() => setShowProducts(true)} aria-haspopup="dialog"
              className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50"><Expand aria-hidden="true" className="h-3.5 w-3.5" />Semua</button>
          </div>
          {top.length === 0 ? (
            <p className="flex h-72 items-center justify-center rounded-xl border border-dashed border-gray-200 text-sm text-gray-500">Belum ada penjualan pada rentang ini.</p>
          ) : (
            <ol tabIndex={0} aria-label="10 produk terlaris berdasarkan jumlah terjual" className="h-72 space-y-3.5 overflow-y-auto pr-1 [scrollbar-width:thin]">
              {top.map((item, i) => (
                <li key={item.key} className="text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2.5" title={item.name}>
                      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums ${i < 3 ? 'bg-espresso-900 text-champagne' : 'bg-gray-100 text-gray-500'}`}>{i + 1}</span>
                      <span className="truncate font-medium text-gray-800">{item.name}</span>
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums text-gray-900">{item.qty.toLocaleString('id-ID')}</span>
                  </div>
                  <div aria-hidden="true" className="ml-8.5 mt-1.5 h-1 overflow-hidden rounded-full bg-gray-100">
                    <div className="h-full rounded-full bg-linear-to-r from-blue-600 to-blue-400" style={{ width: `${Math.max(4, (item.qty / topQty) * 100)}%` }} />
                  </div>
                </li>
              ))}
            </ol>
          )}
        </DataPanel>
      </div>

      <div className={`${panel} overflow-hidden`}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Transaksi Terbaru</h2>
            <p className="mt-0.5 text-xs text-gray-500">Klik transaksi untuk melihat detail pesanan</p>
          </div>
          <Link href={`/dashboard/transactions?from=${p.range.start}&to=${p.range.end}`}
            className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-semibold text-blue-700 hover:bg-blue-50">
            Lihat transaksi cabang aktif <ArrowUpRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        </div>
        <TransactionList transactions={p.summary.recent} showBusiness={p.showBusiness} compact />
      </div>
      {showProducts && <TopProductsModal products={p.summary.topProducts} range={p.range} onClose={() => setShowProducts(false)} />}
    </div>
  )
}
