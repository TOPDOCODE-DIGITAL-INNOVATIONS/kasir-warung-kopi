import Link from 'next/link'
import { unstable_rethrow } from 'next/navigation'
import { getBusinessContext } from '@/lib/business-context'
import { getProductsPage } from './actions'
import ProductsClient from './ProductsClient'
import { Package } from 'lucide-react'
import { EmptyState, PageHeader, ui } from '@/components/ui'

export default async function ProductsPage() {
  const { businessId } = await getBusinessContext()
  let data: Awaited<ReturnType<typeof getProductsPage>> | undefined
  let error = ''
  try { data = await getProductsPage(businessId) }
  catch (e) { unstable_rethrow(e); error = 'Gagal memuat data produk. Muat ulang halaman untuk mencoba lagi.' }
  const header = <PageHeader eyebrow="Produk & Inventori" title="Produk & Stok" description="Kelola barang jual, bahan beli, dan pencatatan stok setiap cabang." />
  return <div className="space-y-6">
    {(error || data?.invalidBusiness || !data?.businesses.length) && header}
    {error ? <p role="alert" className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">{error}</p>
      : data?.invalidBusiness ? <p role="alert" className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">Cabang tidak ditemukan atau tidak dapat diakses.</p>
        : !data?.businesses.length ? <div className={ui.panel}><EmptyState icon={Package} title="Belum ada cabang" description="Buat cabang terlebih dahulu untuk menambahkan produk." action={<Link href="/dashboard/businesses" className={ui.btnPrimary}>Buka Cabang &amp; Token</Link>} /></div>
          : <ProductsClient key={businessId ?? 'all'} data={data} businessId={businessId} />}
  </div>
}
