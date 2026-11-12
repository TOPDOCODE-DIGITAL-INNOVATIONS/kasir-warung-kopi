import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import ts from 'typescript'
const moduleUnderTest = { exports: {} }
const source = fs.readFileSync(fileURLToPath(new URL('../src/app/dashboard/products/domain.ts', import.meta.url)), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
vm.runInNewContext(compiled, { module: moduleUnderTest, exports: moduleUnderTest.exports, require: () => { throw new Error('Unexpected runtime dependency') } })
const d = moduleUnderTest.exports

test('stock/cost calculations retain six decimal places without binary float drift', () => {
  assert.equal(d.multiply('0.1', '0.2'), '0.020000')
  assert.equal(d.multiply('0.000001', '1000'), '0.001000')
  assert.equal(d.addStock(0.1, '0.2'), 0.3)
  assert.equal(d.amount('0.123456', 'Harga'), '0.123456')
})
test('invalid amounts are rejected before a stock operation is written', () => {
  for (const value of ['NaN', 'Infinity', '-1', '1e9', '0.1234567', '1000000000']) assert.throws(() => d.amount(value, 'Jumlah'))
  assert.throws(() => d.amount('0', 'Jumlah', true))
  assert.throws(() => d.addStock(999999999, '1'))
})
test('an unlimited product stays unlimited when receiving stock', () => {
  assert.equal(d.addStock(-1, '50'), -1)
})
test('journal finalization is idempotent and preserves existing product options', () => {
  const event = { id: 'one', kind: 'purchase', status: 'pending', before: 0, after: 2, quantity: 2 }
  const raw = d.withEvent({ options: [{ name: 'Ice' }] }, event, true)
  assert.equal(raw._inventory.pending, 'one')
  const completed = d.withEvent(raw, { ...event, status: 'complete' })
  assert.equal(d.events(completed).length, 1)
  assert.equal(completed._inventory.pending, undefined)
  assert.equal(completed.options[0].name, 'Ice')
})
test('POS config contains no admin journal and retains the newest POS options', () => {
  const p = { id: 'p-1', name: 'Latte', price: 22000, stock: -1, cost_price: null, raw: { _inventory: { events: ['private'] } } }
  const config = d.productForPos(p, { id: 'p-1', options: [{ name: 'New option' }], _inventory: { secret: true } })
  assert.equal(config._inventory, undefined)
  assert.equal(config.options[0].name, 'New option')
  assert.equal(config.stock, -1)
  assert.equal(config.costPrice, undefined)
})
test('sales totals use historical item amounts, exclude cancellations and separate branches', () => {
  const item = (q, total) => ({ product: { id: 'p-1', price: 999999 }, quantity: q, totalPrice: total })
  const totals = d.summarizeSales([
    { business_id: 'a', status: 'completed', items: [item(0.1, 1000.1), item(0.2, 1000.2)] },
    { business_id: 'a', status: 'cancelled', items: [item(10, 999999)] },
    { business_id: 'b', status: 'completed', items: [item(1, 5000)] },
  ])
  assert.equal(totals.get('a:p-1').quantity, 0.3)
  assert.equal(totals.get('a:p-1').amount, 2000.3)
  assert.equal(totals.get('b:p-1').amount, 5000)
})
