import { createClient } from '@/utils/supabase/server'

export default async function TransactionsPage() {
  const supabase = await createClient()
  
  // Fetch transactions with businesses name and transaction_items
  const { data: transactions, error } = await supabase
    .from('transactions')
    .select(`
      *,
      businesses(name),
      profiles(full_name),
      transaction_items(
        quantity,
        price,
        products(name)
      )
    `)
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Riwayat Transaksi</h1>
        <p className="text-gray-500 text-sm mt-1">Daftar semua transaksi yang disinkronisasi dari kasir.</p>
      </div>
      
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-500">
            <thead className="bg-gray-50 text-xs uppercase text-gray-700">
              <tr>
                <th className="px-6 py-4 font-medium">Tanggal</th>
                <th className="px-6 py-4 font-medium">Cabang</th>
                <th className="px-6 py-4 font-medium">Kasir</th>
                <th className="px-6 py-4 font-medium">Metode</th>
                <th className="px-6 py-4 font-medium text-right">Total (Rp)</th>
                <th className="px-6 py-4 font-medium">Item</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {!transactions || transactions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500">Belum ada transaksi.</td>
                </tr>
              ) : transactions.map((tx: any) => (
                <tr key={tx.id} className="hover:bg-gray-50/50">
                  <td className="px-6 py-4 font-medium text-gray-900">
                    {new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(tx.created_at))}
                  </td>
                  <td className="px-6 py-4">{tx.businesses?.name || '-'}</td>
                  <td className="px-6 py-4">{tx.profiles?.full_name || 'Kasir'}</td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded-full">
                      {tx.payment_method}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right font-medium text-gray-900">
                    {parseInt(tx.total_amount).toLocaleString('id-ID')}
                  </td>
                  <td className="px-6 py-4 text-xs text-gray-500 max-w-xs truncate">
                    {tx.transaction_items?.map((item: any) => `${item.products?.name || 'Produk dihapus'} (${item.quantity})`).join(', ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
