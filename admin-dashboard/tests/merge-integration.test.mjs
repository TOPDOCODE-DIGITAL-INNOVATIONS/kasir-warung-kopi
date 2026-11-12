import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const sourceRoot = path.resolve(import.meta.dirname, '../src')

function database({ missingHistory = false } = {}) {
  const tables = {
    businesses: [{ id: 'a', name: 'Cabang A', sync_token: 'test-token', pos_config: null, pos_config_updated_at: null }, { id: 'b', name: 'Cabang B' }],
    products: [
      { business_id: 'a', id: 'live', name: 'Nama admin', price: 23000, cost_price: 10000, stock: 10, is_active: true, can_sell: true, pos_sync_enabled: false, pos_managed: true, raw: { _inventory: { events: [{ id: 'stock-event' }] } } },
      { business_id: 'a', id: 'archived', is_active: false, can_sell: true },
      { business_id: 'a', id: 'ingredient', is_active: true, can_sell: false },
    ],
    transactions: [], expenses: [], shifts: [], draft_orders: [], manual_summaries: [], book_period_rules: [], deleted_records: [],
  }
  const queries = []
  const db = {
    from(table) {
      const log = { table, filters: [], op: 'select', values: [] }; queries.push(log)
      let limit = Infinity, offset = 0
      const q = {
        select() { return this }, order() { return this }, abortSignal() { return this },
        eq(k, v) { log.filters.push([k, v, 'eq']); return this },
        is(k, v) { return this.eq(k, v) },
        in(k, v) { log.filters.push([k, v, 'in']); return this },
        gte(k, v) { log.filters.push([k, v, 'gte']); return this },
        lt(k, v) { log.filters.push([k, v, 'lt']); return this },
        lte(k, v) { log.filters.push([k, v, 'lte']); return this },
        or(value) { log.or = value; return this },
        limit(n) { limit = n; return this }, range(a, z) { offset = a; limit = z-a+1; return this },
        update(values) { log.op = 'update'; log.values = [values]; return this },
        upsert(values) { log.op = 'upsert'; log.values = values; return this },
        delete() { log.op = 'delete'; return this },
        maybeSingle: async () => ({ data: execute()[0] ?? null, error: null }),
        then(resolve) {
          if (missingHistory && table === 'transactions' && log.op === 'upsert' && log.values.some(row => row.edit_history)) {
            return Promise.resolve({ data: null, error: { code: 'PGRST204', message: "Could not find the 'edit_history' column of 'transactions' in the schema cache" } }).then(resolve)
          }
          return Promise.resolve({ data: execute(), error: null }).then(resolve)
        },
      }
      function execute() {
        const matching = row => log.filters.every(([key, v, op]) => op === 'eq' ? row[key] === v : op === 'in' ? v.includes(row[key]) : op === 'gte' ? row[key] >= v : op === 'lte' ? row[key] <= v : row[key] < v)
        const matched = tables[table].filter(matching)
        if (log.op === 'update') matched.forEach(row => Object.assign(row, log.values[0]))
        if (log.op === 'delete') tables[table] = tables[table].filter(row => !matching(row))
        if (log.op === 'upsert') for (const row of log.values) {
          const existing = tables[table].find(r => r.id === row.id && r.business_id === row.business_id)
          if (existing) Object.assign(existing, row)
          else tables[table].push({ ...row })
        }
        return matched.slice(offset, offset + limit)
      }
      return q
    },
    rpc(name, args) {
      queries.push({ table: `rpc:${name}`, filters: [], args })
      if (name === 'book_recap') return Promise.resolve({ data: [], error: null })
      const total = tables.transactions.filter(t => !args.p_business || t.business_id === args.p_business).reduce((sum, t) => sum + t.grand_total, 0)
      return Promise.resolve({ data: { today: '2026-11-12', daily: [{ day: '2026-11-12', sales: total, count: 2 }], top_products: [], unpaid_debt: 0, month_expenses: 0, period_sales: total, period_overpay: 0, period_start: '2026-11-01', period_end: '2026-11-30' }, error: null })
    },
  }
  return { db, tables, queries }
}

