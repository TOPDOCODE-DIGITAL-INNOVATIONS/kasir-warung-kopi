import { getBusinessContext } from '@/lib/business-context'
import BackupClient from './BackupClient'
import { PageHeader } from '@/components/ui'

export default async function BackupPage() {
  const { businesses, businessId } = await getBusinessContext()
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Sistem & Akun" title="Backup" description="Unduh data cabang aktif untuk arsip dan kebutuhan pengembangan aplikasi." />
      <BackupClient key={businessId ?? 'none'} businesses={businesses.filter(b => b.id === businessId)} initialBusinessId={businessId} unavailable={false} />
    </div>
  )
}
