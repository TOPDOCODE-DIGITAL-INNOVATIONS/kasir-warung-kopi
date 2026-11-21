import Link from 'next/link'
import { getBusinessContext } from '@/lib/business-context'
import { pickBusinessId } from '@/lib/business-filter'
import { dayKey } from '@/lib/format'
import DashboardClient from './DashboardClient'
import OverviewFilters from './OverviewFilters'
import { resolveOverviewRange } from './overview-domain'
import { getOverviewData } from './actions'

type Params = { b?: string | string[]; from?: string | string[]; to?: string | string[] }
const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams
  const { businesses } = await getBusinessContext()
  const businessId = pickBusinessId(params.b)
  const range = resolveOverviewRange(first(params.from), first(params.to), dayKey(new Date()))
  if (!businesses.length) return (
    <div className="relative overflow-hidden rounded-3xl bg-espresso-900 px-6 py-14 text-center text-white shadow-lg sm:px-12">
      <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-0 h-64 w-[36rem] -translate-x-1/2 rounded-full bg-champagne/15 blur-3xl" />
      <div className="relative mx-auto max-w-lg space-y-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-champagne">Langkah pertama</p>
        <h1 className="text-3xl text-white sm:text-4xl">Selamat datang di KasirKu</h1>
        <p className="text-gray-300">Belum ada cabang usaha. Buat cabang dulu untuk mendapatkan token sync kasir.</p>
        <Link href="/dashboard/businesses" className="inline-flex rounded-xl bg-champagne px-5 py-3 text-sm font-semibold text-espresso-900 shadow-[0_10px_30px_-10px_rgb(217_191_136/0.7)] transition hover:brightness-105">Buat Cabang</Link>
      </div>
    </div>
  )
  let data: Awaited<ReturnType<typeof getOverviewData>> | null = null
  let error: string | null = null
  try { data = await getOverviewData(range, businessId) }
  catch (cause) { error = cause instanceof Error ? cause.message : 'Gagal memuat Overview.' }
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-700">Ringkasan usaha</p>
          <h1 className="mt-1 text-3xl text-gray-900">Overview Penjualan</h1>
          <p className="mt-1 text-sm text-gray-500">Data dari kasir yang sudah tersinkronisasi · {businessId ? businesses.find(b => b.id === businessId)?.name ?? 'Cabang terpilih' : 'Semua cabang'}</p>
        </div>
      </div>
      <OverviewFilters key={`${businessId}-${range.start}-${range.end}`} businesses={businesses} businessId={businessId} range={range} notice={range.error} />
      {error && <p role="alert" className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">{error}</p>}
      {data && <DashboardClient summary={data} range={range} showBusiness={!businessId && businesses.length > 1} />}
    </div>
  )
}
