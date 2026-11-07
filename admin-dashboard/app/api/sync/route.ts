import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    
    // Memeriksa autentikasi API via header Authorization
    const authHeader = request.headers.get('Authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Missing Authorization header' }, { status: 401 })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const body = await request.json()
    const { transactions, transactionItems } = body

    // Mulai proses sinkronisasi data dari kasir offline ke Supabase
    // Karena Supabase API adalah REST-based, kita bisa melakukan insert bulk
    
    let syncedTransactionsCount = 0
    let syncedItemsCount = 0

    if (transactions && transactions.length > 0) {
      const { error: txError } = await supabase
        .from('transactions')
        .upsert(transactions, { onConflict: 'id' })
        
      if (txError) throw txError
      syncedTransactionsCount = transactions.length
    }

    if (transactionItems && transactionItems.length > 0) {
      const { error: itemsError } = await supabase
        .from('transaction_items')
        .upsert(transactionItems, { onConflict: 'id' })
        
      if (itemsError) throw itemsError
      syncedItemsCount = transactionItems.length
    }

    return NextResponse.json({
      success: true,
      message: 'Sync completed successfully',
      data: {
        transactions_synced: syncedTransactionsCount,
        items_synced: syncedItemsCount
      }
    })

  } catch (error: any) {
    console.error('Sync error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
