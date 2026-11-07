import { createClient } from '@/utils/supabase/server'
import { formatDateTime, rupiah } from '@/lib/format'
import { pickBusinessId } from '@/lib/business-filter'
import BusinessSelect from '../BusinessSelect'

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ b?: string | string[] }>
}) {
  const businessId = pickBusinessId((await searchParams).b)
  const supabase = await createClient()

  let query = supabase
    .from('products')
    .select('id, name, category_id, price, cost_price, stock, is_available, synced_at, businesses(name)')
    .order('name')
  if (businessId) query = query.eq('business_id', businessId)
  const [{ data: businesses }, { data: products, error }] = await Promise.all([
    supabase.from('businesses').select('id, name').order('created_at'),
    query,
  ])

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Produk & Stok</h1>
          <p className="text-gray-500 text-sm mt-1">
            Cerminan katalog di perangkat kasir (diperbarui setiap sync). Ubah menu & stok dari aplikasi kasir.
          </p>
        </div>
        <BusinessSelect businesses={businesses ?? []} />
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{error.message}</p>}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-600">
            <thead className="bg-gray-50 text-xs uppercase text-gray-700">
              <tr>
                <th className="px-4 py-3 font-medium">Nama</th>
                <th className="px-4 py-3 font-medium">Kategori</th>
                <th className="px-4 py-3 font-medium">Cabang</th>
                <th className="px-4 py-3 font-medium text-right">Harga</th>
                <th className="px-4 py-3 font-medium text-right">Modal</th>
                <th className="px-4 py-3 font-medium text-right">Stok</th>
                <th className="px-4 py-3 font-medium">Update</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {!products || products.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    Belum ada produk. Produk muncul setelah kasir melakukan sync.
                  </td>
                </tr>
              ) : (
                products.map((p) => {
                  const business = p.businesses as unknown as { name: string } | null
                  return (
                    <tr key={`${business?.name}-${p.id}`} className={p.is_available ? 'hover:bg-gray-50/50' : 'text-gray-400'}>
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {p.name}
                        {!p.is_available && <span className="ml-2 text-xs text-red-500">(nonaktif)</span>}
                      </td>
                      <td className="px-4 py-3">{p.category_id ?? '-'}</td>
                      <td className="px-4 py-3">{business?.name ?? '-'}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">{rupiah(p.price)}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">{p.cost_price == null ? '-' : rupiah(p.cost_price)}</td>
                      <td className={'px-4 py-3 text-right ' + (p.stock >= 0 && p.stock <= 5 ? 'text-red-600 font-semibold' : '')}>
                        {p.stock < 0 ? '∞' : p.stock}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs">{formatDateTime(p.synced_at)}</td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
