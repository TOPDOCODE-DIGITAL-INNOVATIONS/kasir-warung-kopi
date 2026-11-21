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
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-700">Produk & Inventori</p>
        <h1 className="mt-1 text-[28px] leading-tight text-gray-900 sm:text-3xl">Supplier</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-gray-500">Kelola data supplier dan lihat riwayat pembelian dari semua cabang Anda.</p>
      </div>
      {suppliers
        ? <SuppliersClient suppliers={suppliers} />
        : <p role="alert" className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">Daftar supplier belum berhasil dimuat. Muat ulang halaman untuk mencoba lagi.</p>}
    </div>
  )
}
