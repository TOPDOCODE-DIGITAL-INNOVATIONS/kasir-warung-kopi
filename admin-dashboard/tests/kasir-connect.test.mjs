import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'

const root = new URL('..', import.meta.url).pathname

const USERS = {
  'jwt-owner': { id: 'owner-1', app_metadata: { platform_role: 'owner' } },
  'jwt-admin': { id: 'admin-1', app_metadata: { platform_role: 'super_admin' } },
}
const BUSINESSES = [
  { id: '11111111-1111-4111-8111-111111111111', owner_id: 'owner-1', name: 'Cabang A', address: 'Jl. A', sync_token: 'tok-a', pos_config: { products: [] }, created_at: '1' },
  { id: '22222222-2222-4222-8222-222222222222', owner_id: 'owner-1', name: 'Cabang B', address: null, sync_token: 'tok-b', pos_config: null, created_at: '2' },
  { id: '33333333-3333-4333-8333-333333333333', owner_id: 'owner-2', name: 'Milik Orang Lain', address: null, sync_token: 'tok-x', pos_config: null, created_at: '3' },
]

/** Supabase palsu: filter eq() pada tabel businesses, auth berdasarkan email/JWT. */
function fakeClient(jwt) {
  const query = () => {
    const filters = []
    const q = {
      select() { return q }, order() { return q }, limit() { return q },
      eq(k, v) { filters.push([k, v]); return q },
      rows() {
        // RLS: klien dengan JWT hanya melihat cabang miliknya.
        const owner = jwt ? USERS[jwt]?.id : null
        return BUSINESSES.filter(b => (!jwt || b.owner_id === owner) && filters.every(([k, v]) => b[k] === v))
      },
      maybeSingle: async () => ({ data: q.rows()[0] ?? null, error: null }),
      then(resolve) { resolve({ data: q.rows(), error: null }) },
    }
    return q
  }
  return {
    from: () => query(),
    auth: {
      getUser: async token => (USERS[token] ? { data: { user: USERS[token] }, error: null } : { data: { user: null }, error: { message: 'bad' } }),
      signInWithPassword: async ({ email, password }) => {
        if (email === 'owner@x.id' && password === 'benar') return { data: { session: { access_token: 'jwt-owner' } }, error: null }
        if (email === 'admin@x.id' && password === 'benar') return { data: { session: { access_token: 'jwt-admin' } }, error: null }
        return { data: { session: null }, error: { code: 'invalid_credentials' } }
      },
    },
  }
}

function loadRoute() {
  const modules = new Map()
  function load(file) {
    if (modules.has(file)) return modules.get(file).exports
    const target = { exports: {} }; modules.set(file, target)
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
    vm.runInNewContext(code, {
      module: target, exports: target.exports, Response, Request, Headers, URL, JSON, console: { error() {} },
      process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'pk' } },
      require: name => {
        if (name === 'next/server') {
          class NextResponse extends Response { static json(body, init) { return Response.json(body, init) } }
          return { NextResponse }
        }
        if (name === '@supabase/supabase-js') return { createClient: (_u, _k, opts) => fakeClient(opts?.global?.headers?.Authorization?.replace('Bearer ', '')) }
        if (name === '@/utils/supabase/admin') return { createAdminClient: () => fakeClient(null) }
        if (name.startsWith('@/')) return load(path.join(root, 'src', name.slice(2) + '.ts'))
        throw new Error('Unexpected dependency ' + name)
      },
    })
    return target.exports
  }
  return load(path.join(root, 'src/app/api/kasir/connect/route.ts'))
}

const route = loadRoute()
const post = (body, token) => route.POST(new Request('https://x.test/api/kasir/connect', {
  method: 'POST', body: JSON.stringify(body), headers: token ? { Authorization: `Bearer ${token}` } : {},
}))
const get = token => route.GET(new Request('https://x.test/api/kasir/connect', { headers: token ? { Authorization: `Bearer ${token}` } : {} }))

test('login validates input and refuses wrong passwords', async () => {
  assert.equal((await post({ action: 'login', email: 'bukan-email', password: 'x' })).status, 400)
  const wrong = await post({ action: 'login', email: 'owner@x.id', password: 'salah' })
  assert.equal(wrong.status, 401)
  assert.match((await wrong.json()).error, /salah/)
  assert.equal((await post({ action: 'nope' })).status, 400)
})

test('login lists only the owner\'s branches and never exposes sync tokens', async () => {
  const res = await post({ action: 'login', email: 'OWNER@x.id', password: 'benar' })
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.accessToken, 'jwt-owner')
  assert.deepEqual(body.branches.map(b => b.name), ['Cabang A', 'Cabang B'])
  assert.ok(!JSON.stringify(body).includes('tok-'))
})

test('super admin accounts cannot connect a cashier device', async () => {
  assert.equal((await post({ action: 'login', email: 'admin@x.id', password: 'benar' })).status, 403)
})

test('select returns the sync token only for a branch owned by the logged-in owner', async () => {
  assert.equal((await post({ action: 'select', businessId: BUSINESSES[0].id })).status, 401)
  assert.equal((await post({ action: 'select', businessId: BUSINESSES[0].id }, 'jwt-palsu')).status, 401)
  assert.equal((await post({ action: 'select', businessId: 'bukan-uuid' }, 'jwt-owner')).status, 400)
  assert.equal((await post({ action: 'select', businessId: BUSINESSES[2].id }, 'jwt-owner')).status, 404)
  const ok = await (await post({ action: 'select', businessId: BUSINESSES[1].id }, 'jwt-owner')).json()
  assert.deepEqual(ok, { success: true, token: 'tok-b', branch: { id: BUSINESSES[1].id, name: 'Cabang B' }, hasConfig: false })
  const withConfig = await (await post({ action: 'select', businessId: BUSINESSES[0].id }, 'jwt-owner')).json()
  assert.equal(withConfig.hasConfig, true)
})

test('token check identifies the branch without returning its configuration', async () => {
  assert.equal((await get()).status, 401)
  assert.equal((await get('tok-salah')).status, 401)
  const body = await (await get('tok-a')).json()
  assert.deepEqual(body, { success: true, branch: { id: BUSINESSES[0].id, name: 'Cabang A' }, hasConfig: true })
})

test('kasir-connect is an allowed post-login destination', () => {
  const mod = { exports: {} }
  const code = ts.transpileModule(fs.readFileSync(path.join(root, 'src/lib/auth-flow.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  new Function('module', 'exports', code)(mod, mod.exports)
  assert.equal(mod.exports.safeNextPath('/kasir-connect'), '/kasir-connect')
  assert.equal(mod.exports.safeNextPath('//kasir-connect'), null)
})
