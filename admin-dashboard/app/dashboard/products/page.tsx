import { getProducts } from './actions'
import { getBusinesses } from '../businesses/actions'
import ProductClient from './ProductClient'

export default async function ProductsPage() {
  const products = await getProducts()
  const businesses = await getBusinesses()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Manajemen Produk & Menu</h1>
        <p className="text-gray-500 text-sm mt-1">Kelola barang jualan dari semua cabang Anda di sini.</p>
      </div>
      <ProductClient initialProducts={products || []} businesses={businesses || []} />
    </div>
  )
}
