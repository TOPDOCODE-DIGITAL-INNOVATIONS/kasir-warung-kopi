'use server'

import { getBusinessContext } from '@/lib/business-context'
import { TX_COLUMNS, type TxRow } from './transactions/types'
import { overviewRangeError, shiftDay, summarizeOverview, type OverviewRange, type OverviewTx, type OverviewExpense, type OverviewManual } from './overview-domain'

/** Halaman bertahap dengan urutan stabil; kegagalan tidak dianggap sebagai hasil lengkap. */
async function readRows<T>(query: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += 500) {
    const { data, error } = await query(from, from + 499)
    if (error) throw new Error('Gagal memuat data Overview. Silakan coba lagi.')
    rows.push(...(data ?? []) as T[])
    if (!data || data.length < 500) return rows
  }
}

export async function getOverviewData(range: OverviewRange, businessId: string | null) {
  const invalidRange = overviewRangeError(range.start, range.end)
  if (invalidRange) throw new Error(invalidRange)
  const { supabase, businesses } = await getBusinessContext()
  if (businessId && !businesses.some(branch => branch.id === businessId)) throw new Error('Cabang tidak ditemukan atau tidak dapat diakses.')
  const ids = businessId ? [businessId] : businesses.map(branch => branch.id)
  if (!ids.length) return { ...summarizeOverview(range, [], [], []), recent: [] as TxRow[] }
  const start = `${range.start}T00:00:00+07:00`, until = `${shiftDay(range.end, 1)}T00:00:00+07:00`
  const [transactions, expenses, manual, recent] = await Promise.all([
    readRows<OverviewTx>((from, to) => supabase.from('transactions')
      .select('created_at,status,grand_total,overpay_amount,payment_type,debt_status,items')
      .in('business_id', ids).eq('status', 'completed').gte('created_at', start).lt('created_at', until)
      .order('created_at').order('business_id').order('id').range(from, to)),
    readRows<OverviewExpense>((from, to) => supabase.from('expenses').select('date,amount')
      .in('business_id', ids).gte('date', range.start.slice(0, 7)).lte('date', range.end)
      .order('date').order('business_id').order('id').range(from, to)),
    readRows<OverviewManual>((from, to) => supabase.from('manual_summaries').select('date,sales,expenses,overpay')
      .in('business_id', ids).gte('date', range.start.slice(0, 7)).lte('date', range.end)
      .order('date').order('business_id').order('id').range(from, to)),
    supabase.from('transactions').select(TX_COLUMNS).in('business_id', ids)
      .gte('created_at', start).lt('created_at', until)
      .order('created_at', { ascending: false }).order('business_id').order('id').limit(10),
  ])
  if (recent.error) throw new Error('Gagal memuat transaksi terbaru. Silakan coba lagi.')
  return { ...summarizeOverview(range, transactions, expenses, manual), recent: (recent.data ?? []) as unknown as TxRow[] }
}
