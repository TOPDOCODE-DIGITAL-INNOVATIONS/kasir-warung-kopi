import Link from 'next/link'
import { unstable_rethrow } from 'next/navigation'
import BusinessSelect from '../BusinessSelect'
import { pickBusinessId } from '@/lib/business-filter'
import { getCashierUsers } from './actions'
import UsersClient from './UsersClient'

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ b?: string | string[] }> }) {
  const businessId = pickBusinessId((await searchParams).b)
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
      <section aria-labelledby="user-branch-filter" className="bg-white rounded-xl shadow-sm p-5 border border-gray-100">
        <h2 id="user-branch-filter" className="text-sm font-semibold text-gray-900">Filter Cabang</h2>
        <p className="text-sm text-gray-500 mt-1">Pilih cabang untuk melihat daftar user kasirnya.</p>
        <div className="mt-4 w-full sm:max-w-xs"><BusinessSelect businesses={data?.businesses ?? []} /></div>
      </section>
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
