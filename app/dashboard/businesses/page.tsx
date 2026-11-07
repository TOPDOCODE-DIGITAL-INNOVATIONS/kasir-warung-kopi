import { getBusinesses } from './actions'
import BusinessClient from './BusinessClient'

export default async function BusinessesPage() {
  const businesses = await getBusinesses()
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Manajemen Cabang Usaha</h1>
        <p className="text-gray-500 text-sm mt-1">Kelola cabang usaha Anda di sini.</p>
      </div>
      <BusinessClient initialBusinesses={businesses || []} />
    </div>
  )
}
