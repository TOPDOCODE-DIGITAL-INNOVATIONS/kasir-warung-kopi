import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const moduleUnderTest = { exports: {} }
const code = ts.transpileModule(fs.readFileSync(new URL('../src/lib/money.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText
vm.runInNewContext(code, { module: moduleUnderTest, exports: moduleUnderTest.exports })
const { formatRupiahInput, rupiahInputValue, parseMoney, formatMoney } = moduleUnderTest.exports

test('prices are grouped while typing without retaining an unwanted leading zero', () => {
  for (const [input, expected] of [['2', '2'], ['23', '23'], ['230', '230'], ['2300', '2.300'], ['23000', '23.000'], ['023000', '23.000'], ['000', '0'], ['Rp 1.250.000', '1.250.000']]) {
    assert.equal(formatRupiahInput(input), expected)
  }
})

test('display grouping never changes the amount submitted to inventory actions', () => {
  for (const [input, expected] of [['23000', '23000'], ['1.250.000', '1250000'], ['23.000,50', '23000.50'], ['0,000001', '0.000001'], ['999.999.999', '999999999']]) {
    assert.equal(rupiahInputValue(formatRupiahInput(input)), expected)
  }
})

test('optional empty cost, zero prices, and an unfinished decimal remain distinct', () => {
  assert.equal(rupiahInputValue(formatRupiahInput('')), '')
  assert.equal(rupiahInputValue(formatRupiahInput('0')), '0')
  assert.equal(formatRupiahInput('23000,'), '23.000,')
  assert.equal(rupiahInputValue(formatRupiahInput('23000,')), '23000')
})

test('inventory costs retain six fractional digits, including trailing zeroes', () => {
  assert.equal(formatRupiahInput('23000,123456'), '23.000,123456')
  assert.equal(formatRupiahInput('23000,120000'), '23.000,120000')
  assert.equal(rupiahInputValue('23.000,120000'), '23000.120000')
  assert.equal(formatRupiahInput('0,1234567'), '0,123456')
})

test('existing recap currency parsing and formatting keep their behavior', () => {
  assert.equal(parseMoney('7.419.797,28'), 7419797.28)
  assert.equal(parseMoney('7,419,797.28'), 7419797.28)
  assert.equal(formatMoney(7419797.28), '7.419.797,28')
})
