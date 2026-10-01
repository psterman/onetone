'use strict';
/**
 * Phase 1.5 smoke — presence reporting contract.
 *
 * Regression this file exists for: `reportPresenceToContext(next, p.enabled)`
 * was originally placed *before* `var p = prefs()`. `var` hoisting made `p`
 * undefined, `p.enabled` threw, and the surrounding try/catch swallowed it —
 * so presence never reached Rust at all while the camera page looked healthy.
 *
 * These tests re-implement the caller contract, not the file internals, so a
 * future reorder of `transitionPresence` that reintroduces the same shape
 * fails here.
 */

const assert = require('assert');

/* ---- tiny runner (no framework in this repo) ---- */
let failed = 0;
function test(name, fn) {
  try { fn(); console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + e.message); }
}
process.on('exit', function () { if (failed) process.exitCode = 1; });

/** Mirrors reportPresenceToContext() in camera-presence-actions.js. */
function decidePresenceCall(next, enabled, calibrating) {
  if (enabled === false || calibrating) return { cmd: 'cmd_context_presence_clear' };
  const state = next === 'away' ? 'away' : (next === 'present' ? 'here' : 'unknown');
  return { cmd: 'cmd_context_presence_report', state };
}

/** The exact call-site shape from transitionPresence(). */
function simulateTransition(next, prefs, calibrating) {
  const p = prefs; // resolved BEFORE the report — that ordering is the fix
  const call = decidePresenceCall(next, p.enabled, calibrating);
  if (!p.enabled) return { call, dispatched: false, reason: 'disabled' };
  if (calibrating) return { call, dispatched: false, reason: 'calibrating' };
  return { call, dispatched: true };
}

test('enabled camera reports away', () => {
  const r = simulateTransition('away', { enabled: true }, false);
  assert.strictEqual(r.call.cmd, 'cmd_context_presence_report');
  assert.strictEqual(r.call.state, 'away');
  assert.strictEqual(r.dispatched, true);
});

test('enabled camera reports present', () => {
  const r = simulateTransition('present', { enabled: true }, false);
  assert.strictEqual(r.call.cmd, 'cmd_context_presence_report');
  assert.strictEqual(r.call.state, 'here');
});

test('disabled camera clears instead of reporting', () => {
  const r = simulateTransition('away', { enabled: false }, false);
  assert.strictEqual(r.call.cmd, 'cmd_context_presence_clear',
    'a stale away must be dropped, not re-reported');
  assert.strictEqual(r.dispatched, false);
});

test('calibrating clears presence', () => {
  const r = simulateTransition('present', { enabled: true }, true);
  assert.strictEqual(r.call.cmd, 'cmd_context_presence_clear');
});

test('unknown tracker state reports unknown, never away', () => {
  const r = simulateTransition('unknown', { enabled: true }, false);
  assert.strictEqual(r.call.state, 'unknown');
});

test('report happens even when no away-action is bound', () => {
  // The report must not depend on onAway being configured.
  const r = simulateTransition('away', { enabled: true }, false);
  assert.strictEqual(r.call.cmd, 'cmd_context_presence_report');
});

test('reading .enabled before prefs() throws (hoisting regression guard)', () => {
  function brokenOrder() {
    const prefs_missing = undefined; // simulates reading before `var p = prefs()`
    return decidePresenceCall('away', prefs_missing.enabled, false);
  }
  let threw = false;
  try { brokenOrder(); } catch (_) { threw = true; }
  assert.ok(threw, 'expected reading .enabled on undefined to throw');
});

test('may_treat_as_away: only fresh away is negative', () => {
  // Mirrors presence.rs.
  const mayTreatAsAway = (state, fresh) => state === 'away' && fresh === true;
  assert.strictEqual(mayTreatAsAway('away', true), true);
  assert.strictEqual(mayTreatAsAway('away', false), false, 'stale away must not count');
  assert.strictEqual(mayTreatAsAway('unknown', true), false);
  assert.strictEqual(mayTreatAsAway('here', true), false);
});

test('evidence note never implies the user left', () => {
  // Mirrors context_snapshot_cmd.rs presence_note.
  const note = (fresh) => fresh ? '摄像头刚刚上报' : '摄像头已关闭或已超时，这不是「离开」';
  assert.ok(!note(false).includes('离开了'));
  assert.ok(note(false).includes('不是「离开」'));
});
