import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

function load(file, dependencies = {}) {
  const target = { exports: {} }
  const code = ts.transpileModule(fs.readFileSync(new URL(`../src/app/dashboard/${file}.ts`, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  vm.runInNewContext(code, { module: target, exports: target.exports, require(name) {
    if (name in dependencies) return dependencies[name]
    throw new Error(`Unexpected import ${name}`)
  } })
  return target.exports
}
const overview = load('overview-domain')
const h = load('products/history-domain', { '../overview-domain': overview, '@/lib/format': { dayKey: () => '2026-11-17' } })
const json = value => JSON.parse(JSON.stringify(value))
const purchase = (id, supplierId, price, date = '2026-11-17T01:00:00Z') => ({ id, supplierId, supplier: 'Same display name', date, unitPrice: price, amount: price == null ? 20000 : price * 10, quantity: price == null ? null : 10 })

test('history date defaults, WIB boundaries and maximum range are inclusive and calendar-safe', () => {
  assert.deepEqual(json(h.defaultHistoryRange()), { start: '2026-10-18', end: '2026-11-17' })
  assert.deepEqual(json(h.defaultHistoryRange('2026-03-31')), { start: '2026-03-01', end: '2026-03-31' })
  assert.deepEqual(json(h.defaultHistoryRange('2024-03-31')), { start: '2024-03-01', end: '2024-03-31' })
  assert.deepEqual(json(h.historyBounds('2026-11-17', '2026-11-17')), { from: '2026-11-17T00:00:00+07:00', until: '2026-11-18T00:00:00+07:00' })
  for (const request of [null, {}, { tab: 'private', start: '2026-11-17', end: '2026-11-17' }, { tab: 'purchases', start: '2026-02-30', end: '2026-03-01' }, { tab: 'events', start: '2026-11-17', end: '2026-11-16' }, { tab: 'adjustments', start: '2026-11-17', end: '2027-02-17' }]) assert.throws(() => h.validateHistoryRequest(request))
  assert.equal(h.validateHistoryRequest({ tab: 'purchases', start: '2026-11-17', end: '2027-02-16' }).end, '2027-02-16')
})

test('monthly expense date filter includes only first-of-month anchors in the selected range', () => {
  assert.equal(h.historyExpenseFilter('2026-11-17', '2026-11-17'), 'and(scope.eq.daily,date.gte.2026-11-17,date.lte.2026-11-17)')
  assert.match(h.historyExpenseFilter('2026-11-17', '2027-01-15'), /scope.eq.monthly,date.gte.2026-12,date.lte.2027-01/)
  assert.match(h.historyExpenseFilter('2026-11-01', '2026-11-17'), /scope.eq.monthly,date.gte.2026-11,date.lte.2026-11/)
})

test('supplier grouping picks cheapest base-unit price, retains unknown suppliers and never treats missing quantity as free', () => {
  const rows = [purchase('a-expensive', 'supplier-a', 22000), purchase('a-cheap', 'supplier-a', 18000), purchase('b', 'supplier-b', 19000), purchase('unknown-1', null, 20000), purchase('unknown-2', null, 21000), purchase('a-nominal', 'supplier-a', null), purchase('c', 'supplier-c', null)]
  assert.deepEqual(json(h.visiblePurchases(rows, 'cheapest', true)).map(r => r.id), ['a-cheap', 'b', 'unknown-1', 'unknown-2', 'c'])
  assert.equal(h.visiblePurchases(rows, 'cheapest', false).length, rows.length)
  assert.equal(rows[0].id, 'a-expensive', 'sorting must not mutate the cached records')
  // Lower total is more expensive per unit: 18k / 1 vs 20k / 2.
  const differentQuantities = [{ ...purchase('18k', 'same', 18000), amount: 18000, quantity: 1 }, { ...purchase('20k', 'same', 10000), amount: 20000, quantity: 2 }]
  assert.equal(h.visiblePurchases(differentQuantities, 'cheapest', true)[0].id, '20k')
})

test('ties and latest sorting use actual instants across timezones; unknown-only supplier chooses latest', () => {
  const rows = [purchase('older', 'a', null, '2026-11-17T00:00:00+07:00'), purchase('newer', 'a', null, '2026-11-16T20:00:00Z'), purchase('tie-b', 'b', 10), purchase('tie-a', 'b', 10)]
  assert.equal(h.visiblePurchases(rows, 'newest', true).find(r => r.supplierId === 'a').id, 'newer')
  assert.equal(h.visiblePurchases(rows, 'cheapest', true).find(r => r.supplierId === 'b').id, 'tie-a')
})
