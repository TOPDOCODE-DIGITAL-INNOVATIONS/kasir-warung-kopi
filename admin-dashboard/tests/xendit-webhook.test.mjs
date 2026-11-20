import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'

const require = createRequire(import.meta.url)

function load(path, overrides = {}) {
  const source = readFileSync(new URL('../src/' + path + '.ts', import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const mod = { exports: {} }
  new Function('exports', 'require', compiled)(mod.exports, id => overrides[id] ?? require(id))
  return mod.exports
}

const webhook = load('lib/platform-billing/webhook')
const event = {
  event: 'payment_session.completed', business_id: 'master-business',
  data: { session_type: 'PAY', reference_id: 'pay-test-checkout', payment_session_id: 'ps-checkout', status: 'COMPLETED' },
}

test('platform PAY session parsing ignores recurring events and uses the actual session ID', () => {
  assert.equal(webhook.parseXenditWebhook(null), null)
  assert.equal(webhook.parseXenditWebhook({ ...event, event: 'recurring.cycle.succeeded' }), null)
  assert.equal(webhook.parseXenditWebhook({ ...event, data: { ...event.data, session_type: 'SUBSCRIPTION' } }), null)
  const parsed = webhook.parseXenditWebhook({ ...event, data: { ...event.data, id: 'other-id' } })
  assert.equal(parsed.objectId, 'ps-checkout')
  assert.equal(parsed.businessId, 'master-business')
  assert.equal(parsed.dedupKey, webhook.parseXenditWebhook({ ...event, created: '2026-11-20T00:05:00Z' }).dedupKey)
})

test('webhook isolates references, account and database readiness before ingest', async () => {
  const saved = []
  let ready = true
  const { POST } = load('app/api/xendit/subscriptions/webhook/route', {
    'next/server': { NextResponse: Response },
    '@/lib/platform-billing/config': {
      platformBillingEnvironment: () => 'test',
      platformXenditWebhookConfig: () => ({ businessId: 'master-business', token: 'test-token' }),
    },
    '@/lib/platform-billing/webhook': webhook,
    '@/lib/platform-billing/db': {
      platformBillingDb: () => ({ rpc: (_name, args) => { saved.push(args); return { data: 'applied' } } }),
      requirePlatformBillingSchema: async () => { if (!ready) throw new Error('Not ready') },
    },
  })
  const post = (body, token = 'test-token') => POST(new Request('https://example.invalid/webhook', {
    method: 'POST', headers: { 'x-callback-token': token }, body: JSON.stringify(body),
  }))
  assert.equal((await post(event, 'live-token')).status, 401)
  assert.equal((await post({ ...event, business_id: 'sub-account' })).status, 403)
  assert.equal((await post({ ...event, data: { ...event.data, business_id: 'sub-account' } })).status, 403)
  assert.equal((await (await post({ ...event, data: { ...event.data, reference_id: 'pos-sale' } })).json()).result, 'ignored')
  assert.equal((await (await post({ ...event, data: { ...event.data, reference_id: 'pay-live-foreign' } })).json()).result, 'ignored')
  ready = false
  assert.equal((await post(event)).status, 500)
  assert.deepEqual(saved, [])
  ready = true
  assert.equal((await post(event)).status, 200)
  assert.equal(saved[0].p_environment, 'test')
  assert.equal(saved[0].p_object_id, 'ps-checkout')
})
