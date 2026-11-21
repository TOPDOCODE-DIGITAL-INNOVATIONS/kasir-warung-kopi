import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const root = new URL('../src/app/dashboard/', import.meta.url)
const WRITE = /^(save|delete|add|update|regenerate|record|complete|sync|set|remove|create)/
const GUARD = /assertWritable\(\)|getCurrentOwnerAccess\(\)\)\.access\.readOnly/

function actionFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) return actionFiles(full)
    return e.name === 'actions.ts' && !full.includes(`${path.sep}billing${path.sep}`) ? [full] : []
  })
}

/** Badan fungsi yang dipanggil fungsi ini (satu tingkat), mis. updateCashier -> changeCashier. */
function functionBodies(source) {
  const sf = ts.createSourceFile('a.ts', source, ts.ScriptTarget.ES2020, true)
  const bodies = new Map()
  sf.forEachChild(node => {
    if (ts.isFunctionDeclaration(node) && node.name && node.body) {
      const exported = node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword) ?? false
      bodies.set(node.name.text, { exported, text: node.body.getText(sf) })
    }
  })
  return bodies
}

test('every dashboard write action enforces read-only mode after the subscription ends', () => {
  const files = actionFiles(root.pathname)
  assert.ok(files.length >= 7, 'action files found')
  const unguarded = []
  let checked = 0
  for (const file of files) {
    const bodies = functionBodies(fs.readFileSync(file, 'utf8'))
    for (const [name, { exported, text }] of bodies) {
      if (!exported || !WRITE.test(name)) continue
      checked++
      const delegated = [...bodies.entries()].some(([other, b]) => other !== name && text.includes(`${other}(`) && GUARD.test(b.text))
      if (!GUARD.test(text) && !delegated) unguarded.push(`${path.relative(root.pathname, file)}:${name}`)
    }
  }
  assert.ok(checked >= 20, `checked ${checked} write actions`)
  assert.deepEqual(unguarded, [])
})

test('product photo upload is blocked in read-only mode', () => {
  const src = fs.readFileSync(new URL('../src/app/api/products/image/route.ts', import.meta.url), 'utf8')
  assert.match(src, /access\.readOnly\) return NextResponse\.json\(\{ error: READ_ONLY_MESSAGE \}, \{ status: 403 \}\)/)
})

test('legal company info reads env and normalises the WhatsApp number', () => {
  const mod = { exports: {} }
  const code = ts.transpileModule(fs.readFileSync(new URL('../src/lib/legal.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const env = {}
  new Function('module', 'exports', 'process', code)(mod, mod.exports, { env })
  assert.deepEqual(mod.exports.companyInfo(), { name: 'KasirKu', address: null, email: null, whatsapp: null })
  Object.assign(env, { NEXT_PUBLIC_COMPANY_NAME: ' PT Contoh ', NEXT_PUBLIC_SUPPORT_WHATSAPP: '+62 812-3456-789' })
  assert.equal(mod.exports.companyInfo().name, 'PT Contoh')
  assert.equal(mod.exports.companyInfo().whatsapp, '628123456789')
  assert.deepEqual(mod.exports.FALLBACK_PLANS.map(p => p.amount), [20000, 200000])
})
