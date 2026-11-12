import { getBusinessContext, EMPTY_BUSINESS_ID } from '@/lib/business-context'
import { formatDateTime, rupiah, PAYMENT_LABELS } from '@/lib/format'

type Item = { quantity?: number; product?: { name?: string }; selectedOptions?: { choiceLabel?: string }[] }

export default async function TransactionsPage() {
  const { supabase, businessId } = await getBusinessContext()

  const query = supabase
    .from('transactions')
    .select(
      'id, created_at, cashier_name, order_type, customer_name, items, grand_total, overpay_amount, payment_type, payment_detail, status, debt_status, businesses(name)'
    )
    .order('created_at', { ascending: false })
    .limit(300)
    .eq('business_id', businessId ?? EMPTY_BUSINESS_ID)
  const { data: transactions, error } = await query

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Riwayat Transaksi</h1>
          <p className="text-gray-500 text-sm mt-1">300 transaksi terakhir yang disinkronisasi dari kasir.</p>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{error.message}</p>}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-600">
            <thead className="bg-gray-50 text-xs uppercase text-gray-700">
              <tr>
                <th className="px-4 py-3 font-medium">Tanggal</th>
                <th className="px-4 py-3 font-medium">No. Nota</th>
                <th className="px-4 py-3 font-medium">Cabang</th>
                <th className="px-4 py-3 font-medium">Kasir</th>
                <th className="px-4 py-3 font-medium">Bayar</th>
                <th className="px-4 py-3 font-medium text-right">Total</th>
                <th className="px-4 py-3 font-medium">Item</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {!transactions || transactions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    Belum ada transaksi.
                  </td>
                </tr>
              ) : (
                transactions.map((tx) => {
                  const cancelled = tx.status === 'cancelled'
                  const business = tx.businesses as unknown as { name: string } | null
                  return (
                    <tr key={tx.id} className={cancelled ? 'bg-red-50/40 text-gray-400' : 'hover:bg-gray-50/50'}>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-900">{formatDateTime(tx.created_at)}</td>
                      <td className="px-4 py-3 whitespace-nowrap font-mono text-xs">{tx.id}</td>
                      <td className="px-4 py-3">{business?.name ?? '-'}</td>
                      <td className="px-4 py-3">{tx.cashier_name ?? '-'}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {cancelled ? (
                          <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-semibold rounded-full">Batal</span>
                        ) : tx.payment_type === 'hutang' ? (
                          <span
                            className={
                              'px-2 py-1 text-xs font-semibold rounded-full ' +
                              (tx.debt_status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700')
                            }
                          >
                            Bon {tx.debt_status === 'paid' ? 'Lunas' : 'Belum Lunas'}
                          </span>
                        ) : (
                          <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded-full">
                            {PAYMENT_LABELS[tx.payment_type ?? ''] ?? tx.payment_type}
                            {tx.payment_detail ? ` · ${tx.payment_detail}` : ''}
                          </span>
                        )}
                      </td>
                      <td className={'px-4 py-3 text-right font-medium whitespace-nowrap ' + (cancelled ? 'line-through' : 'text-gray-900')}>
                        {rupiah(tx.grand_total)}
                        {!cancelled && Number(tx.overpay_amount) > 0 && (
                          <p className="text-xs font-normal text-green-700">+ kelebihan {rupiah(tx.overpay_amount)}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs max-w-xs truncate">
                        {((tx.items ?? []) as Item[])
                          .map((i) => `${i.product?.name ?? '?'} x${i.quantity ?? 1}`)
                          .join(', ')}
                      </td>
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
