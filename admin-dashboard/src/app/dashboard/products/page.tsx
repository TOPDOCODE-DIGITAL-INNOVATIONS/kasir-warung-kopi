import Link from 'next/link'
import { unstable_rethrow } from 'next/navigation'
import { pickBusinessId } from '@/lib/business-filter'
import BusinessSelect from '../BusinessSelect'
import { getProductsPage } from './actions'
import ProductsClient from './ProductsClient'

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ b?: string | string[] }> }) {
  const businessId = pickBusinessId((await searchParams).b)
  let data: Awaited<ReturnType<typeof getProductsPage>> | undefined
  let error = ''
  try { data = await getProductsPage(businessId) }
  catch (e) { unstable_rethrow(e); error = 'Gagal memuat data produk. Muat ulang halaman untuk mencoba lagi.' }
  return <div className="space-y-6">
    <div><h1 className="text-2xl font-bold text-gray-900">Produk & Stok</h1><p className="mt-1 text-sm text-gray-500">Kelola barang jual, bahan beli, dan pencatatan stok setiap cabang.</p></div>
    <section aria-labelledby="product-branch-filter" className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <h2 id="product-branch-filter" className="text-sm font-semibold text-gray-900">Filter Cabang</h2><p className="mt-1 text-sm text-gray-500">Pilih cabang untuk melihat produk dan ringkasan transaksinya.</p>
      <div className="mt-4 w-full sm:max-w-xs"><BusinessSelect businesses={data?.businesses ?? []} /></div>
    </section>
    {error ? <p role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-600">{error}</p>
      : data?.invalidBusiness ? <p role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-600">Cabang tidak ditemukan atau tidak dapat diakses.</p>
        : !data?.businesses.length ? <div className="space-y-3 rounded-xl border border-gray-100 bg-white p-8 text-center shadow-sm"><p className="text-gray-500">Buat cabang terlebih dahulu untuk menambahkan produk.</p><Link href="/dashboard/businesses" className="text-sm font-semibold text-blue-600 hover:underline">Buka Cabang &amp; Token</Link></div>
          : <ProductsClient key={businessId ?? 'all'} data={data} businessId={businessId} />}
  </div>
}
