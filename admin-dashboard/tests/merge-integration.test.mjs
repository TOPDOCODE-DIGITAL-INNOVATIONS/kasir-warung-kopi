import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const sourceRoot = path.resolve(import.meta.dirname, '../src')

function database({ missingHistory = false, missingSaleStock = false } = {}) {
  const tables = {
    businesses: [{ id: 'a', name: 'Cabang A', owner_id: 'owner', sync_token: 'test-token', pos_config: null, pos_config_updated_at: null }, { id: 'b', name: 'Cabang B', owner_id: 'owner' }],
    products: [
      { business_id: 'a', id: 'live', name: 'Nama admin', price: 23000, cost_price: 10000, stock: 10, is_active: true, can_sell: true, pos_sync_enabled: false, pos_managed: true, raw: { _inventory: { events: [{ id: 'stock-event' }] } } },
      { business_id: 'a', id: 'archived', is_active: false, can_sell: true },
      { business_id: 'a', id: 'ingredient', is_active: true, can_sell: false },
    ],
    transactions: [], expenses: [], shifts: [], draft_orders: [], manual_summaries: [], book_period_rules: [], deleted_records: [], units: [], suppliers: [], purchases: [], purchase_lines: [], stock_adjustment_lines: [],
  }
  const queries = []
  const db = {
    from(table) {
      const log = { table, filters: [], op: 'select', values: [] }; queries.push(log)
      let limit = Infinity, offset = 0
      const q = {
        select(columns) { log.columns = columns; return this }, order() { return this }, abortSignal() { return this },
        eq(k, v) { log.filters.push([k, v, 'eq']); return this },
        is(k, v) { return this.eq(k, v) },
        in(k, v) { log.filters.push([k, v, 'in']); return this },
        ilike(k, v) { log.filters.push([k, v, 'ilike']); return this },
        gte(k, v) { log.filters.push([k, v, 'gte']); return this },
        lt(k, v) { log.filters.push([k, v, 'lt']); return this },
        lte(k, v) { log.filters.push([k, v, 'lte']); return this },
        or(value) { log.or = value; return this },
        limit(n) { limit = n; return this }, range(a, z) { offset = a; limit = z-a+1; return this },
        update(values) { log.op = 'update'; log.values = [values]; return this },
        insert(values) { log.op = 'insert'; log.values = Array.isArray(values) ? values : [values]; return this },
        upsert(values) { log.op = 'upsert'; log.values = Array.isArray(values) ? values : [values]; return this },
        delete() { log.op = 'delete'; return this },
        maybeSingle: async () => ({ data: execute()[0] ?? null, error: null }),
        single: async () => ({ data: execute()[0] ?? null, error: null }),
        then(resolve) {
          if (missingSaleStock && table === 'transactions' && log.op === 'upsert' && log.values.some(row => 'pos_stock_applied' in row)) {
            return Promise.resolve({ data: null, error: { code: 'PGRST204', message: "Could not find the 'pos_stock_applied' column of 'transactions' in the schema cache" } }).then(resolve)
          }
          if (missingHistory && table === 'transactions' && log.op === 'upsert' && log.values.some(row => row.edit_history)) {
            return Promise.resolve({ data: null, error: { code: 'PGRST204', message: "Could not find the 'edit_history' column of 'transactions' in the schema cache" } }).then(resolve)
          }
          return Promise.resolve({ data: execute(), error: null }).then(resolve)
        },
      }
      function execute() {
        if (log.op === 'insert') {
          const created = log.values.map(row => table === 'products' ? { is_active: true, updated_at: '2026-11-17T00:00:00Z', ...row } : { ...row })
          tables[table].push(...created)
          return created
        }
        const matching = row => log.filters.every(([key, v, op]) => {
          const value = key.split('.').reduce((part, key) => part?.[key], row)
          if (op === 'ilike') return String(value ?? '').toLocaleLowerCase().includes(v.slice(1, -1).replace(/\\([\\%_])/g, '$1').toLocaleLowerCase())
          return op === 'eq' ? value === v : op === 'in' ? v.includes(value) : op === 'gte' ? value >= v : op === 'lte' ? value <= v : value < v
        })
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
    vm.runInNewContext(code, { module: target, exports: target.exports, Error, FormData, Request, Response, Headers, URL, URLSearchParams, console: { error() {}, warn() {} }, require: name => {
      if (name === '@/lib/business-context') return { getBusinessContext: getContext, requireBusinessContext: async expected => { if (!businessId || (expected !== undefined && expected !== businessId)) throw new Error('Cabang aktif sudah berubah.'); return getContext() }, EMPTY_BUSINESS_ID: '00000000-0000-0000-0000-000000000000' }
      if (name === 'next/cache') return { revalidatePath() {} }
      if (name === 'next/navigation') return { unstable_rethrow() {} }
      if (name === '@/lib/billing/owner-billing') {
        const READ_ONLY_MESSAGE = 'Langganan berakhir (hanya-baca).'
        const access = () => ({ readOnly: !!fixture.readOnly })
        return {
          READ_ONLY_MESSAGE,
          readOwnerBilling: async () => fixture.billing ?? null,
          getCurrentOwnerAccess: async () => ({ billing: null, access: access() }),
          assertWritable: async () => { if (access().readOnly) throw new Error(READ_ONLY_MESSAGE) },
        }
      }
      if (name === '@/utils/supabase/admin') return { createAdminClient: () => fixture.db }
      if (name === '@/utils/supabase/server') return { createClient: async () => fixture.db }
      if (name === 'next/link') return { __esModule: true, default: 'a' }
      if (name.startsWith('@/') || name.startsWith('.')) {
        const base = name.startsWith('@/') ? path.join(sourceRoot, name.slice(2)) : path.resolve(path.dirname(file), name)
        const dependency = ['.ts', '.tsx'].map(ext => base + ext).find(fs.existsSync)
        if (/^['"]use client['"]/.test(fs.readFileSync(dependency, 'utf8'))) return { __esModule: true, default: path.basename(dependency, '.tsx'), FilterSubmit: 'FilterSubmit' }
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

const expense = () => ({ business_id: 'a', id: 'expense-a', scope: 'daily', date: '2026-11-12', category: 'Transport', amount: 10000, note: '', from_drawer: false, synced_at: '2026-11-12T00:00:00.000Z' })
function expenseForm(row, overrides = {}) {
  const form = new FormData()
  for (const [key, value] of Object.entries({ ...row, business_id: 'a', version: row.synced_at, ...overrides })) form.set(key, String(value ?? ''))
  return form
}

test('admin expense correction updates one owned record, keeps creator/links, and rejects stale or foreign forms', async () => {
  const fixture = database(), original = { ...expense(), created_by: 'Kasir', created_at: '2026-11-10T00:00:00Z' }
  fixture.tables.expenses.push(original)
  const action = request(fixture)('app/dashboard/expenses/actions.ts').updateExpense
  const result = await action(expenseForm(original, { amount: 25000, note: 'Koreksi' }))
  assert.equal(result.success, true, result.message)
  assert.equal(fixture.tables.expenses.length, 1)
  assert.equal(original.amount, 25000)
  assert.equal(original.created_by, 'Kasir')
  assert.equal((await action(expenseForm(expense(), { amount: 30000 }))).success, false)
  assert.equal((await action(expenseForm(original, { business_id: 'b' }))).success, false)
  const write = fixture.queries.find(q => q.table === 'expenses' && q.op === 'update')
  assert.ok(write.filters.some(([k,v]) => k === 'business_id' && v === 'a'))
  assert.ok(write.filters.some(([k,v]) => k === 'synced_at' && v === expense().synced_at))
})

test('linked purchases and drawer entries keep financial fields; invalid dates, empty categories and amounts are refused', async () => {
  for (const lock of [{ purchase_line_id: 'purchase-line' }, { from_drawer: true }]) {
    const fixture = database(), row = { ...expense(), ...lock }; fixture.tables.expenses.push(row)
    const action = request(fixture)('app/dashboard/expenses/actions.ts').updateExpense
    assert.equal((await action(expenseForm(row, { amount: 20000 }))).success, false)
    assert.equal((await action(expenseForm(row, { note: 'Catatan diperbaiki' }))).success, true)
    assert.equal(row.amount, 10000)
  }
  for (const invalid of [{ amount: -1 }, { amount: 'NaN' }, { amount: '1.234' }, { category: ' ' }, { scope: 'yearly' }, { date: '2026-02-30' }]) {
    const fixture = database(), row = expense(); fixture.tables.expenses.push(row)
    assert.equal((await request(fixture)('app/dashboard/expenses/actions.ts').updateExpense(expenseForm(row, invalid))).success, false)
    assert.ok(!fixture.queries.some(q => q.op === 'update'))
  }
})

test('read-only subscription refuses admin expense edits but the POS can still sync and receives its access state', async () => {
  const fixture = database(), row = expense(); fixture.tables.expenses.push(row)
  fixture.readOnly = true
  fixture.billing = { status: 'ok', trial_ends_at: '2020-01-01T00:00:00Z', subscription: null }
  const result = await request(fixture)('app/dashboard/expenses/actions.ts').updateExpense(expenseForm(row, { amount: 1 }))
  assert.equal(result.success, false)
  assert.match(result.message, /hanya-baca/)
  assert.equal(row.amount, expense().amount)
  assert.ok(!fixture.queries.some(q => q.table === 'expenses' && q.op === 'update'))
  const response = await request(fixture)('app/api/sync/route.ts').POST(post({ expenses: [] }))
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.success, true)
  assert.equal(body.access.state, 'expired')
})


test('expense sync accepts explicit corrections and retries, preserves purchase metadata, and rejects stale edits', async () => {
  const fixture = database(), row = { ...expense(), product_name: 'Transport', product_id: 'product-a' }; fixture.tables.expenses.push(row)
  const base = { scope: row.scope, date: row.date, category: row.category, amount: row.amount, note: row.note }
  const payload = { ...base, id: row.id, amount: 20000, editBase: base, createdBy: 'Changed actor' }
  const sync = request(fixture)('app/api/sync/route.ts').POST
  assert.equal((await sync(post({ expenses: [payload] }))).status, 200)
  assert.equal(row.amount, 20000)
  assert.equal(row.product_id, 'product-a')
  assert.equal((await sync(post({ expenses: [payload] }))).status, 200)
  assert.equal((await sync(post({ expenses: [{ ...base, id: row.id }] }))).status, 200)
  assert.equal(row.amount, 20000, 'Old POS retransmission cannot undo a correction')
  const conflict = await sync(post({ expenses: [{ ...payload, amount: 30000 }] }))
  assert.equal(conflict.status, 409)
  assert.equal((await conflict.json()).expenseConflicts[0].amount, 20000)
  assert.equal(row.amount, 20000)
})

test('admin expense deletion records a branch-scoped tombstone, is repeatable and prevents stale POS resurrection', async () => {
  const fixture = database(), row = expense(); fixture.tables.expenses.push(row)
  const action = request(fixture)('app/dashboard/expenses/actions.ts').deleteExpense
  assert.equal((await action(expenseForm(row, { business_id: 'b' }))).success, false)
  assert.equal((await action(expenseForm(row, { version: 'old' }))).success, false)
  assert.equal(fixture.tables.expenses.length, 1)
  const result = await action(expenseForm(row))
  assert.equal(result.success, true, result.message)
  assert.equal(fixture.tables.expenses.length, 0)
  assert.equal(fixture.tables.deleted_records.length, 1)
  assert.equal(fixture.tables.deleted_records[0].business_id, 'a')
  assert.equal(fixture.tables.deleted_records[0].kind, 'expense')
  assert.equal((await action(expenseForm(row))).success, true)
  const response = await request(fixture)('app/api/sync/route.ts').POST(post({ expenses: [{ ...row, editBase: row, amount: 99999 }] }))
  assert.equal(response.status, 200)
  assert.deepEqual((await response.json()).data.deletedExpenseIds, [row.id])
  assert.equal(fixture.tables.expenses.length, 0)
})

test('linked purchases cannot be deleted by admin or POS; a concurrent change cancels deletion and removes its marker', async () => {
  const fixture = database(), row = { ...expense(), purchase_line_id: 'purchase-line' }; fixture.tables.expenses.push(row)
  assert.equal((await request(fixture)('app/dashboard/expenses/actions.ts').deleteExpense(expenseForm(row))).success, false)
  assert.equal((await request(fixture)('app/api/sync/route.ts').POST(post({ deletedExpenseIds: [row.id] }))).status, 400)
  assert.equal(fixture.tables.expenses.length, 1)
  assert.equal(fixture.tables.deleted_records.length, 0)
  delete row.purchase_line_id
  const from = fixture.db.from.bind(fixture.db)
  fixture.db.from = table => {
    const q = from(table), originalDelete = q.delete, originalThen = q.then; let deleting = false
    q.delete = function () { deleting = true; return originalDelete.call(this) }
    q.then = function (resolve) { if (table === 'expenses' && deleting) row.synced_at = '2026-11-16T00:00:00Z'; return originalThen.call(this, resolve) }
    return q
  }
  assert.equal((await request(fixture)('app/dashboard/expenses/actions.ts').deleteExpense(expenseForm(row))).success, false)
  assert.equal(fixture.tables.expenses.length, 1)
  assert.equal(fixture.tables.deleted_records.length, 0)
})

test('expense PDF receives the active branch, period/category filters and over 1000 rows without a separate export query', async () => {
  const fixture = database()
  for (let i = 0; i < 1001; i++) fixture.tables.expenses.push({ ...expense(), id: `EXPORT_${i}`, category: 'Gas', businesses: { name: 'Cabang A' }, quantity: 2, unit_label: 'pcs', product_name: 'Gas', supplier_name: 'Supplier' })
  fixture.tables.expenses.push({ ...expense(), id: 'OTHER_CATEGORY', category: 'Transport' }, { ...expense(), business_id: 'b', id: 'OTHER_BRANCH', category: 'Gas' }, { ...expense(), id: 'OTHER_MONTH', date: '2026-10-31', category: 'Gas' })
  const page = await request(fixture)('app/dashboard/expenses/page.tsx').default({ searchParams: Promise.resolve({ p: '2026-11-01_2026-11-30', cat: 'Gas' }) })
  const exportButton = child(page, 'ExpenseExport')
  assert.equal(exportButton.props.unavailable, false)
  assert.equal(exportButton.props.report.branchName, 'Cabang A')
  assert.equal(exportButton.props.report.category, 'Gas')
  assert.equal(exportButton.props.report.rows.length, 1001)
  assert.equal(exportButton.props.report.rows[0].unitLabel, 'pcs')
  assert.equal(exportButton.props.report.rows[0].supplierName, 'Supplier')
  assert.ok(exportButton.props.report.rows.every(e => e.id.startsWith('EXPORT_')))
  assert.equal(fixture.queries.filter(q => q.table === 'expenses' && q.op === 'select').length, 2, 'Only the two paginated page queries are needed')
})

test('a database without the sales-stock migration keeps saved corrections when an older receipt is resent', async () => {
  const fixture = database({ missingSaleStock: true })
  const editHistory = [{ at: '2026-11-18T02:00:00.000Z', reason: 'Koreksi' }]
  fixture.tables.transactions.push({ business_id: 'a', id: 'tx-old', edit_history: editHistory })
  const sync = request(fixture)('app/api/sync/route.ts').POST
  const response = await sync(post({ transactions: [{ id: 'tx-old' }, { id: 'tx-new', editHistory }] }))
  assert.equal(response.status, 200)
  assert.equal(fixture.tables.transactions[0].edit_history, editHistory)
  assert.deepEqual(fixture.tables.transactions[1].edit_history, editHistory)
})

test('merged sync accepts config, drafts and edit history while preserving inventory data', async () => {
  const fixture = database(), load = request(fixture)
  const response = await load('app/api/sync/route.ts').POST(post({ config, configSeed: true, configEditedAt: new Date().toISOString(), transactions: [{ id: 'tx-a', grandTotal: 23000, editHistory: [{ reason: 'Correction' }] }], drafts: [{ id: 'draft-a', items: [], updatedAt: new Date().toISOString() }] }))
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

test('an empty branch never adopts a device config without explicit owner seeding; filled branches accept edits', async () => {
  const fixture = database(), load = request(fixture)
  const sync = load('app/api/sync/route.ts').POST
  const first = await (await sync(post({ config, configEditedAt: new Date().toISOString() }))).json()
  assert.equal(first.success, true)
  assert.equal(first.data.configAccepted, false)
  assert.equal(fixture.tables.businesses[0].pos_config, null, 'other-branch/demo menu must not land in an empty branch')
  assert.ok(!fixture.queries.some(q => q.table === 'businesses' && q.op === 'update' && q.values?.pos_config))
  const seeded = await (await sync(post({ config, configSeed: true, configEditedAt: new Date(Date.now() - 5000).toISOString() }))).json()
  assert.equal(seeded.data.configAccepted, true)
  assert.ok(fixture.tables.businesses[0].pos_config)
  const edit = { ...config, cashiers: [...config.cashiers, { id: 'c-new', name: 'Baru', role: 'Kasir' }] }
  const edited = await (await sync(post({ config: edit, configEditedAt: new Date(Date.now() - 1000).toISOString() }))).json()
  assert.equal(edited.data.configAccepted, true, 'normal edits on a branch that already has data still sync')
  assert.equal(edited.branch.name, 'Cabang A')
})

test('stale POS configs cannot replace or restore a photo managed in admin', async () => {
  for (const imageUrl of ['https://images.test/admin.webp', null]) {
    const fixture = database()
    fixture.tables.products[0].image_url = imageUrl
    fixture.tables.products[0].pos_sync_enabled = true
    const stale = { ...config, products: [{ ...config.products[0], imageUrl: 'https://images.test/stale.webp' }] }
    const response = await request(fixture)('app/api/sync/route.ts').POST(post({ config: stale, configSeed: true, configEditedAt: new Date().toISOString() }))
    assert.equal(response.status, 200)
    assert.equal(fixture.tables.businesses[0].pos_config.products[0].imageUrl, imageUrl || undefined)
    assert.equal(fixture.tables.products[0].image_url, imageUrl)
  }
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
  fixture.tables.transactions.push(...['a', 'b'].map(id => ({ business_id: id, id, created_at: '2026-11-12T08:00:00+07:00', status: 'completed', grand_total: id === 'a' ? 10000 : 20000, items: [] })))
  const page = request(fixture, 'a')('app/dashboard/page.tsx').default
  const range = { from: '2026-11-12', to: '2026-11-12' }
  const all = child(await page({ searchParams: Promise.resolve(range) }), 'DashboardClient').props
  assert.equal(all.summary.sales, 30000)
  assert.equal(all.summary.recent.length, 2)
  const filtered = child(await page({ searchParams: Promise.resolve({ ...range, b: 'b' }) }), 'DashboardClient').props
  assert.equal(filtered.summary.sales, 20000)
  assert.equal(filtered.summary.recent.length, 1)
  assert.equal(filtered.summary.recent[0].business_id, 'b')
})

function productEditFixture(stock = -1) {
  const fixture = database()
  const businessId = 'ea200000-0000-0000-0000-000000000001'
  const inventoryId = 'ea300000-0000-0000-0000-000000000001'
  fixture.tables.businesses = [{ ...fixture.tables.businesses[0], id: businessId, pos_config: structuredClone(config) }]
  fixture.tables.products = [{ ...fixture.tables.products[0], business_id: businessId, owner_id: 'owner', inventory_id: inventoryId,
    stock, updated_at: '2026-11-17T00:00:00Z', image_url: 'https://images.test/original.webp', raw: { options: [{ name: 'Suhu' }] } }]
  const actions = request(fixture, businessId)('app/dashboard/products/actions.ts')
  const form = (overrides = {}) => {
    const data = new FormData()
    for (const [key, value] of Object.entries({ inventory_id: inventoryId, business_id: businessId, operation_id: 'ea400000-0000-0000-0000-000000000001',
      version: '2026-11-17T00:00:00Z', name: 'Latte', can_sell: 'on', track_stock: 'on', price: '23000', cost_price: '10000', cost_verified: 'on', initial_quantity: '25.125', reason: 'Hasil hitung awal', ...overrides })) data.set(key, value)
    return data
  }
  return { ...fixture, actions, form }
}

test('merged product edit initializes tracked stock and preserves photo, options and retry fingerprint', async () => {
  const f = productEditFixture()
  const data = f.form()
  const first = await f.actions.saveProduct(data)
  assert.equal(first.success, true, first.message)
  const p = f.tables.products[0], event = p.raw._inventory.events[0]
  assert.equal(p.stock, 25.125)
  assert.equal(p.stock_mode, 'self')
  assert.equal(p.image_url, 'https://images.test/original.webp')
  assert.equal(p.raw.options[0].name, 'Suhu')
  assert.equal(event.kind, 'tracking')
  assert.equal(event.quantity, 25.125)
  assert.equal(event.before, -1)
  assert.equal(event.after, 25.125)
  assert.equal(event.reason, 'Hasil hitung awal')
  assert.match(event.fingerprint, /^[\da-f]{64}$/)
  // Retrying after the product version changes must not reapply initial stock.
  p.updated_at = '2026-11-17T01:00:00Z'
  assert.equal((await f.actions.saveProduct(data)).success, true)
  assert.equal(p.stock, 25.125)
  assert.equal(p.raw._inventory.events.length, 1)
  const conflicting = await f.actions.saveProduct(f.form({ image_intent: 'remove' }))
  assert.equal(conflicting.success, false)
  assert.match(conflicting.message, /data berbeda/)
  assert.equal(p.image_url, 'https://images.test/original.webp')
})

test('initial stock is ignored for already tracked products and tracking can still be disabled', async () => {
  const f = productEditFixture(7)
  assert.equal((await f.actions.saveProduct(f.form({ initial_quantity: '999' }))).success, true)
  assert.equal(f.tables.products[0].stock, 7)
  assert.equal(f.tables.products[0].raw._inventory.events[0].quantity, 0)
  const off = f.form({ operation_id: 'ea400000-0000-0000-0000-000000000002' })
  off.delete('track_stock')
  assert.equal((await f.actions.saveProduct(off)).success, true)
  assert.equal(f.tables.products[0].stock, -1)
  assert.equal(f.tables.products[0].stock_mode, 'none')
})

test('sold products require HPP, and an unchecked HPP must be confirmed before it counts', async () => {
  const missing = productEditFixture(7), noCost = missing.form(); noCost.delete('cost_price')
  const rejected = await missing.actions.saveProduct(noCost)
  assert.equal(rejected.success, false)
  assert.match(rejected.message, /HPP wajib/)
  const unconfirmed = productEditFixture(7), form = unconfirmed.form(); form.delete('cost_verified')
  const blocked = await unconfirmed.actions.saveProduct(form)
  assert.equal(blocked.success, false)
  assert.match(blocked.message, /HPP sudah dicek/)
  assert.equal(unconfirmed.tables.products[0].cost_verified_at, undefined)
  const confirmed = productEditFixture(7)
  assert.equal((await confirmed.actions.saveProduct(confirmed.form())).success, true)
  assert.match(confirmed.tables.products[0].cost_verified_at, /^\d{4}-/)
  // Entering a new HPP is itself a check by the Owner; no checkbox needed.
  const changed = productEditFixture(7), edit = changed.form({ cost_price: '9000' }); edit.delete('cost_verified')
  assert.equal((await changed.actions.saveProduct(edit)).success, true)
  assert.match(changed.tables.products[0].cost_verified_at, /^\d{4}-/)
})

test('invalid initial stock and stale product versions never write stock or history', async () => {
  for (const overrides of [{ initial_quantity: '-1' }, { initial_quantity: 'NaN' }, { initial_quantity: '1000000000' }, { version: 'stale' }]) {
    const f = productEditFixture()
    const original = JSON.stringify(f.tables.products)
    assert.equal((await f.actions.saveProduct(f.form(overrides))).success, false)
    assert.equal(JSON.stringify(f.tables.products), original)
    assert.ok(f.queries.every(query => query.op !== 'update'))
  }
})

function initialPurchaseFixture({ tracked = true, both = false } = {}) {
  const f = database()
  const business = 'eb200000-0000-0000-0000-000000000001', unit = '00000000-0000-0000-0000-000000000001'
  const operation = 'eb400000-0000-0000-0000-000000000001'
  f.tables.businesses = [{ ...f.tables.businesses[0], id: business, pos_config: structuredClone(config) }]
  f.tables.products = []
  f.tables.units = [{ id: unit }]
  let failBefore = false, loseResponse = false
  const originalRpc = f.db.rpc
  f.db.rpc = async (name, args) => {
    if (name !== 'admin_record_expenses') return originalRpc(name, args)
    f.queries.push({ table: 'rpc:admin_record_expenses', args: JSON.parse(JSON.stringify(args)) })
    if (failBefore) { failBefore = false; return { error: { message: 'Temporary failure' } } }
    const payload = JSON.parse(JSON.stringify({ date: args.p_date, scope: args.p_scope, supplier: args.p_supplier, lines: args.p_lines }))
    const previous = f.tables.expenses.find(e => e.entry_group_id === args.p_operation)
    if (previous) {
      assert.deepEqual(payload, previous.entry_request, 'retries must send the original committed expense request')
      return { data: { replayed: true }, error: null }
    }
    const line = args.p_lines[0], p = f.tables.products.find(p => p.inventory_id === line.product_id)
    assert.equal(line.version, p.updated_at)
    if (p.stock >= 0) p.stock += Number(line.quantity)
    p.updated_at = '2026-11-17T01:00:00Z'
    f.tables.expenses.push({ id: line.id, business_id: business, entry_group_id: args.p_operation, entry_position: 0, entry_request: payload, amount: line.amount })
    f.tables.purchases.push({ id: args.p_operation, status: 'posted' })
    f.tables.purchase_lines.push({ id: line.id, product_id: p.inventory_id, quantity: line.quantity })
    if (loseResponse) { loseResponse = false; throw new Error('Response lost after commit') }
    return { data: { replayed: false }, error: null }
  }
  const load = request(f, business), actions = load('app/dashboard/products/actions.ts')
  const form = (overrides = {}) => {
    const data = new FormData()
    for (const [key, value] of Object.entries({ inventory_id: '', business_id: business, base_unit_id: unit, operation_id: operation,
      name: 'Milk', can_buy: 'on', ...(both ? { can_sell: 'on' } : {}), ...(tracked ? { track_stock: 'on' } : {}),
      price: both ? '15000' : '0', initial_quantity: '0', initial_purchase: 'on', purchase_date: '2026-11-17', purchase_quantity: '3', purchase_total: '25000', ...overrides })) data.set(key, value)
    return data
  }
  return { ...f, actions, load, form, operation, failNextRpc: () => { failBefore = true }, loseNextResponse: () => { loseResponse = true } }
}

test('new buy/sell product records first purchase once, with distinct sale price and derived buy cost', async () => {
  const f = initialPurchaseFixture({ both: true })
  const result = await f.actions.saveProduct(f.form())
  assert.equal(result.success, true, result.message)
  const p = f.tables.products[0]
  assert.equal(p.price, '15000.000000')
  assert.equal(p.cost_price, '8333.333333')
  assert.equal(p.stock, 3)
  assert.equal(p.raw._inventory.initialPurchase.status, 'complete')
  assert.equal(f.tables.expenses.length, 1)
  assert.equal(f.tables.expenses[0].amount, '25000.000000')
  assert.equal(f.tables.purchases.length, 1)
  assert.equal((await f.actions.saveProduct(f.form())).success, true)
  assert.equal(f.tables.products.length, 1)
  assert.equal(f.tables.expenses.length, 1)
  assert.equal(f.tables.products[0].stock, 3)
  assert.equal((await f.actions.saveProduct(f.form({ purchase_total: '30000' }))).success, false)
})

test('first purchase can be omitted entirely; untracked purchases retain Unlimited balance', async () => {
  const planned = initialPurchaseFixture()
  const data = planned.form(); data.delete('initial_purchase'); data.delete('purchase_quantity'); data.delete('purchase_total')
  assert.equal((await planned.actions.saveProduct(data)).success, true)
  assert.equal(planned.tables.products[0].cost_price, null)
  assert.equal(planned.tables.expenses.length, 0)
  const untracked = initialPurchaseFixture({ tracked: false })
  assert.equal((await untracked.actions.saveProduct(untracked.form())).success, true)
  assert.equal(untracked.tables.products[0].stock, -1)
  assert.equal(untracked.tables.purchase_lines.length, 1)
})

test('first purchase rejects invalid dates, incomplete/negative amounts, foreign supplier, and double initial stock before creating anything', async () => {
  for (const overrides of [{ purchase_date: '2026-02-30' }, { purchase_quantity: '' }, { purchase_quantity: '-1' }, { purchase_total: '0' }, { purchase_total: '1.001' },
    { purchase_supplier: 'eb900000-0000-0000-0000-000000000001' }, { initial_quantity: '3' }]) {
    const f = initialPurchaseFixture()
    assert.equal((await f.actions.saveProduct(f.form(overrides))).success, false)
    assert.equal(f.tables.products.length, 0)
    assert.equal(f.tables.expenses.length, 0)
  }
})

test('first purchase recovers from failure before RPC and lost response after commit, without duplicate stock or expense', async () => {
  for (const failure of ['failNextRpc', 'loseNextResponse']) {
    const f = initialPurchaseFixture()
    f[failure]()
    const result = await f.actions.saveProduct(f.form())
    assert.equal(result.success, false)
    assert.equal(f.tables.products.length, 1)
    assert.equal(f.tables.products[0].raw._inventory.initialPurchase.status, 'pending')
    const recovery = new FormData()
    recovery.set('inventory_id', f.operation); recovery.set('operation_id', f.operation)
    const complete = await f.actions.completeProductPurchase(recovery)
    assert.equal(complete.success, true, complete.message)
    assert.equal(f.tables.products[0].stock, 3)
    assert.equal(f.tables.expenses.length, 1)
    assert.equal(f.tables.purchase_lines.length, 1)
    assert.equal(f.tables.products[0].raw._inventory.initialPurchase.status, 'complete')
  }
})

function historyFixture() {
  const f = database(), id = 'fa100000-0000-4000-8000-000000000001'
  f.tables.products = [{ inventory_id: id, owner_id: 'owner', business_id: 'a', raw: { _inventory: { events: [
    { id: 'inside', kind: 'edit', at: '2026-11-16T17:00:00Z' },
    { id: 'outside', kind: 'edit', at: '2026-11-16T16:59:59Z' },
    { id: 'next-day', kind: 'edit', at: '2026-11-17T17:00:00Z' },
  ] } } }]
  const line = { owner_id: 'owner', business_id: 'a', product_id: id, quantity_base: 2000, line_total: 18000,
    purchases: { purchased_at: '2026-11-17T00:00:00+07:00', status: 'posted', document_number: 'PO-1', supplier_id: 's', supplier_name: 'Historical supplier', suppliers: { name: 'Renamed supplier', address: 'Supplier location' } } }
  f.tables.purchase_lines = [{ ...line, id: 'line-1' }]
  const actions = request(f)('app/dashboard/products/actions.ts')
  return { ...f, id, line, actions, range: { start: '2026-11-17', end: '2026-11-17' } }
}

test('purchase history includes nominal-only expenses once, joined address and snapshot supplier; derives price from base quantity', async () => {
  const f = historyFixture()
  f.tables.expenses = [
    { id: 'linked', business_id: 'a', product_id: f.id, amount: 18000, purchase_line_id: 'line-1' },
    { id: 'nominal', business_id: 'a', product_id: f.id, amount: 22000, date: '2026-11-17', scope: 'daily', purchase_line_id: null, supplier_id: null },
  ]
  const data = await f.actions.getProductHistory(f.id, { ...f.range, tab: 'purchases' })
  assert.equal(data.error, undefined)
  assert.equal(data.purchases.length, 2)
  assert.equal(data.purchases.reduce((s,p) => s+p.amount, 0), 40000)
  assert.equal(data.purchases[0].unitPrice, 9)
  assert.equal(data.purchases[0].supplier, 'Historical supplier')
  assert.equal(data.purchases[0].address, 'Supplier location')
  assert.equal(data.purchases[1].supplier, 'Tanpa supplier')
  assert.equal(data.purchases[1].unitPrice, null)
  assert.deepEqual(f.queries.map(q => q.table), ['products', 'purchase_lines', 'expenses'])
  assert.match(f.queries.find(q => q.table === 'expenses').or, /scope.eq.daily/)
})

test('history fetches only the requested tab and enforces owner, active branch, server date validation and WIB event bounds', async () => {
  for (const tab of ['events', 'adjustments']) {
    const f = historyFixture(), data = await f.actions.getProductHistory(f.id, { ...f.range, tab })
    assert.equal(data.error, undefined)
    assert.deepEqual(f.queries.map(q => q.table), tab === 'events' ? ['products'] : ['products', 'stock_adjustment_lines'])
    if (tab === 'events') assert.equal(data.events.map(e => e.id).join(), 'inside')
  }
  for (const foreign of [{ owner_id: 'another-owner' }, { business_id: 'b' }]) {
    const f = historyFixture(); Object.assign(f.tables.products[0], foreign)
    const data = await f.actions.getProductHistory(f.id, { ...f.range, tab: 'purchases' })
    assert.match(data.error, /tidak dapat diakses/)
    assert.equal(f.queries.length, 1)
  }
  const f = historyFixture()
  const invalid = await f.actions.getProductHistory(f.id, { start: '2026-01-01', end: '2026-11-17', tab: 'purchases' })
  assert.match(invalid.error, /maksimal 3 bulan/)
  assert.equal(f.queries.length, 0)
})

test('history paginates past 500 rows, accepts 1000 and refuses truncated supplier rankings beyond that cap', async () => {
  for (const size of [501, 1000, 1001]) {
    const f = historyFixture()
    f.tables.purchase_lines = Array.from({ length: size }, (_, i) => ({ ...f.line, id: `line-${i}` }))
    const result = await f.actions.getProductHistory(f.id, { ...f.range, tab: 'purchases' })
    if (size > 1000) { assert.match(result.error, /Persempit rentang/); assert.equal(result.purchases.length, 0) }
    else { assert.equal(result.error, undefined); assert.equal(result.purchases.length, size) }
    assert.ok(f.queries.length <= 5, 'query count is bounded by pages, not rows/suppliers')
  }
})

test('expense product search is bounded, owner/branch scoped and buy-only; units are fetched once for returned products', async () => {
  const f = database()
  const product = { owner_id: 'owner', business_id: 'a', name: 'Susu', stock: 12, updated_at: '2026-11-17T01:00:00Z', is_active: true, can_buy: true, base_unit: { code: 'ml' } }
  f.tables.products = [
    { ...product, inventory_id: 'foreign-owner', owner_id: 'someone-else' },
    { ...product, inventory_id: 'foreign-branch', business_id: 'b' },
    { ...product, inventory_id: 'inactive', is_active: false },
    { ...product, inventory_id: 'sell-only', can_buy: false },
    ...Array.from({ length: 25 }, (_, i) => ({ ...product, inventory_id: `p-${i}`, name: `Susu ${i}` })),
  ]
  f.tables.item_units = [{ id: 'carton', product_id: 'p-0', owner_id: 'owner', is_active: true, label: 'Karton', factor_to_base: 12000 }, { id: 'inactive-unit', product_id: 'p-0', owner_id: 'owner', is_active: false }, { id: 'not-in-results', product_id: 'p-24', owner_id: 'owner', is_active: true }]
  const actions = request(f)('app/dashboard/expenses/actions.ts')
  const result = await actions.searchExpenseProducts('a', 'sUSu')
  assert.equal(result.error, undefined)
  assert.equal(result.products.length, 20)
  assert.equal(result.hasMore, true)
  assert.equal(result.products[0].version, product.updated_at)
  assert.equal(result.products[0].stock, 12)
  assert.equal(result.products[0].unitCode, 'ml')
  assert.equal(result.products[0].units.length, 1)
  assert.equal(result.products[0].units[0].factor, 12000)
  assert.deepEqual(f.queries.map(q => q.table), ['products', 'item_units'])
  const batch = f.queries[1].filters.find(([key, , op]) => key === 'product_id' && op === 'in')[1]
  assert.equal(batch.length, 20)
  const invalid = await actions.searchExpenseProducts('b', 'Susu')
  assert.match(invalid.error, /Cabang aktif/)
  assert.equal(f.queries.length, 2)
})

test('expense search escapes literal wildcard characters, handles empty results and does not preload the product catalog', async () => {
  const f = database()
  f.tables.products = [{ inventory_id: 'p', owner_id: 'owner', business_id: 'a', name: 'Bahan 100%_khusus', stock: -1, is_active: true, can_buy: true, updated_at: 'version' }]
  f.tables.item_units = []
  const actions = request(f)('app/dashboard/expenses/actions.ts')
  const found = await actions.searchExpenseProducts('a', '100%_')
  assert.equal(found.products.length, 1)
  assert.equal(f.queries[0].filters.find(([, , op]) => op === 'ilike')[1], '%100\\%\\_%')
  f.queries.length = 0
  const none = await actions.searchExpenseProducts('a', 'unknown')
  assert.equal(none.products.length, 0)
  assert.equal(none.hasMore, false)
  assert.equal(f.queries.length, 1)
  f.queries.length = 0
  await actions.getExpenseOptions('a')
  assert.deepEqual(f.queries.map(q => q.table), ['suppliers'])
  const invalid = await actions.searchExpenseProducts('a', 'x'.repeat(201))
  assert.match(invalid.error, /200 karakter/)
})
