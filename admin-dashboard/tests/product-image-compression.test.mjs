import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

function load(name) {
  const target = { exports: {} }
  const source = fs.readFileSync(new URL(`../src/app/dashboard/products/${name}.ts`, import.meta.url), 'utf8')
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, {
    module: target, exports: target.exports, URL,
    require: name => { if (name === './image') return load('image'); throw new Error(`Unexpected dependency ${name}`) },
  })
  return target.exports
}
const compression = load('compress-image')
const blob = (size, type = 'image/webp') => new Blob([new Uint8Array(size)], { type })

test('photo dimensions preserve aspect ratio and do not upscale small sources', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(compression.productPhotoDimensions(4000, 3000))), { width: 1280, height: 960 })
  assert.deepEqual(JSON.parse(JSON.stringify(compression.productPhotoDimensions(100, 50))), { width: 100, height: 50 })
  assert.throws(() => compression.productPhotoDimensions(0, 100))
  assert.throws(() => compression.productPhotoDimensions(20000, 20000))
})
test('reduces quality before dimensions and returns the first acceptable WebP', async () => {
  const calls = []
  const result = await compression.encodeProductPhoto(1600, 1200, async (width, height, quality) => {
    calls.push({ width, height, quality })
    return blob(quality > 0.72 ? 220000 : 190000)
  })
  assert.equal(calls.length, 2)
  assert.ok(calls.every(call => call.width === 1280 && call.height === 960))
  assert.equal(result.type, 'image/webp')
  assert.ok(result.size < 200 * 1024)
})
test('also reduces resolution for complex images and rejects exactly 200 KiB', async () => {
  const calls = []
  const result = await compression.encodeProductPhoto(1280, 1280, async (width, height, quality) => {
    calls.push({ width, height, quality })
    return blob(width >= 1280 ? 204800 : 180000)
  })
  assert.equal(calls.length, 5)
  assert.equal(calls[4].width, 1024)
  assert.ok(result.size < 204800)
})
test('does not silently return PNG when WebP is unsupported or an oversized result', async () => {
  await assert.rejects(compression.encodeProductPhoto(100, 100, async () => blob(1000, 'image/png')), /WebP/)
  await assert.rejects(compression.encodeProductPhoto(1, 1, async () => blob(300000)), /di bawah 200 KiB/)
})
