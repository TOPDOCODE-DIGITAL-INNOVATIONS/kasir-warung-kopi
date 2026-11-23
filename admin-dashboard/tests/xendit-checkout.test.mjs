import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

const source = readFileSync(new URL('../src/lib/xendit/client.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText

const cases = [
  { name: 'monthly at the end of a month', intervalMonths: 1, created: '2026-01-31T09:00:00Z', anchor: '2026-02-28T09:00:00.000Z' },
  { name: 'yearly on a leap day', intervalMonths: 12, created: '2028-02-29T09:00:00Z', anchor: '2029-02-28T09:00:00.000Z' },
]

for (const { name, intervalMonths, created, anchor } of cases) {
  test('checkout schedules the next Xendit cycle for ' + name, async () => {
    const mod = { exports: {} }
    const requests = []
    const fetch = async (url, options) => {
      requests.push({ url, headers: options.headers, body: JSON.parse(options.body) })
      return Response.json({
        payment_session_id: 'ps-test',
        payment_link_url: 'https://example.invalid/checkout',
        expires_at: new Date(Date.parse(created) + 30 * 60_000).toISOString(),
      })
    }
    new Function('exports', 'require', 'process', 'fetch', compiled)(
      mod.exports, () => ({}), { env: { XENDIT_SECRET_KEY: 'xnd_development_test' } }, fetch,
    )
    const params = {
      environment: 'test',
      referenceId: 'checkout-test',
      customerId: 'customer-test',
      amount: 20000,
      intervalMonths,
      planName: 'Paket Test',
      ownerName: 'Owner Test',
      ownerEmail: 'owner@example.invalid',
      successReturnUrl: 'https://example.invalid/success',
      cancelReturnUrl: 'https://example.invalid/cancel',
      checkoutCreatedAt: new Date(created),
    }
    const session = await mod.exports.createXenditSubscriptionSession(params)
    await mod.exports.createXenditSubscriptionSession(params)

    const [request, retry] = requests
    assert.equal(request.url, 'https://api.xendit.co/sessions')
    assert.equal(request.headers['api-version'], undefined)
    assert.deepEqual(request.body.subscription, {
      immediate_payment: true,
      schedule: { interval: 'MONTH', interval_count: intervalMonths, anchor_date: anchor },
    })
    assert.ok(Date.parse(anchor) > Date.parse(session.expiresAt))
    assert.equal(retry.headers['Idempotency-key'], params.referenceId)
    assert.deepEqual(retry, request)
  })
}

test('recurring plan operations use the Subscriptions API version', async () => {
  const mod = { exports: {} }
  const requests = []
  const fetch = async (url, options) => {
    requests.push({ url, method: options.method, apiVersion: options.headers['api-version'] })
    return Response.json({ data: [] })
  }
  new Function('exports', 'require', 'process', 'fetch', compiled)(
    mod.exports, () => ({}), { env: { XENDIT_SECRET_KEY: 'xnd_development_test' } }, fetch,
  )
  const client = mod.exports
  await client.getXenditRecurringPlan('test', 'repl_test')
  await client.getXenditPlanCycles('test', 'repl_test')
  await client.deactivateXenditRecurringPlan('test', 'repl_test')
  await client.simulateXenditCyclePayment('test', 'repl_test', 'recy_test', 20000)

  const planUrl = 'https://api.xendit.co/recurring/plans/repl_test'
  assert.deepEqual(requests, [
    { url: planUrl, method: 'GET', apiVersion: '2026-01-01' },
    { url: planUrl + '/cycles?limit=25', method: 'GET', apiVersion: '2026-01-01' },
    { url: planUrl + '/deactivate', method: 'POST', apiVersion: '2026-01-01' },
    { url: planUrl + '/cycles/recy_test/simulate', method: 'POST', apiVersion: '2026-01-01' },
  ])
})
