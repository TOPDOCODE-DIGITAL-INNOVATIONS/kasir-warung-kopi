'use client'

import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { rupiah } from '@/lib/format'

export type ChartPoint = { label: string; full: string; value: number }
export type ChartFormat = 'count' | 'rupiah'

// Satu seri per chart: warna aksen merek; teks memakai token netral.
const SERIES = '#8a6a30'
const GRID = '#e8e4dd'
const INK_MUTED = '#7a7268'

const compact = (v: number) => v >= 1_000_000_000 ? `${(v / 1_000_000_000).toLocaleString('id-ID', { maximumFractionDigits: 1 })}M`
  : v >= 1_000_000 ? `${(v / 1_000_000).toLocaleString('id-ID', { maximumFractionDigits: 1 })}jt`
    : v >= 1000 ? `${Math.round(v / 1000)}rb` : String(v)

const formatValue = (format: ChartFormat, v: number) => format === 'rupiah' ? rupiah(v) : v.toLocaleString('id-ID')

const tooltipStyle = { borderRadius: 12, border: `1px solid ${GRID}`, boxShadow: '0 12px 32px -16px rgb(28 24 20 / 0.25)', fontSize: 12 }

/** Chart tren satu seri (batang untuk jumlah diskrit, area untuk nilai berkelanjutan) + tabel data. */
export default function TrendChart({ data, seriesLabel, format = 'count', kind = 'bar', height = 'h-56' }: {
  data: ChartPoint[]; seriesLabel: string; format?: ChartFormat; kind?: 'bar' | 'area'; height?: string
}) {
  const empty = data.every(point => point.value === 0)
  const axis = {
    x: <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: INK_MUTED, fontSize: 11 }} minTickGap={12} />,
    y: <YAxis axisLine={false} tickLine={false} tick={{ fill: INK_MUTED, fontSize: 11 }} width={44} allowDecimals={false}
      tickFormatter={(v: number) => format === 'rupiah' ? compact(v) : v.toLocaleString('id-ID')} />,
    grid: <CartesianGrid strokeDasharray="2 4" vertical={false} stroke={GRID} />,
    tooltip: <Tooltip
      cursor={kind === 'bar' ? { fill: '#f4ecda', opacity: 0.6 } : { stroke: INK_MUTED, strokeDasharray: '3 3' }}
      contentStyle={tooltipStyle}
      labelFormatter={(_, payload) => payload?.[0]?.payload?.full ?? ''}
      formatter={value => [formatValue(format, Number(value)), seriesLabel]}
    />,
  }

  return (
    <div>
      <div className={`relative ${height} w-full`}>
        {empty && <p className="absolute inset-0 z-10 flex items-center justify-center text-sm text-gray-500">Belum ada data pada periode ini.</p>}
        <ResponsiveContainer width="100%" height="100%">
          {kind === 'bar' ? (
            <BarChart data={data} margin={{ top: 4, right: 4, left: -8, bottom: 0 }} barCategoryGap={2}>
              {axis.grid}{axis.x}{axis.y}{axis.tooltip}
              <Bar dataKey="value" name={seriesLabel} fill={SERIES} radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          ) : (
            <AreaChart data={data} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
              <defs>
                <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={SERIES} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={SERIES} stopOpacity={0} />
                </linearGradient>
              </defs>
              {axis.grid}{axis.x}{axis.y}{axis.tooltip}
              <Area type="monotone" dataKey="value" name={seriesLabel} stroke={SERIES} strokeWidth={2} fill="url(#trendFill)"
                activeDot={{ r: 4, stroke: '#fff', strokeWidth: 2 }} />
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>
      <details className="mt-2 text-xs text-gray-500">
        <summary className="cursor-pointer select-none font-medium hover:text-gray-700">Lihat tabel data</summary>
        <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-gray-100">
          <table className="w-full text-left">
            <thead className="sticky top-0 bg-gray-50 text-[11px] uppercase tracking-[0.08em]">
              <tr><th scope="col" className="px-3 py-2">Periode</th><th scope="col" className="px-3 py-2 text-right">{seriesLabel}</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-gray-700">
              {data.map(point => <tr key={point.full}><td className="px-3 py-1.5">{point.full}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{formatValue(format, point.value)}</td></tr>)}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  )
}
