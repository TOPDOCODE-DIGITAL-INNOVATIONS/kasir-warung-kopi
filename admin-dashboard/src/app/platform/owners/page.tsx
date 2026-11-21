import { unstable_rethrow } from 'next/navigation'
import { getOwnerPage } from './actions'
import OwnersClient from './OwnersClient'
import { PageHeader } from '@/components/ui'

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
      <PageHeader eyebrow="Pelanggan" title="Kelola Owner" description="Lihat akun Owner dan atur status administrasinya. Klik nama Owner untuk melihat detail." />
      {directory
        ? <OwnersClient {...directory} />
        : <p role="alert" className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
          Daftar akun Owner belum berhasil dimuat. Muat ulang halaman untuk mencoba lagi.
        </p>}
    </div>
  )
}
