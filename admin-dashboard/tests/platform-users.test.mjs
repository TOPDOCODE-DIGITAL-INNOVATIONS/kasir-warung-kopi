import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { bootstrapSuperAdmin } from '../../scripts/bootstrap-super-admin.mjs'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const root = path.resolve(import.meta.dirname, '..')
function load(relative, dependencies = {}) {
  const file = path.resolve(root, relative)
  const target = { exports: {} }
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  vm.runInNewContext(compiled, {
    module: target, exports: target.exports, FormData, console, Date, TextEncoder, Uint8Array,
    process: { env: { SUPABASE_SERVICE_ROLE_KEY: 'fixture-key' } },
    require(name) {
      if (name in dependencies) return dependencies[name]
      if (name === 'server-only') return {}
      if (name === 'react') return { cache: callback => callback }
      if (name === 'next/navigation') return { redirect: path => { throw new Error(path) } }
      if (name === '@/lib/platform-account') return load('src/lib/platform-account.ts', dependencies)
      if (name.startsWith('node:')) return require(name)
      if (name.startsWith('.')) return load(path.relative(root, path.resolve(path.dirname(file), name + '.ts')), dependencies)
      throw new Error(`Unexpected dependency ${name}`)
    },
  })
  return target.exports
}
const account = load('src/lib/platform-account.ts')
const security = load('../app-kasir/src/lib/security.ts')
const plain = value => JSON.parse(JSON.stringify(value))

test('platform authorization ignores editable metadata and preserves legacy owner access', () => {
  assert.deepEqual(plain(account.platformAccount({ app_metadata: {}, user_metadata: { role: 'super_admin' } })), { role: 'owner', status: 'active' })
  assert.equal(account.platformAccount({ app_metadata: { platform_role: 'super_admin' } }).role, 'super_admin')
  assert.throws(() => account.platformAccount({ app_metadata: { platform_role: 'admin' } }), /Role/)
  assert.throws(() => account.platformAccount({ app_metadata: { account_status: 'bogus' } }), /Status/)
  assert.equal(account.platformAccount({ app_metadata: { account_status: 'inactive' } }).status, 'inactive')
})

test('super admin guard verifies current Auth data and rejects signed-out, owner and inactive users', async () => {
  for (const user of [null, { app_metadata: {} }, { app_metadata: { platform_role: 'super_admin', account_status: 'inactive' } }]) {
    const guard = load('src/lib/platform-auth.ts', {
      '@/utils/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }) },
    })
    await assert.rejects(guard.requireSuperAdmin())
  }
  const user = { id: 'platform-admin', app_metadata: { platform_role: 'super_admin', account_status: 'active' } }
  const guard = load('src/lib/platform-auth.ts', {
    '@/utils/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }) },
  })
  assert.equal((await guard.requireSuperAdmin()).user.id, user.id)
})

test('platform Owner actions recheck the current actor before using the service client', async () => {
  const action = load('src/app/platform/owners/actions.ts', {
    'next/cache': { revalidatePath() {} },
    '@/lib/platform-auth': { requireSuperAdmin: async () => { throw new Error('Forbidden') } },
    '@/utils/supabase/admin': { createAdminClient: () => { assert.fail('Unauthorized request reached the service client') } },
  })
  await assert.rejects(action.getOwnerPage({}), /Forbidden/)
  await assert.rejects(action.getOwnerDetail('e8110000-0000-0000-0000-000000000003', '1'), /Forbidden/)
  await assert.rejects(action.setOwnerStatus(new FormData()), /Forbidden/)
})

test('Owner status changes use the server actor and check the previous status', async () => {
  const id = 'e8110000-0000-0000-0000-000000000003'
  const form = new FormData()
  for (const [key, value] of Object.entries({ id, previous_status: 'active', status: 'inactive', p_actor: 'forged' })) {
    form.set(key, value)
  }
  let stored = false
  const refreshes = []
  const action = load('src/app/platform/owners/actions.ts', {
    'next/cache': { revalidatePath(path) { refreshes.push(path) } },
    '@/lib/platform-auth': { requireSuperAdmin: async () => ({ user: { id: 'verified-actor' } }) },
    '@/utils/supabase/admin': { createAdminClient: () => ({ rpc: async (name, args) => {
      assert.equal(name, 'platform_set_owner_status')
      assert.deepEqual(plain(args), { p_actor: 'verified-actor', p_owner: id, p_expected_status: 'active', p_status: 'inactive' })
      const data = !stored
      stored = true
      return { data, error: null }
    } }) },
  })
  assert.equal((await action.setOwnerStatus(form)).success, true)
  assert.equal((await action.setOwnerStatus(form)).success, false)
  assert.deepEqual(refreshes, ['/platform/owners', '/platform'])
})

