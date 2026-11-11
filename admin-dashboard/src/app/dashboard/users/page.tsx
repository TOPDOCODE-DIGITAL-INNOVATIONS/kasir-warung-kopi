import Link from 'next/link'
import { unstable_rethrow } from 'next/navigation'
import { getBusinessContext } from '@/lib/business-context'
import { getCashierUsers } from './actions'
import UsersClient from './UsersClient'

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
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Kelola User</h1>
        <p className="text-gray-500 text-sm mt-1">Kelola profil dan hak akses kasir pada setiap cabang usaha Anda.</p>
      </div>

      {errorMessage ? <p role="alert" className="text-sm text-red-600 bg-red-50 p-4 rounded-lg">{errorMessage}</p>
        : data?.invalidBusiness ? <p role="alert" className="text-sm text-red-600 bg-red-50 p-4 rounded-lg">Cabang tidak ditemukan atau tidak dapat diakses. Pilih cabang lain.</p>
          : data?.businesses.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm p-8 border border-gray-100 text-center space-y-3">
              <p className="text-gray-500">Belum ada cabang usaha. Buat cabang dan sinkronkan aplikasi kasir untuk menampilkan user.</p>
              <Link href="/dashboard/businesses" className="inline-block text-sm font-semibold text-blue-600 hover:underline">Buka Cabang &amp; Token</Link>
            </div>
          ) : <UsersClient key={businessId ?? 'all'} users={data?.users ?? []} />}
    </div>
  )
}
