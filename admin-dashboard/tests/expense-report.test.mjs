import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'

const source = fs.readFileSync(path.resolve(import.meta.dirname, '../../shared/expense-report.ts'), 'utf8')
function load(globals = {}) {
  const module = { exports: {} }
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText,
    { module, exports: module.exports, setTimeout, clearTimeout, ...globals })
  return module.exports
}
const base = { branchName: 'RUAS KOPI BALI', period: 'November 2026' }

test('report sorts daily and monthly expenses oldest first without mutating the input', () => {
  const rows = [
    { id: 'later', date: '2026-11-16', scope: 'daily', amount: 2 },
    { id: 'month', date: '2026-11', scope: 'monthly', amount: 3 },
    { id: 'earlier', date: '2026-10-30', scope: 'daily', amount: 1 },
    { id: 'first-today', date: '2026-11-16', scope: 'daily', amount: 4, createdAt: '2026-11-16T01:00:00Z' },
    { id: 'last-today', date: '2026-11-16', scope: 'daily', amount: 5, createdAt: '2026-11-16T03:00:00Z' },
  ]
  const saved = JSON.stringify(rows)
  assert.deepEqual(Array.from(load().expenseReportRows(rows), e => e.id), ['earlier', 'month', 'later', 'first-today', 'last-today'])
  assert.equal(JSON.stringify(rows), saved)
})

test('Pembelian uses the note then category; category and related data remain separate and totals use cents', () => {
  const report = load().buildExpenseReport({ ...base, category: 'Bahan Baku', rows: [
    { id: 'a', scope: 'daily', date: '2026-11-16', category: 'Bahan Baku', note: 'Beli susu 2 liter', amount: '23000.10', productName: 'Susu', quantity: 2, unitLabel: 'l', supplierName: 'Supplier A', createdBy: 'Fajar', createdAt: '2026-11-16T01:00:00Z', entryGroupId: 'group-a', fromDrawer: true, shiftId: 'shift-a' },
    { id: 'b', scope: 'daily', date: '2026-11-15', category: 'Transport', note: '  ', amount: '10000.20' },
  ] })
  assert.equal(report.total, 33000.3)
  assert.equal(report.count, 2)
  for (const text of ['<th>Pembelian</th>', '<th>Kategori</th>', '<strong>Beli susu 2 liter</strong>', '<strong>Transport</strong>', 'Supplier A', 'Fajar', '2 L', 'group-a', 'shift-a', 'WIB', 'Total Pengeluaran']) assert.ok(report.html.includes(text), text)
  assert.ok(!report.html.includes('<th>Catatan</th>'))
  assert.ok(report.html.indexOf('ID: b') < report.html.indexOf('ID: a'))
  assert.match(report.html, /A4 landscape/)
  assert.match(report.html, /table-header-group/)
})

test('all user data is escaped; only the supplied filtered rows enter the PDF', () => {
  const html = load().buildExpenseReport({ branchName: '<img src=x onerror=alert(1)>', period: '<script>bad()</script>', rows: [
    { id: 'safe', date: '2026-11-16', scope: 'daily', amount: 1000, category: 'A&B', note: '<script>alert(1)</script>', supplierName: '"<supplier>', createdBy: '<owner>' },
  ] }).html
  assert.ok(!html.includes('<script>'))
  assert.ok(!html.includes('<img'))
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'))
  assert.ok(html.includes('A&amp;B'))
  assert.ok(html.includes('&lt;owner&gt;'))
  assert.ok(html.includes('1 catatan'))
})

test('print uses an isolated iframe, restores the app title and removes it after the print dialog', async () => {
  let frame, printed = false, removed = false, afterprint
  const document = { title: 'KasirKu', createElement: tag => {
    assert.equal(tag, 'iframe')
    frame = { style: {}, remove() { removed = true }, contentDocument: { fonts: { ready: Promise.resolve() } }, contentWindow: {
      focus() {}, addEventListener(name, fn) { assert.equal(name, 'afterprint'); afterprint = fn }, print() { printed = true; afterprint() },
    } }
    return frame
  }, body: { appendChild() { queueMicrotask(() => frame.onload()) } } }
  await load({ document }).printExpenseReport({ ...base, rows: [] })
  assert.equal(printed, true)
  assert.equal(removed, true)
  assert.equal(document.title, 'KasirKu')
  assert.ok(frame.srcdoc.includes('Tabel pengeluaran'))
})
