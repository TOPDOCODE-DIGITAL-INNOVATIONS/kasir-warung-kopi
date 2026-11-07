import { createClient } from '@/utils/supabase/server'
import DashboardClient from './DashboardClient'

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: businesses } = await supabase.from('businesses').select('id, name')
  const { data: transactions } = await supabase.from('transactions').select('total_amount, created_at')
  const { data: transactionItems } = await supabase.from('transaction_items').select('quantity')

  const totalRevenue = transactions?.reduce((acc, curr) => acc + Number(curr.total_amount), 0) || 0
  const totalTransactions = transactions?.length || 0
  const totalProductsSold = transactionItems?.reduce((acc, curr) => acc + Number(curr.quantity), 0) || 0

  // Sangat sederhana: Chart data di-mockup dari transaksi,
  // di production sebaiknya group by Date.
  const chartData = [
    { name: 'Senin', sales: 4000 },
    { name: 'Selasa', sales: 3000 },
    { name: 'Rabu', sales: 5000 },
    { name: 'Kamis', sales: 2780 },
    { name: 'Jumat', sales: 8090 },
    { name: 'Sabtu', sales: 12390 },
    { name: 'Minggu', sales: 14490 },
  ]

  if (transactions && transactions.length > 0) {
    // Override with basic real data if exists just as example
    chartData[6] = { name: 'Hari Ini', sales: totalRevenue }
  }

  return (
    <DashboardClient 
      businesses={businesses || []} 
      totalRevenue={totalRevenue}
      totalTransactions={totalTransactions}
      totalProductsSold={totalProductsSold}
      chartData={chartData}
    />
  )
}
