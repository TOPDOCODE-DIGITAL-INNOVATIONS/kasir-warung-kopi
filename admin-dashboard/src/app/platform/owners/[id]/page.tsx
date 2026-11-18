import Link from 'next/link'
import { notFound, unstable_rethrow } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getOwnerDetail } from '../actions'

const dateFormat = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeZone: 'Asia/Makassar' })
const dateTimeFormat = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Makassar' })
const panel = 'overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm'
const paginationLink = 'rounded-lg border border-gray-300 px-3 py-2 font-medium text-gray-700 hover:bg-gray-50'
const ownerList = '/platform/owners'

export default async function OwnerDetailPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ page?: string | string[] }>
}) {
  const [{ id }, { page: requestedPage }] = await Promise.all([params, searchParams])
  let result
  try {
    result = await getOwnerDetail(id, requestedPage)
  } catch (error) {
    unstable_rethrow(error)
  }
  if (result === null) notFound()

  if (!result) return (
    <div className="space-y-4">
      <Link href={ownerList} className="text-sm font-medium text-blue-600 hover:underline">Kembali ke Kelola Owner</Link>
      <p role="alert" className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
        Detail Owner belum berhasil dimuat. Muat ulang halaman untuk mencoba lagi.
      </p>
    </div>
  )

  const { owner, page, hasNext } = result
  const title = owner.name || owner.email || 'Owner'
  const facts = [
    { label: 'Email', value: owner.email || '—' },
    { label: 'Status akun', value: owner.status === 'active' ? 'Aktif' : 'Nonaktif' },
    { label: 'Verifikasi email', value: owner.email_confirmed ? 'Terverifikasi' : 'Belum terverifikasi' },
    { label: 'Tanggal daftar', value: owner.created_at ? dateFormat.format(new Date(owner.created_at)) : '—' },
    { label: 'Terakhir masuk', value: owner.last_sign_in_at ? dateTimeFormat.format(new Date(owner.last_sign_in_at)) + ' WITA' : 'Belum pernah masuk' },
  ]
  const pageHref = (number: number) => `${ownerList}/${owner.id}?page=${number}`

  return (
    <div className="space-y-6">
      <div>
        <Link href={ownerList} className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:underline">
          <ArrowLeft aria-hidden="true" className="h-4 w-4" /> Kembali ke Kelola Owner
        </Link>
        <h1 className="break-words text-2xl font-bold text-gray-900">{title}</h1>
        <p className="mt-1 text-sm text-gray-500">Detail akun Owner dan cabang yang terdaftar.</p>
      </div>

      <section className={`${panel} p-5`} aria-labelledby="owner-account">
        <h2 id="owner-account" className="font-semibold text-gray-900">Informasi akun</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {facts.map(({ label, value }) => (
            <div key={label} className="min-w-0">
              <dt className="text-sm text-gray-500">{label}</dt>
              <dd className="mt-1 break-words text-sm font-medium text-gray-900">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className={panel} aria-labelledby="owner-branches">
        <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-5 py-4">
          <h2 id="owner-branches" className="font-semibold text-gray-900">Cabang terdaftar</h2>
          <span className="text-sm text-gray-500">{owner.branch_count.toLocaleString('id-ID')} cabang</span>
        </div>
        {owner.branches.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-600">
              <thead className="bg-gray-50 text-xs uppercase text-gray-700">
                <tr>
                  <th scope="col" className="px-5 py-3">Nama cabang</th>
                  <th scope="col" className="whitespace-nowrap px-5 py-3">Tanggal dibuat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {owner.branches.map(branch => (
                  <tr key={branch.id}>
                    <th scope="row" className="px-5 py-3 font-medium text-gray-900">{branch.name}</th>
                    <td className="whitespace-nowrap px-5 py-3">{dateFormat.format(new Date(branch.created_at))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="p-5 text-sm text-gray-500">{page === 1 ? 'Owner ini belum memiliki cabang.' : 'Tidak ada cabang pada halaman ini.'}</p>}
        {(page > 1 || hasNext) && <nav aria-label="Halaman cabang" className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 p-4 text-sm text-gray-600">
          <span>Halaman {page}</span>
          <div className="flex gap-2">
            {page > 1 && <Link href={pageHref(page - 1)} prefetch={false} className={paginationLink}>Sebelumnya</Link>}
            {hasNext && <Link href={pageHref(page + 1)} prefetch={false} className={paginationLink}>Berikutnya</Link>}
          </div>
        </nav>}
      </section>
    </div>
  )
}
