import { unstable_rethrow } from 'next/navigation'
import { getSuppliers } from './actions'
import SuppliersClient from './SuppliersClient'

export default async function SuppliersPage() {
  let suppliers
  try {
    suppliers = await getSuppliers()
  } catch (error) {
    unstable_rethrow(error)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Supplier</h1>
        <p className="mt-1 text-sm text-gray-500">Kelola data supplier dan lihat riwayat pembelian dari semua cabang Anda.</p>
      </div>
      {suppliers
        ? <SuppliersClient suppliers={suppliers} />
        : <p role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-600">Daftar supplier belum berhasil dimuat. Muat ulang halaman untuk mencoba lagi.</p>}
    </div>
  )
}
