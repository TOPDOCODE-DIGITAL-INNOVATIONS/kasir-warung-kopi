import { unstable_rethrow } from 'next/navigation'
import { getOwnerPage } from './actions'
import OwnersClient from './OwnersClient'

export default async function PlatformOwnersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; status?: string | string[]; page?: string | string[] }>
}) {
  let directory
  try {
    directory = await getOwnerPage(await searchParams)
  } catch (error) {
    unstable_rethrow(error)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Kelola Owner</h1>
        <p className="mt-1 text-sm text-gray-500">Lihat akun Owner dan atur status administrasinya.</p>
      </div>
      {directory
        ? <OwnersClient {...directory} />
        : <p role="alert" className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
          Daftar akun Owner belum berhasil dimuat. Muat ulang halaman untuk mencoba lagi.
        </p>}
    </div>
  )
}
