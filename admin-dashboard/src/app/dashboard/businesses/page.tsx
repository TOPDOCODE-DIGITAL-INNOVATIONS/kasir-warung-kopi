import { getBusinesses } from './actions'
import BusinessClient from './BusinessClient'
import { getSiteUrl } from '@/lib/site-url'
import { PageHeader } from '@/components/ui'

export default async function BusinessesPage() {
  const [businesses, siteUrl] = await Promise.all([getBusinesses(), getSiteUrl()])
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Usaha & Tim" title="Cabang Usaha & Token Sync"
        description="Setiap cabang punya token sync sendiri. Isi token ini di aplikasi kasir cabang tersebut." />
      <BusinessClient
        initialBusinesses={businesses ?? []}
        syncUrl={`${siteUrl}/api/sync`}
        kasirUrl={`${siteUrl}/kasir/`}
      />
    </div>
  )
}
