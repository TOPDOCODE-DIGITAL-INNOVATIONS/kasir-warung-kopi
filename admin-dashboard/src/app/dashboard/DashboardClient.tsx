'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { TrendingUp, Receipt, Wallet, HandCoins, BookOpen } from 'lucide-react'
import BusinessSelect from './BusinessSelect'
import { rupiah } from '@/lib/format'

type Props = {
  businesses: { id: string; name: string }[]
  todayRevenue: number
  todayCount: number
  weekRevenue: number
  weekCount: number
  unpaidDebt: number
  periodExpenses: number
  periodSales: number
  periodOverpay: number
  periodLabel: string
  chartData: { name: string; sales: number }[]
  topProducts: { name: string; qty: number }[]
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
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Overview Penjualan</h1>
        <p className="text-gray-500 text-sm mt-1">Data dari kasir yang sudah tersinkronisasi.</p>
      </div>

      <section aria-labelledby="branch-filter-title" className="bg-white rounded-xl shadow-sm p-5 border border-gray-100">
        <h2 id="branch-filter-title" className="text-sm font-semibold text-gray-900">Filter Cabang</h2>
        <p className="text-sm text-gray-500 mt-1">Pilih cabang untuk melihat ringkasan, grafik penjualan, dan produk terlarisnya.</p>
        <div className="mt-4 w-full sm:max-w-xs">
          <BusinessSelect businesses={p.businesses} />
        </div>
      </section>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <Card label="Penjualan Hari Ini" value={rupiah(p.todayRevenue)} hint={`${p.todayCount} transaksi`} icon={TrendingUp} tone="bg-green-50 text-green-600" />
        <Card label="Penjualan 7 Hari" value={rupiah(p.weekRevenue)} hint={`${p.weekCount} transaksi`} icon={Receipt} tone="bg-blue-50 text-blue-600" />
        <Card label="Bon Belum Lunas" value={rupiah(p.unpaidDebt)} hint="Semua waktu" icon={HandCoins} tone="bg-amber-50 text-amber-600" />
        <Card label="Penjualan Periode Ini" value={rupiah(p.periodSales)} hint={p.periodOverpay > 0 ? `${p.periodLabel} · termasuk kelebihan ${rupiah(p.periodOverpay)}` : p.periodLabel} icon={BookOpen} tone="bg-indigo-50 text-indigo-600" />
        <Card label="Pengeluaran Periode Ini" value={rupiah(p.periodExpenses)} hint={p.periodLabel} icon={Wallet} tone="bg-red-50 text-red-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm p-5 border border-gray-100">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Penjualan 7 Hari Terakhir</h3>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={p.chartData}>
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

        <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Produk Terlaris (7 hari)</h3>
          {p.topProducts.length === 0 ? (
            <p className="text-sm text-gray-500">Belum ada data.</p>
          ) : (
            <ol className="space-y-3">
              {p.topProducts.map((item, i) => (
                <li key={item.name} className="flex items-center justify-between text-sm">
                  <span className="truncate">
                    <span className="text-gray-400 mr-2">{i + 1}.</span>
                    {item.name}
                  </span>
                  <span className="font-semibold">{item.qty}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  )
}
