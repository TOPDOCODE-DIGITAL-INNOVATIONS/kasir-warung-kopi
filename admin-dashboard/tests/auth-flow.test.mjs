import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'

const mod = { exports: {} }
const code = ts.transpileModule(fs.readFileSync(new URL('../src/lib/auth-flow.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText
new Function('module', 'exports', code)(mod, mod.exports)
const { safeNextPath, validEmail, newPasswordError, emailOtpType } = mod.exports

test('next path only allows known internal pages', () => {
  assert.equal(safeNextPath('/reset-password'), '/reset-password')
  assert.equal(safeNextPath('/dashboard/products?x=1'), '/dashboard/products?x=1')
  assert.equal(safeNextPath('/platform'), '/platform')
  for (const bad of [null, '', 'reset-password', '/login', '/dashboardx', '//evil.com', '/\\evil.com', 'https://evil.com/dashboard', '/dashboard/https://evil.com']) {
    assert.equal(safeNextPath(bad), null, `rejects ${bad}`)
  }
})

test('email validation matches the registration rules', () => {
  assert.ok(validEmail('owner@warung.id'))
  assert.ok(!validEmail('owner@'))
  assert.ok(!validEmail('a b@c.d'))
  assert.ok(!validEmail('a'.repeat(250) + '@x.id'))
})

test('new password requires 8-128 characters and a matching confirmation', () => {
  assert.match(newPasswordError('short', 'short'), /8 hingga 128/)
  assert.match(newPasswordError('x'.repeat(129), 'x'.repeat(129)), /8 hingga 128/)
  assert.match(newPasswordError('password1', 'password2'), /tidak sama/)
  assert.equal(newPasswordError('password1', 'password1'), null)
})

test('only Supabase email OTP types are accepted', () => {
  assert.equal(emailOtpType('recovery'), 'recovery')
  assert.equal(emailOtpType('signup'), 'signup')
  assert.equal(emailOtpType('sms'), null)
  assert.equal(emailOtpType(null), null)
})
