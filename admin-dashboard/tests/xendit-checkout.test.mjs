import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

function billingModules(env, fetch = globalThis.fetch, modules = {}) {
  const compiled = new Map()
  function load(path) {
    if (!compiled.has(path)) {
      const source = readFileSync(new URL('../src/' + path + '.ts', import.meta.url), 'utf8')
      const code = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
      }).outputText
      const mod = { exports: {} }
      new Function('exports', 'require', 'process', 'fetch', code)(mod.exports, id => {
        if (id === 'server-only') return {}
        if (id in modules) return modules[id]
        if (id.startsWith('@/')) return load(id.slice(2))
        throw new Error('Unexpected dependency ' + id)
      }, { env }, fetch)
      compiled.set(path, mod.exports)
    }
    return compiled.get(path)
  }
  return load
}

test('the deployment selects Xendit mode and rejects the wrong key or database', () => {
  const env = {
    XENDIT_TEST_SECRET_KEY: 'xnd_development_test',
    XENDIT_LIVE_SECRET_KEY: 'xnd_production_live',
    NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
  }
  const config = billingModules(env)('lib/platform-billing/config')
  assert.equal(config.platformBillingEnvironment(), 'test')
  assert.equal(config.platformXenditKey(), env.XENDIT_TEST_SECRET_KEY)
  assert.doesNotThrow(config.assertPlatformBillingDatabase)
  env.NEXT_PUBLIC_SUPABASE_URL = 'https://abxqhjuhleopzstxmvet.supabase.co'
  assert.throws(config.assertPlatformBillingDatabase)
  env.VERCEL_ENV = 'preview'
  assert.throws(config.assertPlatformBillingDatabase)
  env.NEXT_PUBLIC_SUPABASE_URL = 'https://qoqfeoeuzeignsuwnlbv.supabase.co'
  assert.doesNotThrow(config.assertPlatformBillingDatabase)
  env.VERCEL_ENV = 'production'
  assert.equal(config.platformBillingEnvironment(), 'live')
  assert.throws(config.assertPlatformBillingDatabase)
  assert.equal(config.platformXenditKey(), env.XENDIT_LIVE_SECRET_KEY)
  env.XENDIT_LIVE_SECRET_KEY = env.XENDIT_TEST_SECRET_KEY
  assert.throws(config.platformXenditKey, /XENDIT_LIVE_SECRET_KEY/)
})

test('local and preview redirects do not fall back to Production', () => {
  const env = {
    VERCEL_PROJECT_PRODUCTION_URL: 'prod.example.com',
    VERCEL_BRANCH_URL: 'preview.example.com',
  }
  const config = billingModules(env)('lib/platform-billing/config')
  assert.throws(config.platformBillingPublicOrigin, /PLATFORM_BILLING_PUBLIC_URL/)
  env.PLATFORM_BILLING_PUBLIC_URL = 'https://tunnel.example.com/'
  assert.equal(config.platformBillingPublicOrigin(), 'https://tunnel.example.com')
  env.VERCEL_ENV = 'preview'
  env.PLATFORM_BILLING_PUBLIC_URL = ''
  assert.equal(config.platformBillingPublicOrigin(), 'https://preview.example.com')
  assert.equal(config.otherPlatformBillingDashboard(), 'https://prod.example.com/platform')
  env.PLATFORM_BILLING_PUBLIC_URL = 'https://prod.example.com'
  assert.throws(config.platformBillingPublicOrigin)
  env.VERCEL_ENV = 'production'
  env.PLATFORM_BILLING_TEST_DASHBOARD_URL = 'https://preview.example.com'
  assert.equal(config.platformBillingPublicOrigin(), 'https://prod.example.com')
  assert.equal(config.otherPlatformBillingDashboard(), 'https://preview.example.com/platform')
})

test('creating a platform link uses a one-time payment on the master account', async () => {
  const requests = []
  const fetch = async (url, options) => {
    requests.push({ url, headers: options.headers, body: JSON.parse(options.body) })
    return Response.json({
      payment_session_id: 'ps-test',
      payment_link_url: 'https://example.invalid/checkout',
      business_id: 'master-business',
    })
  }
  const checkout = billingModules({}, fetch)('lib/platform-billing/checkout')
  const params = {
    referenceId: 'pay-test-reference',
    customerId: 'customer-test',
    amount: 20000,
    planName: 'Paket Test',
    successReturnUrl: 'https://example.invalid/billing/thanks',
    cancelReturnUrl: 'https://example.invalid/billing/thanks?status=cancelled',
  }
  const account = { secretKey: 'xnd_development_test', businessId: 'master-business' }
  await checkout.createXenditPaymentSession(account, params)
  await checkout.createXenditPaymentSession(account, params)
  await assert.rejects(checkout.createXenditPaymentSession({ ...account, businessId: 'sub-account' }, params), /Business ID/)
  const [first, retry] = requests
  assert.deepEqual(first, retry)
  assert.equal(first.url, 'https://api.xendit.co/sessions')
  assert.equal(first.headers['Idempotency-key'], params.referenceId)
  assert.equal(first.headers['for-user-id'], undefined)
  assert.equal(first.body.session_type, 'PAY')
  assert.equal(first.body.subscription, undefined)
  assert.equal(first.body.success_return_url, params.successReturnUrl)
})

test('checkout never reserves a row or calls Xendit without the required schema', async () => {
  const calls = []
  const ownerId = '00000000-0000-0000-0000-000000000001'
  const modules = {
    'node:crypto': { randomUUID: () => ownerId },
    'next/cache': { revalidatePath: () => {} },
    '@/lib/platform-auth': { requireSuperAdmin: async () => ({ user: { id: ownerId } }) },
    '@/lib/platform-billing/db': {
      billingUnavailableMessage: 'Billing unavailable',
      platformBillingDb: () => ({ rpc: name => calls.push(name) }),
      requirePlatformBillingSchema: async () => { throw new Error('Billing unavailable') },
    },
  }
  const fetch = () => { calls.push('Xendit'); throw new Error('Unexpected request') }
  const { createXenditCheckout } = billingModules({}, fetch, modules)('app/platform/subscriptions/xendit-actions')
  const form = new FormData()
  form.set('owner_id', ownerId)
  form.set('environment', 'test')
  assert.deepEqual(await createXenditCheckout(form), { success: false, message: 'Billing unavailable' })
  form.set('environment', 'live')
  assert.equal((await createXenditCheckout(form)).success, false)
  assert.deepEqual(calls, [])
})
