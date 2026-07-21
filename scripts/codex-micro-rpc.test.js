#!/usr/bin/env node
'use strict';

/**
 * Codex Micro RPC protocol model (M3) — must stay in lockstep with
 * src-tauri/src/codex_micro_vendor.rs rad_to_nav + deadzone constants.
 * If fttawa bench disagrees, change BOTH this file and the Rust constants/tests.
 */

var assert = require('assert');

var RAD_DEADZONE = 0.2;
var RAD_CENTER_RIGHT = 0.00;
var RAD_CENTER_DOWN = 0.25;
var RAD_CENTER_LEFT = 0.50;
var RAD_CENTER_UP = 0.75;

function normalizeAngle01(angle) {
  var a = angle % 1;
  if (a < 0) a += 1;
  if (a >= 1) a = 0;
  return a;
}

function circularDist01(a, b) {
  var d = Math.abs(a - b);
  if (d > 0.5) d = 1 - d;
  return d;
}

/** Map stick angle + distance → NAV_* or null (deadzone). Never NAV_PRESS / center. */
function radToNav(angle, distance) {
  if (!Number.isFinite(angle) || !Number.isFinite(distance)) return null;
  if (distance <= RAD_DEADZONE) return null;
  var a = normalizeAngle01(angle);
  var centers = [
    [RAD_CENTER_RIGHT, 'NAV_RIGHT'],
    [RAD_CENTER_DOWN, 'NAV_DOWN'],
    [RAD_CENTER_LEFT, 'NAV_LEFT'],
    [RAD_CENTER_UP, 'NAV_UP']
  ];
  var best = centers[0];
  var bestD = circularDist01(a, centers[0][0]);
  for (var i = 1; i < centers.length; i++) {
    var d = circularDist01(a, centers[i][0]);
    if (d < bestD) {
      bestD = d;
      best = centers[i];
    }
  }
  return best[1];
}

function mapThstatus(raw) {
  var s = String(raw || '').trim().toLowerCase();
  if (!s || s === 'idle' || s === 'ready' || s === 'ok') return 'idle';
  if (s === 'running' || s === 'busy' || s === 'working' || s === 'thinking') return 'running';
  if (s === 'listening' || s === 'dictating' || s === 'ptt' || s === 'mic') return 'listening';
  if (s === 'done' || s === 'success' || s === 'complete' || s === 'completed') return 'done';
  if (s === 'failed' || s === 'error' || s === 'fail') return 'failed';
  return 'idle';
}

// Deadzone
assert.strictEqual(radToNav(0, 0.2), null);
assert.strictEqual(radToNav(0, 0.1), null);
assert.strictEqual(radToNav(0.75, 0), null);

// Quadrants (locked)
assert.strictEqual(radToNav(0.0, 1), 'NAV_RIGHT');
assert.strictEqual(radToNav(0.99, 0.5), 'NAV_RIGHT');
assert.strictEqual(radToNav(0.25, 1), 'NAV_DOWN');
assert.strictEqual(radToNav(0.5, 1), 'NAV_LEFT');
assert.strictEqual(radToNav(0.75, 1), 'NAV_UP');
assert.strictEqual(radToNav(0.12, 0.9), 'NAV_RIGHT');
assert.strictEqual(radToNav(0.13, 0.9), 'NAV_DOWN');

// No center / NAV_PRESS from rad
;[0, 0.25, 0.5, 0.75, 0.125, 0.999].forEach(function (a) {
  var nav = radToNav(a, 1);
  assert.ok(nav);
  assert.notStrictEqual(nav, 'NAV_PRESS');
  assert.ok(nav.indexOf('CENTER') < 0);
});

// Thstatus → five-state
assert.strictEqual(mapThstatus('listening'), 'listening');
assert.strictEqual(mapThstatus('running'), 'running');
assert.strictEqual(mapThstatus('done'), 'done');
assert.strictEqual(mapThstatus('failed'), 'failed');
assert.strictEqual(mapThstatus('idle'), 'idle');

// Constants mirror Rust
assert.strictEqual(RAD_DEADZONE, 0.2);
assert.strictEqual(RAD_CENTER_DOWN, 0.25);
assert.strictEqual(RAD_CENTER_UP, 0.75);

// Source contract: vendor module documents methods
var fs = require('fs');
var path = require('path');
var vendor = fs.readFileSync(
  path.join(__dirname, '../src-tauri/src/codex_micro_vendor.rs'),
  'utf8'
);
assert.ok(vendor.indexOf('v.oai.rad') >= 0);
assert.ok(vendor.indexOf('RAD_DEADZONE') >= 0);
assert.ok(vendor.indexOf('NAV_PRESS') >= 0); // mentioned as never from rad
assert.ok(vendor.indexOf('v.oai.rgbcfg') >= 0);
assert.ok(vendor.indexOf('lights.preview') >= 0);
assert.ok(vendor.indexOf('sys.version') >= 0);
assert.ok(vendor.indexOf('device.status') >= 0);
assert.ok(vendor.indexOf('v.oai.thstatus') >= 0);
assert.ok(vendor.indexOf('fn rad_to_nav') >= 0);

// M4 cross-check: enhance keys + no Alt+Numpad in pad UI
var padUi = fs.readFileSync(
  path.join(__dirname, '../src/js/features/agent/codex-micro-pad-ui.js'),
  'utf8'
);
assert.ok(padUi.indexOf('JOY_DIR_MS') >= 0);
assert.ok(padUi.indexOf('3000') >= 0);
assert.ok(padUi.indexOf('Alt+Numpad') < 0);
assert.ok(padUi.indexOf('enterJoyDirectionMode') >= 0);
assert.ok(padUi.indexOf("window.addEventListener('keydown'") >= 0
  || padUi.indexOf('window.addEventListener("keydown"') >= 0
  || padUi.indexOf("addEventListener('keydown', joyDirKeyHandler") >= 0);

console.log('codex-micro-rpc.test.js ok');
