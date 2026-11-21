import { after, type NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/utils/supabase/admin'
import type { DeviceHealth } from './sync-health'

/** Diisi handler /api/sync selama request; dibaca setelah respons terkirim. */
export type SyncLog = {
  supabase?: SupabaseClient
  businessId: string | null
  deviceCode: string | null
  txCount: number
  expenseCount: number
  health: DeviceHealth | null
  /** Permintaan yang tidak perlu dicatat (mis. pencarian katalog). */
  skip: boolean
}

/** `after()` hanya ada di dalam request Next; di luar itu (uji unit) jalankan langsung. */
function schedule(task: () => Promise<void>) {
  try {
    after(task)
  } catch {
    void task()
  }
}

/**
 * Bungkus handler sync: ukur durasi, tangkap error tak terduga, lalu catat satu baris
 * `sync_events` lewat `after()` sehingga pencatatan tidak memperlambat atau menggagalkan sync.
 */
export function monitorSync(
  direction: 'push' | 'pull',
  handler: (request: Request, log: SyncLog) => Promise<NextResponse>,
  onCrash: (error: unknown) => NextResponse,
) {
  return async (request: Request): Promise<NextResponse> => {
    const started = Date.now()
    const log: SyncLog = { businessId: null, deviceCode: null, txCount: 0, expenseCount: 0, health: null, skip: false }
    let response: NextResponse
    try {
      response = await handler(request, log)
    } catch (error) {
      console.error(`sync ${direction}: unhandled`, error)
      response = onCrash(error)
    }
    if (log.skip) return response

    const durationMs = Date.now() - started
    const status = response.status
    // Badan respons hanya dibaca untuk kegagalan; respons pull yang besar tidak diduplikasi.
    const failure = status >= 400 ? response.clone() : null

    schedule(async () => {
      try {
        let error: string | null = null
        if (failure) {
          const body = await failure.json().catch(() => null) as { error?: unknown } | null
          error = typeof body?.error === 'string' ? body.error : `HTTP ${status}`
          console.error(JSON.stringify({ event: 'sync_failed', direction, status, businessId: log.businessId, deviceCode: log.deviceCode, error, durationMs }))
        }
        const supabase = log.supabase ?? (process.env.SUPABASE_SERVICE_ROLE_KEY ? createAdminClient() : null)
        if (!supabase) return
        const h = log.health
        const { error: insertError } = await supabase.rpc('record_sync_event', {
          p_business: log.businessId,
          p_direction: direction,
          p_http_status: status,
          p_error: error,
          p_device_code: log.deviceCode,
          p_duration_ms: durationMs,
          p_tx_count: log.txCount,
          p_expense_count: log.expenseCount,
          p_pending_tx: h?.pendingTx ?? null,
          p_pending_expenses: h?.pendingExpenses ?? null,
          p_oldest_pending_at: h?.oldestPendingAt ?? null,
          p_client_error: h?.lastError ?? null,
        })
        if (insertError) console.error('sync monitor: record failed', insertError.message)
      } catch (e) {
        console.error('sync monitor: unexpected', e)
      }
    })
    return response
  }
}
