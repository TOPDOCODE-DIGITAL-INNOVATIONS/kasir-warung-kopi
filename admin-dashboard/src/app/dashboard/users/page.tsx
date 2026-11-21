import Link from 'next/link'
import { unstable_rethrow } from 'next/navigation'
import { getBusinessContext } from '@/lib/business-context'
import { getCashierUsers } from './actions'
import UsersClient from './UsersClient'
import { Users } from 'lucide-react'
import { EmptyState, PageHeader, ui } from '@/components/ui'

export default async function UsersPage() {
  const { businessId } = await getBusinessContext()
  let data: Awaited<ReturnType<typeof getCashierUsers>> | undefined
  let errorMessage = ''
  try {
    data = await getCashierUsers(businessId)
  } catch (error) {
    unstable_rethrow(error)
    errorMessage = 'Gagal memuat data user. Muat ulang halaman untuk mencoba lagi.'
  }

  return (
    <div className="space-y-6">
      {(errorMessage || data?.invalidBusiness || data?.businesses.length === 0) &&
        <PageHeader eyebrow="Usaha & Tim" title="Kelola User" description="Kelola profil dan hak akses kasir pada setiap cabang usaha Anda." />}

      {errorMessage ? <p role="alert" className="text-sm text-red-700 bg-red-50 p-4 rounded-xl border border-red-100">{errorMessage}</p>
        : data?.invalidBusiness ? <p role="alert" className="text-sm text-red-700 bg-red-50 p-4 rounded-xl border border-red-100">Cabang tidak ditemukan atau tidak dapat diakses. Pilih cabang lain.</p>
          : data?.businesses.length === 0 ? (
            <div className={ui.panel}><EmptyState icon={Users} title="Belum ada cabang usaha" description="Buat cabang dan sinkronkan aplikasi kasir untuk menampilkan user."
              action={<Link href="/dashboard/businesses" className={ui.btnPrimary}>Buka Cabang &amp; Token</Link>} /></div>
          ) : <UsersClient key={businessId ?? 'all'} users={data?.users ?? []} configuration={data?.configuration ?? null} />}
    </div>
  )
}
