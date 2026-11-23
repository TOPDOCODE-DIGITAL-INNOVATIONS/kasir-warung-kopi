import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import ts from 'typescript'

const source = fs.readFileSync(fileURLToPath(new URL('../src/lib/billing/owner-billing.ts', import.meta.url)), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText

function load(env) {
  const calls = []
  const modules = {
    'server-only': {},
    react: { cache: fn => fn },
    '@/utils/supabase/admin': { createAdminClient: () => ({ rpc: async (name, args) => { calls.push(name); return { data: { status: 'ok', trial_ends_at: '2000-01-01T00:00:00Z' }, error: null } } }) },
    '@/lib/xendit/env': { xenditEnvironment: () => 'test' },
    '@/lib/business-context': { getBusinessContext: async () => ({ user: { id: 'owner' }, account: { role: 'owner' } }) },
    // Expired trial: with billing on, this owner would be read-only.
    '../../../../shared/billing-access': { TRIAL_DAYS: 14, computeAccess: () => ({ state: 'expired', readOnly: true }) },
  }
  const mod = { exports: {} }
  vm.runInNewContext(compiled, { module: mod, exports: mod.exports, process: { env }, console, require: name => modules[name] })
  return { billing: mod.exports, calls }
}

test('billing switch is off by default: no trial is started and nothing becomes read-only', async () => {
  for (const env of [{ SUPABASE_SERVICE_ROLE_KEY: 'key' }, { SUPABASE_SERVICE_ROLE_KEY: 'key', BILLING_ENABLED: 'false' }, { SUPABASE_SERVICE_ROLE_KEY: 'key', BILLING_ENABLED: 'yes' }]) {
    const { billing, calls } = load(env)
    assert.equal(billing.billingEnabled(), false)
    assert.equal(await billing.readOwnerBilling('owner'), null)
    assert.equal((await billing.getCurrentOwnerAccess()).access.readOnly, false)
    await billing.assertWritable()
    assert.deepEqual(calls, [], 'owner_billing_status (which starts a trial) must not be called')
  }
})

test('BILLING_ENABLED=true restores the subscription rules', async () => {
  const { billing, calls } = load({ SUPABASE_SERVICE_ROLE_KEY: 'key', BILLING_ENABLED: 'true' })
  assert.equal(billing.billingEnabled(), true)
  assert.equal((await billing.getCurrentOwnerAccess()).access.readOnly, true)
  await assert.rejects(billing.assertWritable(), /hanya dapat dilihat/)
  assert.ok(calls.includes('owner_billing_status'))
})
