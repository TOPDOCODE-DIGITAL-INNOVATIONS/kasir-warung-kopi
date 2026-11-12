import { getBusinessContext, EMPTY_BUSINESS_ID } from '@/lib/business-context'
import { rupiah } from '@/lib/format'

export default async function ExpensesPage() {
  const { supabase, businessId } = await getBusinessContext()

  const query = supabase
    .from('expenses')
    .select('id, scope, date, category, amount, note, from_drawer, created_by, businesses(name)')
    .order('date', { ascending: false })
    .limit(300)
    .eq('business_id', businessId ?? EMPTY_BUSINESS_ID)
  const { data: expenses, error } = await query

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pengeluaran</h1>
          <p className="text-gray-500 text-sm mt-1">Pengeluaran harian & bulanan yang dicatat di kasir.</p>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{error.message}</p>}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-600">
            <thead className="bg-gray-50 text-xs uppercase text-gray-700">
              <tr>
                <th className="px-4 py-3 font-medium">Tanggal</th>
                <th className="px-4 py-3 font-medium">Jenis</th>
                <th className="px-4 py-3 font-medium">Kategori</th>
                <th className="px-4 py-3 font-medium">Cabang</th>
                <th className="px-4 py-3 font-medium">Catatan</th>
                <th className="px-4 py-3 font-medium text-right">Jumlah</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {!expenses || expenses.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    Belum ada pengeluaran.
                  </td>
                </tr>
              ) : (
                expenses.map((e) => {
                  const business = e.businesses as unknown as { name: string } | null
                  return (
                    <tr key={`${business?.name}-${e.id}`} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3 whitespace-nowrap text-gray-900">{e.date}</td>
                      <td className="px-4 py-3">
                        {e.scope === 'monthly' ? 'Bulanan' : 'Harian'}
                        {e.from_drawer ? <span className="ml-1 text-xs text-gray-400">(laci)</span> : null}
                      </td>
                      <td className="px-4 py-3">{e.category ?? '-'}</td>
                      <td className="px-4 py-3">{business?.name ?? '-'}</td>
                      <td className="px-4 py-3 max-w-xs truncate">{e.note ?? '-'}</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900 whitespace-nowrap">{rupiah(e.amount)}</td>
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
