'use client'

import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { rupiah } from '@/lib/format'

export type ChartPoint = { label: string; income: number; profit: number; cumProfit: number; cumCapital: number }

const short = (v: number) => {
  const a = Math.abs(v)
  if (a >= 1e9) return `${(v / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 1 })} M`
  if (a >= 1e6) return `${(v / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 })} jt`
  if (a >= 1e3) return `${(v / 1e3).toLocaleString('id-ID', { maximumFractionDigits: 0 })} rb`
  return String(v)
}

const NAMES: Record<string, string> = { income: 'Omzet', profit: 'Laba bulan ini', cumProfit: 'Laba kumulatif', cumCapital: 'Modal' }

export default function PaybackChart({ data }: { data: ChartPoint[] }) {
  if (data.length === 0) return <p className="py-10 text-center text-sm text-gray-400">Belum ada data untuk ditampilkan.</p>
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} axisLine={false} />
          <YAxis tickFormatter={short} tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} axisLine={false} width={56} />
          <Tooltip formatter={(v, name) => [rupiah(Number(v)), NAMES[String(name)] ?? String(name)]} />
          <Legend formatter={(name) => NAMES[String(name)] ?? String(name)} wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="income" fill="#bfdbfe" radius={[4, 4, 0, 0]} />
          <Bar dataKey="profit" fill="#60a5fa" radius={[4, 4, 0, 0]} />
          <Line type="monotone" dataKey="cumProfit" stroke="#15803d" strokeWidth={2} dot={false} />
          <Line type="stepAfter" dataKey="cumCapital" stroke="#dc2626" strokeWidth={2} strokeDasharray="6 4" dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
