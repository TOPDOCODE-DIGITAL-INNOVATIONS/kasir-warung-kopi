import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const loaded = { exports: {} }
const code = ts.transpileModule(fs.readFileSync(new URL('../src/lib/sync-health.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText
vm.runInNewContext(code, { module: loaded, exports: loaded.exports })
const { computeSyncHealth: computeRaw, parseDeviceHealth } = loaded.exports
// Objects created inside the vm context have foreign prototypes; compare plain copies.
const computeSyncHealth = (...args) => JSON.parse(JSON.stringify(computeRaw(...args)))

const NOW = Date.parse('2026-11-21T12:00:00Z')
const ago = (minutes) => new Date(NOW - minutes * 60_000).toISOString()
const event = (over = {}) => ({
  created_at: ago(5), direction: 'push', http_status: 200, error: null, device_code: 'KSR-1', duration_ms: 400,
  pending_tx: null, pending_expenses: null, oldest_pending_at: null, client_error: null, ...over,
})

test('a branch with no events and no sync is reported as never synced', () => {
  const h = computeSyncHealth([], null, NOW)
  assert.equal(h.status, 'never')
  assert.deepEqual(h.reasons, [])
  assert.equal(h.lastFailure, null)
})

test('recent successful syncs are healthy and averaged over 24 hours only', () => {
  const h = computeSyncHealth([event({ duration_ms: 200 }), event({ created_at: ago(30), duration_ms: 600 }), event({ created_at: ago(60 * 30), duration_ms: 9000 })], ago(5), NOW)
  assert.equal(h.status, 'ok')
  assert.equal(h.last24h.total, 2)
  assert.equal(h.last24h.avgDurationMs, 400)
})

test('an isolated failure followed by success is a warning, not an error', () => {
  const h = computeSyncHealth([event(), event({ created_at: ago(20), http_status: 500, error: 'timeout' })], ago(5), NOW)
  assert.equal(h.status, 'warning')
  assert.equal(h.failuresSinceSuccess, 0)
  assert.equal(h.lastFailure.error, 'timeout')
})

test('three consecutive failures without a success is an error regardless of input order', () => {
  const events = [
    event({ created_at: ago(1), http_status: 500, error: 'db down' }),
    event({ created_at: ago(40) }),
    event({ created_at: ago(3), http_status: 500 }),
    event({ created_at: ago(2), direction: 'pull', http_status: 502 }),
  ].reverse()
  const h = computeSyncHealth(events, ago(40), NOW)
  assert.equal(h.status, 'error')
  assert.equal(h.failuresSinceSuccess, 3)
  assert.equal(h.lastFailure.error, 'db down')
})

test('a backlog is only stuck when the latest push from that device failed', () => {
  const sent = computeSyncHealth([event({ pending_tx: 40, pending_expenses: 2, oldest_pending_at: ago(60 * 8) })], ago(5), NOW)
  assert.equal(sent.status, 'ok')
  assert.equal(sent.devices[0].pendingTx, null)

  const stuck = computeSyncHealth([
    event({ http_status: 500, pending_tx: 40, pending_expenses: 2, oldest_pending_at: ago(60 * 8) }),
    event({ created_at: ago(60), pending_tx: 1, oldest_pending_at: ago(61) }),
  ], ago(60), NOW)
  assert.equal(stuck.status, 'error')
  assert.equal(stuck.devices[0].pendingTx, 40)
  assert.match(stuck.reasons.join(' '), /KSR-1: 42 data belum terkirim sejak 8 jam/)
})

test('a backlog between one and six hours old is a warning', () => {
  const h = computeSyncHealth([event({ http_status: 500, pending_tx: 3, oldest_pending_at: ago(90) }), event({ created_at: ago(100) })], ago(100), NOW)
  assert.equal(h.status, 'warning')
})

test('devices are summarised separately using each device latest push', () => {
  const h = computeSyncHealth([
    event({ device_code: 'A', created_at: ago(1), direction: 'pull' }),
    event({ device_code: 'A', created_at: ago(2), client_error: 'Failed to fetch' }),
    event({ device_code: 'B', created_at: ago(3), http_status: 401 }),
    event({ device_code: null, created_at: ago(4), http_status: 401 }),
  ], ago(2), NOW)
  assert.deepEqual(h.devices.map((d) => [d.deviceCode, d.lastOk, d.clientError]), [['A', true, 'Failed to fetch'], ['B', false, null]])
  assert.equal('pushSeen' in h.devices[0], false)
})

test('a branch silent for a day is flagged as stale', () => {
  const h = computeSyncHealth([], ago(60 * 30), NOW)
  assert.equal(h.status, 'warning')
  assert.match(h.reasons[0], /30 jam/)
})

test('device health input is clamped and sanitised', () => {
  assert.equal(parseDeviceHealth(null), null)
  assert.equal(parseDeviceHealth([1]), null)
  const future = new Date(NOW + 3600_000).toISOString()
  assert.deepEqual(
    JSON.parse(JSON.stringify(parseDeviceHealth({ pendingTx: -4, pendingExpenses: '7', oldestPendingAt: future, lastError: '  x'.padEnd(900, 'y') }, NOW))),
    { pendingTx: 0, pendingExpenses: 7, oldestPendingAt: new Date(NOW).toISOString(), lastError: 'x'.padEnd(500, 'y') },
  )
  assert.equal(parseDeviceHealth({ pendingTx: 1, oldestPendingAt: 'nope', lastError: '' }, NOW).oldestPendingAt, null)
})
