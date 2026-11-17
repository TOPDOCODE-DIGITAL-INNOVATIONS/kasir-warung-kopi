import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import ts from 'typescript'

function load(name) {
  const target = { exports: {} }
  const source = fs.readFileSync(fileURLToPath(new URL(`../src/app/dashboard/${name}.ts`, import.meta.url)), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  vm.runInNewContext(compiled, { module: target, exports: target.exports, Intl, Date, Math, Number, require: (n) => { throw new Error(`Unexpected dependency ${n}`) } })
  return target.exports
}
const d = load('capital/domain')
const period = (start, end, sales, expenses, extra = {}) => ({
  start_date: start, end_date: end, sales_pos: String(sales), sales_manual: '0', expenses_pos: String(expenses),
  expenses_manual: '0', overpay_pos: '0', overpay_manual: '0', tx_count: 10, ...extra,
})
const cap = (date, amount, kind = 'initial') => ({ id: date, date, kind, amount: String(amount), note: null })

const periods = [
  period('2026-09-01', '2026-09-30', 5_000_000, 3_000_000),
  period('2026-08-01', '2026-08-31', 4_000_000, 3_000_000, { sales_manual: '500000', overpay_pos: '10000' }),
  period('2026-10-01', '2026-10-31', 6_000_000, 3_000_000),
  period('2026-11-01', '2026-11-30', 1_000_000, 500_000),
]

test('rows are chronological with running cumulative profit and capital', () => {
  const rows = d.buildRows(periods, [cap('2026-07-15', 10_000_000), cap('2026-10-05', 2_000_000, 'additional')], '2026-11-17')
  assert.deepEqual([...rows.map((r) => r.month)], ['2026-08', '2026-09', '2026-10', '2026-11'])
  assert.equal(rows[0].income, 4_510_000)
  assert.equal(rows[0].capitalIn, 10_000_000, 'capital before the first period lands in the first row')
  assert.equal(rows[2].capitalIn, 2_000_000)
  assert.equal(rows[2].cumCapital, 12_000_000)
  assert.equal(rows[2].cumProfit, 1_510_000 + 2_000_000 + 3_000_000)
  assert.equal(rows[3].running, true)
  assert.equal(rows[2].running, false)
})

test('summary: remaining, recent average from finished months, and estimate', () => {
  const s = d.summarizeCapital(periods, [cap('2026-07-15', 10_000_000)], '2026-11-17')
  assert.equal(s.capital, 10_000_000)
  assert.equal(s.totals.profit, 7_010_000)
  assert.equal(s.remaining, 2_990_000)
  assert.equal(s.surplus, 0)
  assert.equal(s.recentMonths, 3)
  assert.equal(Math.round(s.avgRecentProfit), Math.round((1_510_000 + 2_000_000 + 3_000_000) / 3))
  assert.equal(s.monthsToPayback, 2)
  assert.equal(s.paybackRow, null)
  assert.equal(s.bestMonth.month, '2026-10')
  assert.equal(s.firstDate, '2026-07-15')
})

test('payback month is the first period that stays above capital', () => {
  const s = d.summarizeCapital(periods, [cap('2026-07-15', 3_000_000)], '2026-11-17')
  assert.equal(s.remaining, 0)
  assert.equal(s.surplus, 4_010_000)
  assert.equal(s.paybackRow.month, '2026-09')
  assert.equal(s.monthsToPayback, null)
})

test('no capital → payback is null and nothing remaining', () => {
  const s = d.summarizeCapital(periods, [], '2026-11-17')
  assert.equal(s.payback, null)
  assert.equal(s.remaining, 0)
  assert.equal(s.surplus, 0)
})

test('book month uses the period midpoint (tutup buku tgl 25)', () => {
  assert.equal(d.bookMonth('2026-10-26', '2026-11-25'), '2026-11')
  assert.equal(d.bookMonth('2026-11-01', '2026-11-30'), '2026-11')
})

test('month filter validates, swaps reversed ranges and filters inclusively', () => {
  assert.deepEqual({ ...d.resolveMonthFilter('2026-10', '2026-08') }, { from: '2026-08', to: '2026-10' })
  assert.deepEqual({ ...d.resolveMonthFilter('2026-13', ['x']) }, { from: '', to: '' })
  const rows = d.buildRows(periods, [], '2026-11-17')
  assert.deepEqual([...d.filterRows(rows, { from: '2026-09', to: '2026-10' }).map((r) => r.month)], ['2026-09', '2026-10'])
  assert.equal(d.filterRows(rows, { from: '', to: '' }).length, 4)
  assert.equal(d.sumRows(d.filterRows(rows, { from: '2026-11', to: '' })).profit, 500_000)
})

test('shiftMonth crosses year boundaries', () => {
  assert.equal(d.shiftMonth('2026-01', -1), '2025-12')
  assert.equal(d.shiftMonth('2026-11', 2), '2027-01')
})
