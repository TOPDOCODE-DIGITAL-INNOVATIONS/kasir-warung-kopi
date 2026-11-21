/**
 * Kesehatan sinkronisasi kasir, dihitung dari baris `sync_events`.
 * Murni (tanpa I/O) agar bisa diuji dan dipakai dashboard Owner maupun Platform.
 */

/** Laporan antrean yang dikirim kasir pada push (`body.health`). */
export type DeviceHealth = {
  pendingTx: number
  pendingExpenses: number
  oldestPendingAt: string | null
  lastError: string | null
}

export type SyncEvent = {
  created_at: string
  direction: 'push' | 'pull'
  http_status: number
  error: string | null
  device_code: string | null
  duration_ms: number | null
  pending_tx: number | null
  pending_expenses: number | null
  oldest_pending_at: string | null
  client_error: string | null
}

export type SyncStatus = 'ok' | 'warning' | 'error' | 'never'

export type DeviceSummary = {
  deviceCode: string
  lastSeenAt: string
  lastOk: boolean
  pendingTx: number | null
  pendingExpenses: number | null
  oldestPendingAt: string | null
  /** Error di perangkat sebelum push terakhir (mis. offline / timeout). */
  clientError: string | null
}

export type SyncHealth = {
  status: SyncStatus
  reasons: string[]
  last24h: { total: number; failed: number; avgDurationMs: number | null }
  failuresSinceSuccess: number
  lastFailure: { at: string; direction: 'push' | 'pull'; status: number; error: string | null } | null
  devices: DeviceSummary[]
}

const HOUR = 3600_000
/** Data tertahan di perangkat selama ini dianggap peringatan / masalah. */
export const PENDING_WARN_MS = HOUR
export const PENDING_ERROR_MS = 6 * HOUR
/** Gagal beruntun sebanyak ini tanpa satu pun sukses = masalah. */
export const FAILURE_STREAK_ERROR = 3
/** Cabang yang pernah sync tetapi diam selama ini. */
export const STALE_MS = 24 * HOUR

const MAX_TEXT = 500
const MAX_COUNT = 1_000_000

const count = (v: unknown) => {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) && n >= 0 ? Math.min(Math.floor(n), MAX_COUNT) : 0
}
const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, MAX_TEXT) : null)
const time = (v: unknown, now: number) => {
  if (typeof v !== 'string' || !v) return null
  const t = new Date(v).getTime()
  // Jam perangkat yang maju tidak boleh menghasilkan "tertahan" di masa depan.
  return Number.isNaN(t) ? null : new Date(Math.min(t, now)).toISOString()
}

/** Validasi `body.health` dari kasir; input tidak dikenal -> null. */
export function parseDeviceHealth(v: unknown, now = Date.now()): DeviceHealth | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const o = v as Record<string, unknown>
  return {
    pendingTx: count(o.pendingTx),
    pendingExpenses: count(o.pendingExpenses),
    oldestPendingAt: time(o.oldestPendingAt, now),
    lastError: text(o.lastError),
  }
}

const ms = (iso: string) => new Date(iso).getTime()
const ok = (e: SyncEvent) => e.http_status < 400

function formatAge(age: number): string {
  if (age < HOUR) return `${Math.max(1, Math.round(age / 60_000))} menit`
  if (age < 48 * HOUR) return `${Math.round(age / HOUR)} jam`
  return `${Math.round(age / (24 * HOUR))} hari`
}

/**
 * @param events baris `sync_events` satu cabang (urutan bebas).
 * @param lastSyncedAt `businesses.last_synced_at` (push sukses terakhir).
 */
export function computeSyncHealth(events: SyncEvent[], lastSyncedAt: string | null, now = Date.now()): SyncHealth {
  const sorted = [...events].sort((a, b) => ms(b.created_at) - ms(a.created_at))
  const recent = sorted.filter((e) => now - ms(e.created_at) <= 24 * HOUR)
  const durations = recent.map((e) => e.duration_ms).filter((d): d is number => typeof d === 'number')
  const failed = recent.filter((e) => !ok(e))

  let failuresSinceSuccess = 0
  for (const e of sorted) {
    if (ok(e)) break
    failuresSinceSuccess++
  }
  const lastFailureEvent = sorted.find((e) => !ok(e))

  const devices = new Map<string, DeviceSummary & { pushSeen: boolean }>()
  for (const e of sorted) {
    if (!e.device_code) continue
    const d = devices.get(e.device_code)
    if (!d) {
      devices.set(e.device_code, {
        deviceCode: e.device_code, lastSeenAt: e.created_at, lastOk: ok(e),
        pendingTx: null, pendingExpenses: null, oldestPendingAt: null, clientError: null, pushSeen: false,
      })
    }
    const cur = devices.get(e.device_code)!
    // Antrean diambil dari push terbaru perangkat tersebut. Angkanya dihitung saat push dimulai:
    // push yang berhasil sudah mengirim antrean itu, jadi hanya push gagal yang menyisakan data.
    if (e.direction === 'push' && !cur.pushSeen) {
      cur.pushSeen = true
      cur.clientError = e.client_error
      if (!ok(e) && e.pending_tx !== null) {
        cur.pendingTx = e.pending_tx
        cur.pendingExpenses = e.pending_expenses
        cur.oldestPendingAt = e.oldest_pending_at
      }
    }
  }

  const errors: string[] = []
  const warnings: string[] = []
  if (failuresSinceSuccess >= FAILURE_STREAK_ERROR) {
    errors.push(`${failuresSinceSuccess} sync terakhir gagal berturut-turut.`)
  } else if (failed.length) {
    warnings.push(`${failed.length} sync gagal dalam 24 jam terakhir.`)
  }
  for (const d of devices.values()) {
    const pending = (d.pendingTx ?? 0) + (d.pendingExpenses ?? 0)
    if (!pending || !d.oldestPendingAt) continue
    const age = Math.max(0, now - ms(d.oldestPendingAt))
    const msg = `Perangkat ${d.deviceCode}: ${pending} data belum terkirim sejak ${formatAge(age)} lalu.`
    if (age >= PENDING_ERROR_MS) errors.push(msg)
    else if (age >= PENDING_WARN_MS) warnings.push(msg)
  }
  if (lastSyncedAt && now - ms(lastSyncedAt) >= STALE_MS) {
    warnings.push(`Tidak ada sync berhasil selama ${formatAge(now - ms(lastSyncedAt))}.`)
  }

  const status: SyncStatus = errors.length ? 'error'
    : warnings.length ? 'warning'
    : !lastSyncedAt && !sorted.length ? 'never'
    : 'ok'

  return {
    status,
    reasons: [...errors, ...warnings],
    last24h: {
      total: recent.length,
      failed: failed.length,
      avgDurationMs: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
    },
    failuresSinceSuccess,
    lastFailure: lastFailureEvent
      ? { at: lastFailureEvent.created_at, direction: lastFailureEvent.direction, status: lastFailureEvent.http_status, error: lastFailureEvent.error }
      : null,
    devices: [...devices.values()].map(({ pushSeen: _seen, ...d }) => d),
  }
}
