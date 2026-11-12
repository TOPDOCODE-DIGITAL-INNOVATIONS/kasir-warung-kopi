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
    <div className="bg-white rounded-xl border border-gray-100 p-8 text-center space-y-3">
      <h1 className="text-xl font-bold">Selamat datang!</h1>
      <p className="text-gray-500">Belum ada cabang usaha. Buat cabang dulu untuk mendapatkan token sync kasir.</p>
      <Link href="/dashboard/businesses" className="inline-block bg-blue-600 text-white px-4 py-2 rounded-lg">Buat Cabang</Link>
    </div>
  )
  let data: Awaited<ReturnType<typeof getOverviewData>> | null = null
  let error: string | null = null
  try { data = await getOverviewData(range, businessId) }
  catch (cause) { error = cause instanceof Error ? cause.message : 'Gagal memuat Overview.' }
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Overview Penjualan</h1>
        <p className="text-gray-500 text-sm mt-1">Data dari kasir yang sudah tersinkronisasi.</p>
      </div>
      <OverviewFilters key={`${businessId}-${range.start}-${range.end}`} businesses={businesses} businessId={businessId} range={range} notice={range.error} />
      {error && <p role="alert" className="text-sm text-red-600 bg-red-50 p-4 rounded-lg">{error}</p>}
      {data && <DashboardClient summary={data} range={range} showBusiness={!businessId && businesses.length > 1} />}
    </div>
  )
}
