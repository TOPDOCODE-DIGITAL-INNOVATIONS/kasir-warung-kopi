import { getBusinesses } from './actions'
import BusinessClient from './BusinessClient'
import { getSiteUrl } from '@/lib/site-url'
import { getBusinessContext } from '@/lib/business-context'
import { unstable_rethrow } from 'next/navigation'
import { getOwnerCheckout } from '../subscription/actions'

export default async function BusinessesPage() {
  const [businesses, siteUrl, context] = await Promise.all([getBusinesses(), getSiteUrl(), getBusinessContext()])
  const branchCount = context.businesses.length
  const checkout = branchCount > 0 ? await getOwnerCheckout().catch(error => {
    unstable_rethrow(error)
    return null
  }) : null
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
        branchCount={branchCount}
        billingPlans={checkout?.plans ?? []}
        syncUrl={`${siteUrl}/api/sync`}
        kasirUrl={`${siteUrl}/kasir/`}
      />
    </div>
  )
}