test('starting a trial uses the verified actor and server duration and refreshes billing pages once', async () => {
  const id = 'e8130000-0000-0000-0000-000000000003'
  const form = new FormData()
  for (const [key, value] of Object.entries({ owner_id: id, environment: 'test', p_actor: 'forged', duration: '60' })) {
    form.set(key, value)
  }
  const path = 'src/app/platform/subscriptions/trial-actions.ts'
  const forbidden = load(path, {
    'next/cache': { revalidatePath() { assert.fail('Unauthorized request refreshed the route') } },
    '@/lib/platform-auth': { requireSuperAdmin: async () => { throw new Error('Forbidden') } },
    '@/utils/supabase/admin': { createAdminClient: () => { assert.fail('Unauthorized request reached the service client') } },
  })
  await assert.rejects(forbidden.startTrial(form), /Forbidden/)

  let calls = 0
  const refreshes = []
  const action = load(path, {
    'next/cache': { revalidatePath(pathname) { refreshes.push(pathname) } },
    '@/lib/platform-auth': { requireSuperAdmin: async () => ({ user: { id: 'verified-actor' } }) },
    '@/utils/supabase/admin': { createAdminClient: () => ({ rpc: async (name, args) => {
      assert.equal(name, 'platform_start_trial')
      assert.deepEqual(plain(args), { p_actor: 'verified-actor', p_owner: id, p_environment: 'test', p_duration_days: 14 })
      return { data: ++calls === 1 ? 'started' : 'trial_already_used', error: null }
    } }) },
  })
  assert.equal((await action.startTrial(form)).success, true)
  assert.equal((await action.startTrial(form)).success, false)
  form.set('environment', 'unknown')
  assert.equal((await action.startTrial(form)).success, false)
  assert.equal(calls, 2)
  assert.deepEqual(refreshes, ['/platform/subscriptions', `/platform/subscriptions/${id}`])
})

const branchId = 'e8200000-0000-0000-0000-000000000001'
const version = '2026-11-16T01:00:00.000Z'
function fixture({ active = branchId, initialized = true, race = false, owned = true } = {}) {
  const original = { products: [{ id: 'latte', options: [{ name: 'Suhu' }] }], categories: [{ id: 'coffee' }], cashiers: [{ id: 'owner-profile', name: 'Existing', role: 'Owner', pinHash: 'existing-hash', pinSalt: 'existing-salt' }], settings: { storeName: 'Original store' }, custom: { preserved: true } }
  const branch = { id: branchId, name: 'Fixture branch', owner_id: owned ? 'owner-account' : 'foreign', pos_config: initialized ? structuredClone(original) : null, pos_config_updated_at: version }
  const queries = []
  const db = { from(table) {
    const query = { table, filters: [], values: null, columns: '' }; queries.push(query)
    const q = {
      select(columns) { query.columns = columns; return this },
      eq(key, value) { query.filters.push([key, value]); return this },
      is(key, value) { return this.eq(key, value) },
      order() { return this }, limit() { return this }, gt() { return this },
      update(values) { query.values = values; return this },
      maybeSingle: async () => ({ data: matches() ? structuredClone(branch) : null, error: null }),
      then(resolve) {
        if (query.values && race) branch.pos_config_updated_at = '2026-11-16T02:00:00.000Z'
        const matched = matches()
        if (query.values && matched) Object.assign(branch, query.values)
        const result = matched ? [{ ...branch, config: branch.pos_config }] : []
        return Promise.resolve({ data: result, error: null }).then(resolve)
      },
    }
    function matches() { return query.filters.every(([key, value]) => branch[key] === value) }
    return q
  } }
  const actions = load('src/app/dashboard/users/actions.ts', {
    'next/cache': { revalidatePath() {} },
    '@/utils/supabase/server': { createClient: async () => db },
    '@/lib/business-context': { getBusinessContext: async () => ({ supabase: db, user: { id: 'owner-account' }, businessId: active, businesses: [{ id: branchId, name: branch.name }] }) },
  })
  return { actions, branch, original, queries }
}
function form(overrides = {}) {
  const data = new FormData()
  for (const [key, value] of Object.entries({ business_id: branchId, config_version: version, name: 'New cashier', role: 'Kasir', avatar_color: 'bg-amber-600 text-white', pin: '016789', pin_confirmation: '016789', ...overrides })) data.set(key, value)
  return data
}

test('adding cashier keeps all existing config and uses PIN hashing compatible with POS', async () => {
  const f = fixture()
  assert.equal((await f.actions.addCashier(form())).success, true)
  const config = plain(f.branch.pos_config)
  assert.deepEqual({ ...config, cashiers: f.original.cashiers }, f.original)
  assert.equal(config.cashiers.length, 2)
  const cashier = config.cashiers[1]
  assert.match(cashier.id, /^c-[\da-f-]{36}$/)
  assert.equal(cashier.isActive, false)
  assert.equal('pin' in cashier, false)
  assert.equal(security.verifyPin(cashier, '016789'), true)
  assert.equal(security.verifyPin(cashier, '16789'), false)
  assert.equal(f.queries.length, 2)
  for (const query of f.queries) assert.ok(query.filters.some(([key, value]) => key === 'owner_id' && value === 'owner-account'))
  // Retry with the old config version must not duplicate a created profile.
  assert.equal((await f.actions.addCashier(form())).success, false)
  assert.equal(f.branch.pos_config.cashiers.length, 2)
})