function request(fixture, businessId = 'a') {
  const modules = new Map()
  function load(file) {
    if (modules.has(file)) return modules.get(file).exports
    const target = { exports: {} }; modules.set(file, target)
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText
    const getContext = async () => ({ supabase: fixture.db, businessId, businesses: fixture.tables.businesses, user: { id: 'owner' } })
    vm.runInNewContext(code, { module: target, exports: target.exports, Request, Response, Headers, URL, URLSearchParams, console: { error() {}, warn() {} }, require: name => {
      if (name === '@/lib/business-context') return { getBusinessContext: getContext, EMPTY_BUSINESS_ID: '00000000-0000-0000-0000-000000000000' }
      if (name === '@/utils/supabase/admin') return { createAdminClient: () => fixture.db }
      if (name === '@/utils/supabase/server') return { createClient: async () => fixture.db }
      if (name === 'next/link') return { __esModule: true, default: 'a' }
      if (name.startsWith('@/') || name.startsWith('.')) {
        const base = name.startsWith('@/') ? path.join(sourceRoot, name.slice(2)) : path.resolve(path.dirname(file), name)
        const dependency = ['.ts', '.tsx'].map(ext => base + ext).find(fs.existsSync)
        if (/^['"]use client['"]/.test(fs.readFileSync(dependency, 'utf8'))) return { __esModule: true, default: path.basename(dependency, '.tsx') }
        return load(dependency)
      }
      return require(name)
    } })
    return target.exports
  }
  return file => load(path.join(sourceRoot, file))
}

const text = tree => JSON.stringify(tree, (key, value) => key === 'type' || key === '_owner' ? undefined : value)
function child(tree, type) {
  if (!tree) return undefined
  if (Array.isArray(tree)) return tree.map(node => child(node, type)).find(Boolean)
  if (tree.type === type) return tree
  return child(tree.props?.children, type)
}
const config = { products: [{ id: 'live', name: 'Nama lama', price: 1, stock: 999 }, { id: 'archived' }, { id: 'ingredient' }], categories: [], cashiers: [{ id: 'cashier', name: 'Owner' }], settings: { storeName: 'Test' } }
const post = body => new Request('http://local.test/api/sync', { method: 'POST', headers: { 'x-api-key': 'test-token', 'content-type': 'application/json' }, body: JSON.stringify(body) })

test('merged sync accepts config, drafts and edit history while preserving inventory data', async () => {
  const fixture = database(), load = request(fixture)
  const response = await load('app/api/sync/route.ts').POST(post({ config, configEditedAt: new Date().toISOString(), transactions: [{ id: 'tx-a', grandTotal: 23000, editHistory: [{ reason: 'Correction' }] }], drafts: [{ id: 'draft-a', items: [], updatedAt: new Date().toISOString() }] }))
  assert.equal(response.status, 200)
  assert.equal((await response.json()).data.draftsAccepted, true)
  const saved = fixture.tables.businesses[0].pos_config
  assert.equal(saved.products.length, 1)
  assert.equal(saved.products[0].id, 'live')
  assert.equal(saved.products[0].price, 23000)
  assert.equal(saved.products[0].stock, 10)
  assert.equal(saved.cashiers[0].name, 'Owner')
  assert.equal(saved.settings.storeName, 'Test')
  assert.equal(fixture.tables.transactions[0].edit_history[0].reason, 'Correction')
  assert.equal(fixture.tables.draft_orders.length, 1)
  assert.equal(fixture.tables.products[0].raw._inventory.events[0].id, 'stock-event')
  assert.ok(fixture.queries.filter(q => q.table === 'products' && q.op === 'upsert').every(q => q.values.every(row => !('raw' in row))))
})

test('a database missing edit_history cannot acknowledge and silently discard a correction', async () => {
  const fixture = database({ missingHistory: true })
  const response = await request(fixture)('app/api/sync/route.ts').POST(post({ transactions: [{ id: 'tx-a', editHistory: [{ reason: 'Correction' }] }] }))
  assert.equal(response.status, 500)
  assert.match((await response.json()).error, /migration/)
  assert.equal(fixture.tables.transactions.length, 0)
})

test('transaction filters and report queries honor global context even with another branch in the URL', async () => {
  for (const active of ['a', 'b', null]) {
    const fixture = database()
    for (const id of ['a', 'b']) {
      fixture.tables.transactions.push({ business_id: id, id: `TX_${id}`, created_at: '2026-11-12T08:00:00Z', status: 'completed', grand_total: id === 'a' ? 10000 : 20000, items: [], payment_type: 'tunai' })
      fixture.tables.expenses.push({ business_id: id, id: `EXP_${id}`, date: '2026-11-12', scope: 'daily', amount: 1000, note: `NOTE_${id}`, category: 'Test', businesses: { name: id }, created_at: '2026-11-12T08:00:00Z' })
      fixture.tables.manual_summaries.push({ business_id: id, period: 'day', date: '2026-11-12', sales: 0, expenses: 0, overpay: 0 })
    }
    const load = request(fixture, active)
    const sp = { b: active === 'a' ? 'b' : 'a', from: '2026-11-01', to: '2026-11-30', status: 'completed', pay: 'tunai', p: '2026-11-01_2026-11-30' }
    const tx = await load('app/dashboard/transactions/page.tsx').default({ searchParams: Promise.resolve(sp) })
    assert.equal(child(tx, 'TransactionList').props.transactions.length, active ? 1 : 0)
    if (active) assert.equal(child(tx, 'TransactionList').props.transactions[0].business_id, active)
    const expenses = await load('app/dashboard/expenses/page.tsx').default({ searchParams: Promise.resolve(sp) })
    assert.ok(!text(expenses).includes(active === 'a' ? 'NOTE_b' : 'NOTE_a'))
    await load('app/dashboard/recap/page.tsx').default({ searchParams: Promise.resolve(sp) })
    for (const query of fixture.queries.filter(q => ['transactions', 'expenses', 'manual_summaries', 'book_period_rules'].includes(q.table))) {
      assert.ok(query.filters.some(([key, value, op]) => key === 'business_id' && value === (active ?? '00000000-0000-0000-0000-000000000000') && op === 'eq'), `Unscoped query: ${query.table}`)
    }
    assert.ok(fixture.queries.some(q => q.table === 'transactions' && q.filters.some(([key, value]) => key === 'status' && value === 'completed')))
    assert.ok(fixture.queries.some(q => q.table === 'transactions' && q.filters.some(([key, value]) => key === 'payment_type' && value === 'tunai')))
  }
})

test('Overview keeps all-branch totals and recent transactions independently of global context', async () => {
  const fixture = database()
  fixture.tables.transactions.push({ business_id: 'a', id: 'a', grand_total: 10000 }, { business_id: 'b', id: 'b', grand_total: 20000 })
  const page = request(fixture, 'a')('app/dashboard/page.tsx').default
  const all = await page({ searchParams: Promise.resolve({}) })
  assert.equal(all.props.todayRevenue, 30000)
  assert.equal(all.props.recent.length, 2)
  assert.equal(all.props.transactionsHref, '/dashboard/transactions')
  const filtered = await page({ searchParams: Promise.resolve({ b: 'b' }) })
  assert.equal(filtered.props.todayRevenue, 20000)
  assert.equal(filtered.props.recent.length, 1)
  assert.equal(filtered.props.recent[0].business_id, 'b')
})
