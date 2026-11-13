import { getBusinessContext } from '@/lib/business-context'
import BackupClient from './BackupClient'

export default async function BackupPage() {
  const { businesses, businessId } = await getBusinessContext()
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Backup</h1>
        <p className="text-gray-500 text-sm mt-1">Unduh data cabang aktif untuk arsip dan kebutuhan pengembangan aplikasi.</p>
      </div>
      <BackupClient key={businessId ?? 'none'} businesses={businesses.filter(b => b.id === businessId)} initialBusinessId={businessId} unavailable={false} />
    </div>
  )
}
