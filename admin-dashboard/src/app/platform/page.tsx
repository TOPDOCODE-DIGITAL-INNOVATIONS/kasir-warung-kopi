import { unstable_rethrow } from 'next/navigation'
import { Building2, UserCheck, UserRoundX, Users } from 'lucide-react'
import { getPlatformOverview } from './actions'

export default async function PlatformPage() {
  let overview
  try {
    overview = await getPlatformOverview()
  } catch (error) {
    unstable_rethrow(error)
  }
  const cards = overview ? [
    { label: 'Total Owner', value: overview.owner_count, Icon: Users, tone: 'bg-blue-50 text-blue-600' },
    { label: 'Cabang Terdaftar', value: overview.branch_count, Icon: Building2, tone: 'bg-indigo-50 text-indigo-600' },
    { label: 'Owner Aktif', value: overview.active_owner_count, Icon: UserCheck, tone: 'bg-green-50 text-green-600' },
    { label: 'Owner Nonaktif', value: overview.inactive_owner_count, Icon: UserRoundX, tone: 'bg-gray-100 text-gray-500' },
  ] : []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Overview Platform</h1>
        <p className="mt-1 text-sm text-gray-500">Ringkasan akun Owner dan cabang yang terdaftar.</p>
      </div>
      {overview ? (
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map(({ Icon, label, value, tone }) => (
            <div key={label} className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
              <div className="min-w-0">
                <dt className="text-sm font-medium text-gray-500">{label}</dt>
                <dd className="mt-1 text-2xl font-bold tabular-nums text-gray-900">{value.toLocaleString('id-ID')}</dd>
              </div>
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${tone}`}>
                <Icon aria-hidden="true" className="h-5 w-5" />
              </div>
            </div>
          ))}
        </dl>
      ) : <p role="alert" className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
        Ringkasan platform belum berhasil dimuat. Muat ulang halaman untuk mencoba lagi.
      </p>}
    </div>
  )
}
