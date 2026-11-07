import { getBusinesses } from './actions'
import BusinessClient from './BusinessClient'
import { getSiteUrl } from '@/lib/site-url'

export default async function BusinessesPage() {
  const [businesses, siteUrl] = await Promise.all([getBusinesses(), getSiteUrl()])
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Cabang Usaha & Token Sync</h1>
        <p className="text-gray-500 text-sm mt-1">
          Setiap cabang punya token sync sendiri. Isi token ini di aplikasi kasir cabang tersebut.
        </p>
      </div>
      <BusinessClient
        initialBusinesses={businesses ?? []}
        syncUrl={`${siteUrl}/api/sync`}
        kasirUrl={`${siteUrl}/kasir/`}
      />
    </div>
  )
}