test('cashier list never returns PIN hashes, plaintext or salts to the browser', async () => {
  const f = fixture()
  const result = await f.actions.getCashierUsers(branchId)
  assert.equal(result.configuration.ready, true)
  assert.equal(result.users[0].hasPin, true)
  assert.doesNotMatch(JSON.stringify(result), /existing-hash|existing-salt|pinHash|pinSalt/)
})

test('cashier creation rejects foreign or changed branch context, stale writes and uninitialized config', async () => {
  for (const options of [{ active: 'another-branch' }, { owned: false }, { race: true }, { initialized: false }]) {
    const f = fixture(options)
    const before = JSON.stringify(f.branch.pos_config)
    assert.equal((await f.actions.addCashier(form())).success, false)
    assert.equal(JSON.stringify(f.branch.pos_config), before)
  }
})

test('registration sends only descriptive name metadata even when the form requests super_admin', async () => {
  let sent
  const registration = load('src/app/register/actions.ts', {
    'next/cache': { revalidatePath() {} },
    'next/navigation': { redirect() { throw new Error('Unexpected redirect') } },
    '@/lib/site-url': { getSiteUrl: async () => 'http://localhost:3000' },
    '@/utils/supabase/server': { createClient: async () => ({ auth: {
      getUser: async () => ({ data: { user: null } }),
      signUp: async input => { sent = input; return { data: { session: null }, error: null } },
    } }) },
  })
  const input = new FormData()
  for (const [key, value] of Object.entries({ name: 'New owner', email: 'owner@example.invalid', password: '12345678', confirmPassword: '12345678', role: 'super_admin', platform_role: 'super_admin' })) input.set(key, value)
  assert.equal((await registration.register({ status: 'idle', message: '' }, input)).status, 'success')
  assert.deepEqual(plain(sent.options.data), { name: 'New owner' })
  assert.equal('app_metadata' in sent, false)
})

test('cashier validation rejects platform roles, invalid PINs, mismatch, missing version and unsafe color', async () => {
  for (const overrides of [{ role: 'super_admin' }, { pin: '12ab', pin_confirmation: '12ab' }, { pin_confirmation: '1111' }, { name: ' ' }, { avatar_color: '#fff' }]) {
    const f = fixture()
    assert.equal((await f.actions.addCashier(form(overrides))).success, false)
    assert.equal(f.queries.length, 0)
  }
  const f = fixture(), data = form()
  data.delete('config_version')
  assert.equal((await f.actions.addCashier(data)).success, false)
})

function authAdmin(overrides = {}) {
  const user = { id: 'existing-user', email: 'owner@example.invalid', email_confirmed_at: '2026-11-16', app_metadata: { provider: 'email', providers: ['email'], custom: 'preserve' }, ...overrides }
  const updates = []
  return { user, updates, admin: {
    listUsers: async () => ({ data: { users: [user] }, error: null }),
    getUserById: async () => ({ data: { user }, error: null }),
    updateUserById: async (id, values) => { updates.push({ id, values }); Object.assign(user, values); return { error: null } },
  } }
}
test('bootstrap defaults to preview, preserves providers, and repeats without changing passwords or accounts', async () => {
  const f = authAdmin()
  const opts = { email: f.user.email }
  assert.equal((await bootstrapSuperAdmin(f.admin, opts)).preview, true)
  assert.equal(f.updates.length, 0)
  assert.equal((await bootstrapSuperAdmin(f.admin, { ...opts, apply: true })).changed, true)
  assert.deepEqual(f.user.app_metadata, { provider: 'email', providers: ['email'], custom: 'preserve', platform_role: 'super_admin', account_status: 'active' })
  assert.deepEqual(Object.keys(f.updates[0].values), ['app_metadata'])
  assert.equal((await bootstrapSuperAdmin(f.admin, { ...opts, apply: true })).changed, false)
  assert.equal(f.updates.length, 1)
})

test('bootstrap rejects unknown email, unconfirmed and inactive accounts', async () => {
  for (const overrides of [{ email_confirmed_at: null }, { app_metadata: { account_status: 'inactive' } }]) {
    const f = authAdmin(overrides)
    await assert.rejects(bootstrapSuperAdmin(f.admin, { email: f.user.email, apply: true }))
    assert.equal(f.updates.length, 0)
  }
  const f = authAdmin()
  await assert.rejects(bootstrapSuperAdmin(f.admin, { email: 'missing@example.invalid', apply: true }))
  assert.equal(f.updates.length, 0)
})
