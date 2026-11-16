import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import ts from 'typescript'

function load(name, dependencies = {}) {
  const target = { exports: {} }
  const source = fs.readFileSync(fileURLToPath(new URL(`../src/app/dashboard/${name}.ts`, import.meta.url)), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  vm.runInNewContext(compiled, { module: target, exports: target.exports, require: name => {
    if (name in dependencies) return dependencies[name]
    throw new Error(`Unexpected dependency ${name}`)
  } })
  return target.exports
}
const d = load('overview-domain')
const json = value => JSON.parse(JSON.stringify(value))
const range = { start: '2026-11-01', end: '2026-11-07' }
const tx = (overrides = {}) => ({ id: 'tx', business_id: 'a', created_at: '2026-11-02T08:00:00+07:00', status: 'completed', grand_total: 20000, overpay_amount: 0, payment_type: 'tunai', items: [], ...overrides })

test('default covers exactly seven inclusive days, even across months and years', () => {
  assert.deepEqual(json(d.resolveOverviewRange(undefined, undefined, '2026-01-03')), { start: '2025-12-28', end: '2026-01-03', error: null })
  assert.equal(d.summarizeOverview(range, [], [], []).daily.length, 7)
})

test('calendar range accepts a single day, 1–3 months and leap years, rejects longer ranges', () => {
  assert.equal(d.overviewRangeError('2026-11-12', '2026-11-12'), null)
  assert.equal(d.maxOverviewEnd('2026-11-12'), '2027-02-11')
  assert.equal(d.overviewRangeError('2026-11-12', '2027-02-11'), null)
  assert.match(d.overviewRangeError('2026-11-12', '2027-02-12'), /maksimal 3 bulan/)
  assert.equal(d.maxOverviewEnd('2023-11-30'), '2024-02-28')
  assert.equal(d.overviewRangeError('2024-02-29', '2024-03-01'), null)
})

test('invalid, inverted and incomplete URL ranges fall back safely with an explanation', () => {
  for (const [from, to] of [['2026-02-30', '2026-03-01'], ['2026-11-05', '2026-11-01'], ['2026-11-01', undefined], ['2026-01-01', '2026-11-01'], ['9999-12-01', '9999-12-31']]) {
    const result = d.resolveOverviewRange(from, to, '2026-11-12')
    assert.equal(result.start, '2026-11-06')
    assert.equal(result.end, '2026-11-12')
    assert.ok(result.error)
  }
})

test('totals and chart share inclusive WIB boundaries and exclude cancelled transactions', () => {
  const result = d.summarizeOverview(range, [
    tx({ created_at: '2026-10-31T17:00:00Z', grand_total: 10000 }),
    tx({ created_at: '2026-11-07T16:59:59.999Z', grand_total: 20000 }),
    tx({ created_at: '2026-10-31T16:59:59.999Z', grand_total: 999999 }),
    tx({ created_at: '2026-11-07T17:00:00Z', grand_total: 999999 }),
    tx({ status: 'cancelled', grand_total: 999999 }),
  ], [], [])
  assert.equal(result.sales, 30000)
  assert.equal(result.count, 2)
  assert.equal(result.daily[0].sales, 10000)
  assert.equal(result.daily[6].sales, 20000)
  assert.equal(result.daily.reduce((sum, day) => sum + day.sales, 0), result.sales)
})

test('manual summaries and monthly expenses are anchored on day 1 without inventing product sales', () => {
  const expenses = [{ date: '2026-11', amount: 3000 }, { date: '2026-11-03', amount: 1000 }, { date: '2026-10', amount: 999999 }]
  const manual = [{ date: '2026-11', sales: 10000, overpay: 500, expenses: 2000 }, { date: '2026-11-07', sales: 5000, expenses: 1000 }]
  const result = d.summarizeOverview(range, [], expenses, manual)
  assert.equal(result.sales, 15000)
  assert.equal(result.income, 15500)
  assert.equal(result.expenses, 7000)
  assert.equal(result.count, 0)
  assert.equal(result.topProducts.length, 0)
  const partial = d.summarizeOverview({ start: '2026-11-02', end: '2026-11-07' }, [], expenses, manual)
  assert.equal(partial.sales, 5000)
  assert.equal(partial.expenses, 2000)
})

test('unpaid debts use the selected sale date and current debt status', () => {
  const result = d.summarizeOverview(range, [tx({ payment_type: 'hutang', debt_status: 'unpaid' }), tx({ payment_type: 'hutang', debt_status: 'paid' }), tx({ payment_type: 'hutang', debt_status: null, grand_total: 10000 }), tx({ payment_type: 'hutang', status: 'cancelled' })], [], [])
  assert.equal(result.unpaidDebt, 30000)
})

test('ranking includes every sold product, sums portions across variants, and ignores cancelled items', () => {
  const items = Array.from({ length: 14 }, (_, i) => ({ product: { id: `p-${i}`, name: `Product ${i}` }, quantity: i + 1 }))
  const result = d.summarizeOverview(range, [tx({ items }), tx({ items: [{ ...items[0], quantity: 30 }] }), tx({ status: 'cancelled', items: [{ ...items[1], quantity: 999 }] })], [], [])
  assert.equal(result.topProducts.length, 14)
  assert.equal(result.topProducts[0].name, 'Product 0')
  assert.equal(result.topProducts[0].qty, 31)
  assert.equal(result.topProducts[1].qty, 14)
})

function database({ transactions = [], expenses = [], manual = [], failSecondPage = false, owned = ['a', 'b'] } = {}) {
  const queries = []
  const tables = { transactions, expenses, manual_summaries: manual }
  const db = { from(table) {
    const log = { table, filters: [], offset: 0, limit: Infinity, order: [] }; queries.push(log)
    const q = {
      select: columns => { log.columns = columns; return q },
      in: (key, values) => { log.filters.push(row => values.includes(row[key])); return q },
      eq: (key, value) => { log.filters.push(row => row[key] === value); return q },
      gte: (key, value) => { log.filters.push(row => key === 'created_at' ? Date.parse(row[key]) >= Date.parse(value) : row[key] >= value); return q },
      lt: (key, value) => { log.filters.push(row => Date.parse(row[key]) < Date.parse(value)); return q },
      lte: (key, value) => { log.filters.push(row => row[key] <= value); return q },
      order: (key, options) => { log.order.push([key, options?.ascending !== false]); return q },
      range: (from, to) => { log.offset = from; log.limit = to - from + 1; return q },
      limit: n => { log.limit = n; return q },
      then(resolve) {
        if (failSecondPage && log.offset === 500) return Promise.resolve({ data: null, error: { message: 'network error' } }).then(resolve)
        const rows = tables[table].filter(row => log.filters.every(match => match(row)))
        rows.sort((a, b) => { for (const [key, asc] of log.order) { const comparison = String(a[key]).localeCompare(String(b[key])); if (comparison) return asc ? comparison : -comparison } return 0 })
        return Promise.resolve({ data: rows.slice(log.offset, log.offset + log.limit), error: null }).then(resolve)
      },
    }
    return q
  } }
  const actions = load('actions', {
    '@/lib/business-context': { getBusinessContext: async () => ({ supabase: db, businesses: owned.map(id => ({ id, name: id })), businessId: 'a' }) },
    './transactions/types': { TX_COLUMNS: 'detail columns' }, './overview-domain': d,
  })
  return { ...actions, queries }
}

test('query pagination includes over 1000 sales without N+1 and recent rows obey the same range', async () => {
  const transactions = Array.from({ length: 1205 }, (_, i) => tx({ id: `sale-${i}`, items: [{ product: { id: 'latte', name: 'Latte' }, quantity: 1 }] }))
  transactions.push(tx({ id: 'other-branch', business_id: 'b', grand_total: 999999 }), tx({ id: 'outsider', business_id: 'outsider', grand_total: 999999 }), tx({ id: 'old', created_at: '2026-10-01T00:00:00Z' }))
  const fixture = database({ transactions })
  const result = await fixture.getOverviewData(range, 'a')
  assert.equal(result.count, 1205)
  assert.equal(result.sales, 1205 * 20000)
  assert.equal(result.topProducts[0].qty, 1205)
  assert.equal(result.recent.length, 10)
  assert.ok(result.recent.every(row => row.business_id === 'a' && row.id !== 'old'))
  assert.equal(fixture.queries.length, 6) // 3 pages of sales + expenses + manual + recent.
})

test('all branches ignores the active header but includes only owner branches; invalid branches and ranges never query', async () => {
  const fixture = database({ transactions: [tx(), tx({ business_id: 'b' }), tx({ business_id: 'outsider' })] })
  assert.equal((await fixture.getOverviewData(range, null)).count, 2)
  const calls = fixture.queries.length
  await assert.rejects(fixture.getOverviewData(range, 'outsider'), /Cabang tidak ditemukan/)
  await assert.rejects(fixture.getOverviewData({ start: '2026-01-01', end: '2026-11-12' }, 'a'), /maksimal 3 bulan/)
  assert.equal(fixture.queries.length, calls)
  const empty = database({ owned: [] })
  assert.equal((await empty.getOverviewData(range, null)).count, 0)
  assert.equal(empty.queries.length, 0)
})

test('failed later page rejects the summary instead of showing partial totals', async () => {
  const fixture = database({ transactions: Array.from({ length: 600 }, (_, i) => tx({ id: String(i) })), failSecondPage: true })
  await assert.rejects(fixture.getOverviewData(range, 'a'), /Gagal memuat data Overview/)
})
