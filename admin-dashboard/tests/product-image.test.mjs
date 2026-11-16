import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
const target = { exports: {} }
const source = fs.readFileSync(new URL('../src/app/dashboard/products/image.ts', import.meta.url), 'utf8')
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { module: target, exports: target.exports, URL })
const image = target.exports

test('stored uploads must be WebP and strictly smaller than 200 KiB', () => {
  assert.equal(image.productImageError(204799, 'image/webp'), null)
  assert.ok(image.productImageError(204800, 'image/webp'))
  for (const type of ['image/jpeg','image/png']) assert.ok(image.productImageError(2048, type))
  assert.ok(image.productImageError(2048, 'image/svg+xml'))
  assert.ok(image.productImageError(2048, 'text/html'))
  assert.ok(image.productImageError(0, 'image/png'))
  assert.ok(image.productImageError(2 * 1024 * 1024 + 1, 'image/png'))
})
test('source photos can be JPG, PNG or WebP up to ten MiB before compression', () => {
  for (const type of ['image/jpeg','image/png','image/webp']) assert.equal(image.productImageSourceError(10 * 1024 * 1024, type), null)
  assert.ok(image.productImageSourceError(10 * 1024 * 1024 + 1, 'image/png'))
  assert.ok(image.productImageSourceError(100, 'image/svg+xml'))
})
test('file content must match the declared type', () => {
  assert.equal(image.imageMatchesType(new Uint8Array([255,216,255]), 'image/jpeg'), true)
  assert.equal(image.imageMatchesType(new Uint8Array([137,80,78,71,13,10,26,10]), 'image/png'), true)
  assert.equal(image.imageMatchesType(new Uint8Array([82,73,70,70,0,0,0,0,87,69,66,80]), 'image/webp'), true)
  assert.equal(image.imageMatchesType(new TextEncoder().encode('<html>'), 'image/png'), false)
  assert.equal(image.imageMatchesType(new Uint8Array([137,80]), 'image/png'), false)
})
test('an image URL can only refer to the correct owner, branch, product and storage origin', () => {
  const owner = 'owner-a', branch = 'branch-a', product = 'product-a'
  const path = `${owner}/${branch}/${product}/00000000-0000-4000-8000-000000000001.webp`
  const url = `https://example.supabase.co/storage/v1/object/public/product-images/${path}`
  assert.equal(image.productImagePath(url, 'https://example.supabase.co', owner, branch, product), path)
  for (const invalid of [url.replace('owner-a', 'owner-b'), url.replace('branch-a', 'branch-b'), url.replace('product-a/', 'product-b/'), url.replace('example.supabase.co', 'evil.example'), `${url}?token=secret`, url.replace('.webp', '.svg'), url.replace('product-a/', 'product-a/../')]) {
    assert.equal(image.productImagePath(invalid, 'https://example.supabase.co', owner, branch, product), null)
  }
})
