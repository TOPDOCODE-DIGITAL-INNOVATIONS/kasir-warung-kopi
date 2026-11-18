import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const root = path.resolve(import.meta.dirname, '..')
const source = fs.readFileSync(path.join(root, 'src/lib/xendit/webhook.ts'), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText
const mod = { exports: {} }
new Function('module', 'exports', 'require', compiled)(mod, mod.exports, require)
const { resolveWebhookEnvironment, parseXenditWebhook } = mod.exports

test('token picks the environment and rejects anything else', () => {
  const tokens = { test: 'tok-test', live: 'tok-live' }
  assert.equal(resolveWebhookEnvironment('tok-test', tokens), 'test')
  assert.equal(resolveWebhookEnvironment('tok-live', tokens), 'live')
  assert.equal(resolveWebhookEnvironment('tok-wrong', tokens), null)
  assert.equal(resolveWebhookEnvironment(null, tokens), null)
  assert.equal(resolveWebhookEnvironment('', { test: '' }), null)
  assert.equal(resolveWebhookEnvironment('tok-live', { test: 'tok-test' }), null)
})

test('payload without event or data is not processed', () => {
  assert.equal(parseXenditWebhook(null), null)
  assert.equal(parseXenditWebhook({ data: {} }), null)
  assert.equal(parseXenditWebhook({ event: 'recurring.cycle.succeeded', data: [] }), null)
})

test('redelivery keeps the dedup key; a new status changes it', () => {
  const base = {
    event: 'recurring.cycle.succeeded', business_id: 'biz', created: '2026-11-18T00:00:00Z',
    data: { id: 'cyc-1', plan_id: 'repl-1', status: 'SUCCEEDED', updated: '2026-11-18T00:00:00Z', attempt_count: 1 },
  }
  const first = parseXenditWebhook(base)
  const retry = parseXenditWebhook({ ...base, created: '2026-11-18T00:05:00Z' })
  const failed = parseXenditWebhook({ ...base, event: 'recurring.cycle.failed', data: { ...base.data, status: 'FAILED' } })
  assert.equal(first.objectId, 'cyc-1')
  assert.equal(first.businessId, 'biz')
  assert.equal(first.dedupKey, retry.dedupKey)
  assert.notEqual(first.dedupKey, failed.dedupKey)
})

test('payment session events use payment_session_id', () => {
  const parsed = parseXenditWebhook({ event: 'payment_session.completed', data: { payment_session_id: 'ps-1', status: 'COMPLETED' } })
  assert.equal(parsed.objectId, 'ps-1')
})
