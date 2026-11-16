'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useState } from 'react'
import { TrendingUp, Receipt, Wallet, HandCoins, BookOpen, Expand } from 'lucide-react'
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

function Card({ label, value, hint, icon: Icon, tone }: {
  label: string
  value: string
  hint: string
  icon: typeof TrendingUp
  tone: string
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-500 mb-1">{label}</p>
          <h3 className="text-xl font-bold text-gray-900 truncate" title={value}>{value}</h3>
        </div>
        <div className={`w-11 h-11 shrink-0 rounded-lg flex items-center justify-center ${tone}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <p className="mt-3 text-xs text-gray-400">{hint}</p>
    </div>
  )
}

export default function DashboardClient(p: Props) {
  const [showProducts, setShowProducts] = useState(false)
  const rangeLabel = formatRange(p.range.start, p.range.end)
  const dayFormat = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' })
  const chartData = p.summary.daily.map(day => ({ name: dayFormat.format(new Date(`${day.day}T00:00:00Z`)), sales: day.sales }))
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <Card label="Penjualan" value={rupiah(p.summary.sales)} hint={rangeLabel} icon={TrendingUp} tone="bg-green-50 text-green-600" />
        <Card label="Jumlah Transaksi" value={p.summary.count.toLocaleString('id-ID')} hint="Transaksi kasir selesai pada rentang ini" icon={Receipt} tone="bg-blue-50 text-blue-600" />
        <Card label="Bon Belum Lunas" value={rupiah(p.summary.unpaidDebt)} hint="Dari transaksi pada rentang ini" icon={HandCoins} tone="bg-amber-50 text-amber-600" />
        <Card label="Pemasukan" value={rupiah(p.summary.income)} hint={`Penjualan + kelebihan ${rupiah(p.summary.overpay)}`} icon={BookOpen} tone="bg-indigo-50 text-indigo-600" />
        <Card label="Pengeluaran" value={rupiah(p.summary.expenses)} hint={rangeLabel} icon={Wallet} tone="bg-red-50 text-red-600" />
      </div>
      <p className="text-xs text-gray-400">Penjualan termasuk rekap manual. Catatan bulanan dihitung pada tanggal 1. Pemasukan di sini adalah nilai penjualan dan kelebihan pembayaran, termasuk penjualan bon.</p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm p-5 border border-gray-100">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Penjualan</h3>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#6B7280', fontSize: 12 }}
                  tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}rb` : String(v))}
                />
                <Tooltip
                  cursor={{ fill: '#F3F4F6' }}
                  contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  formatter={(value) => [rupiah(Number(value)), 'Penjualan']}
                />
                <Bar dataKey="sales" fill="#3B82F6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-4">
            <h3 className="text-lg font-bold text-gray-900">Produk Terlaris</h3>
            <button type="button" onClick={() => setShowProducts(true)} aria-haspopup="dialog" className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50"><Expand className="h-3.5 w-3.5" />Lihat Semua</button>
          </div>
          {p.summary.topProducts.length === 0 ? (
            <p className="text-sm text-gray-500">Belum ada data.</p>
          ) : (
            <ol tabIndex={0} aria-label="10 produk terlaris berdasarkan jumlah terjual" className="h-72 overflow-y-auto space-y-3 pr-2">
              {p.summary.topProducts.slice(0, 10).map((item, i) => (
                <li key={item.key} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate" title={item.name}>
                    <span className="text-gray-400 mr-2">{i + 1}.</span>
                    {item.name}
                  </span>
                  <span className="font-semibold shrink-0 tabular-nums">{item.qty.toLocaleString('id-ID')}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-lg font-bold text-gray-900">Transaksi Terbaru</h3>
          <Link href={`/dashboard/transactions?from=${p.range.start}&to=${p.range.end}`} className="text-sm font-medium text-blue-600 hover:underline">
            Lihat transaksi cabang aktif
          </Link>
        </div>
        <TransactionList transactions={p.summary.recent} showBusiness={p.showBusiness} compact />
      </div>
      {showProducts && <TopProductsModal products={p.summary.topProducts} range={p.range} onClose={() => setShowProducts(false)} />}
    </div>
  )
}
