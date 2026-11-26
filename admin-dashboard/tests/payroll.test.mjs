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
  vm.runInNewContext(compiled, { module: target, exports: target.exports, Intl, Date, Math, Number, Map, String, require: (n) => { throw new Error(`Unexpected dependency ${n}`) } })
  return target.exports
}
const d = load('payroll/domain')
const emp = (id, name, base, active = true) => ({ id, name, job_title: null, base_salary: base, pay_cycle: 'monthly', is_active: active, note: null })
const pay = (employee_id, amount) => ({ id: `p-${employee_id}`, employee_id, employee_name: employee_id, period: '2026-11', amount, paid_date: '2026-11-30', note: null, created_by: null })

test('period helpers', () => {
  assert.equal(d.resolvePeriod('2026-02', '2026-11-26'), '2026-02')
  assert.equal(d.resolvePeriod(['2026-03'], '2026-11-26'), '2026-03')
  assert.equal(d.resolvePeriod('2026-13', '2026-11-26'), '2026-11')
  assert.equal(d.resolvePeriod(undefined, '2026-11-26'), '2026-11')
  assert.equal(d.shiftPeriod('2026-01', -1), '2025-12')
  assert.equal(d.shiftPeriod('2026-12', 1), '2027-01')
  assert.equal(d.periodLabel('2026-11'), 'November 2026')
})

test('validation', () => {
  assert.equal(d.validDate('2026-02-29'), false)
  assert.equal(d.validDate('2028-02-29'), true)
  assert.equal(d.validAmount(0), false)
  assert.equal(d.validAmount(0, { allowZero: true }), true)
  assert.equal(d.validAmount(1.005), false)
  assert.equal(d.validAmount(1_000_000_000), false)
  assert.deepEqual({ ...d.validateEmployee({ name: '  Budi ', job_title: '', base_salary: 2500000, note: ' ' }) },
    { name: 'Budi', job_title: null, base_salary: 2500000, note: null })
  assert.throws(() => d.validateEmployee({ name: ' ', job_title: '', base_salary: 0, note: '' }), /Nama pegawai/)
  assert.throws(() => d.validateEmployee({ name: 'A', job_title: '', base_salary: -1, note: '' }), /Gaji pokok/)
})

test('payroll rows: unpaid first, inactive only when paid, summary', () => {
  const employees = [emp('b', 'Budi', 2500000), emp('a', 'Ani', 2000000), emp('x', 'Lama', 1000000, false), emp('y', 'Keluar', 1500000, false)]
  const rows = d.payrollRows(employees, [pay('b', 2600000), pay('y', 500000)])
  assert.deepEqual(rows.map(r => r.employee.id), ['a', 'b', 'y'])
  assert.deepEqual({ ...d.summarize(rows) }, { paid: 3100000, paidCount: 2, unpaidCount: 1, estimate: 2000000 })
})
