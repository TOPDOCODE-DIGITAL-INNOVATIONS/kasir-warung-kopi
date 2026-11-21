import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'

const mod = { exports: {} }
const code = ts.transpileModule(fs.readFileSync(new URL('../../shared/billing-access.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText
new Function('module', 'exports', code)(mod, mod.exports)
const { computeAccess, deviceCanSell, toDeviceAccess, accessMessage, GRACE_DAYS } = mod.exports

const now = new Date('2026-11-21T10:00:00Z')
const days = (n) => new Date(now.getTime() + n * 86400000).toISOString()

test('no trial and no subscription is "none" and never read-only', () => {
  const a = computeAccess({ trial_ends_at: null, subscription: null }, now)
  assert.equal(a.state, 'none')
  assert.equal(a.readOnly, false)
  assert.equal(computeAccess(null, now).state, 'none')
})

test('running trial reports remaining days and reminds only in the last 3 days', () => {
  const early = computeAccess({ trial_ends_at: days(10) }, now)
  assert.equal(early.state, 'trial')
  assert.equal(early.daysLeft, 10)
  assert.equal(early.showReminder, false)
  const late = computeAccess({ trial_ends_at: days(2.5) }, now)
  assert.equal(late.daysLeft, 3)
  assert.equal(late.showReminder, true)
})

test('grace period lasts exactly GRACE_DAYS after the end, then becomes read-only', () => {
  assert.equal(GRACE_DAYS, 3)
  const grace = computeAccess({ trial_ends_at: days(-1) }, now)
  assert.equal(grace.state, 'grace')
  assert.equal(grace.readOnly, false)
  assert.equal(grace.daysLeft, 2)
  assert.equal(computeAccess({ trial_ends_at: days(-2.999) }, now).state, 'grace')
  const expired = computeAccess({ trial_ends_at: days(-3) }, now)
  assert.equal(expired.state, 'expired')
  assert.equal(expired.readOnly, true)
})

test('paid period wins over trial and auto-renewal suppresses the reminder', () => {
  const paid = { trial_ends_at: days(-20), subscription: { status: 'active', period_end: days(2), renewal_enabled: true } }
  const a = computeAccess(paid, now)
  assert.equal(a.state, 'active')
  assert.equal(a.showReminder, false)
  const noRenew = computeAccess({ ...paid, subscription: { ...paid.subscription, renewal_enabled: false } }, now)
  assert.equal(noRenew.showReminder, true)
})

test('paying during a trial uses the later end date', () => {
  const a = computeAccess({ trial_ends_at: days(5), subscription: { status: 'active', period_end: days(30), renewal_enabled: true } }, now)
  assert.equal(a.state, 'active')
  assert.equal(a.endsAt, days(30))
})

test('pending subscription is not access; stopped renewal keeps access until period end', () => {
  assert.equal(computeAccess({ trial_ends_at: days(-10), subscription: { status: 'pending', period_end: days(30) } }, now).state, 'expired')
  assert.equal(computeAccess({ subscription: { status: 'ended', period_end: days(4), renewal_enabled: false } }, now).state, 'active')
})

test('failed renewal is flagged and always reminded', () => {
  const a = computeAccess({ subscription: { status: 'past_due', period_end: days(20), renewal_enabled: true } }, now)
  assert.equal(a.paymentIssue, true)
  assert.equal(a.showReminder, true)
  assert.match(accessMessage(a), /gagal/)
})

test('invalid dates are ignored instead of granting or denying access', () => {
  assert.equal(computeAccess({ trial_ends_at: 'not-a-date' }, now).state, 'none')
})

test('device: unknown or not-started access never blocks selling', () => {
  assert.equal(deviceCanSell(null, now), true)
  assert.equal(deviceCanSell({ state: 'none', graceEndsAt: null, checkedAt: now.toISOString() }, now), true)
})

test('device: blocked when server says expired or device clock passes grace end', () => {
  const access = computeAccess({ trial_ends_at: days(1) }, now)
  const device = toDeviceAccess(access, now)
  assert.equal(deviceCanSell(device, now), true)
  assert.equal(deviceCanSell(device, new Date(days(3.9))), true)
  assert.equal(deviceCanSell(device, new Date(days(4))), false)
  assert.equal(deviceCanSell({ ...device, state: 'expired' }, now), false)
})

test('device: rolling the clock back before the last server check does not unblock', () => {
  const device = { state: 'grace', graceEndsAt: days(1), checkedAt: days(2) }
  assert.equal(deviceCanSell(device, new Date(days(-5))), false)
})

test('messages exist for every state', () => {
  for (const state of ['trial', 'active', 'grace', 'expired', 'none']) {
    assert.ok(accessMessage({ state, daysLeft: 1, paymentIssue: false }).length > 10)
  }
})
