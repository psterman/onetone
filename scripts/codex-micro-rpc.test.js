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
  if (s === 'listening' || s === 'dictating' || s === 'ptt' || s === 'mic' || s === 'needs_input' || s === 'waiting' || s === 'approval' || s === 'attention') return 'listening';
  if (s === 'done' || s === 'success' || s === 'complete' || s === 'completed') return 'done';
  if (s === 'failed' || s === 'error' || s === 'fail') return 'failed';
  return 'idle';
}

/** AG slot lights: idle | running | needs_input | done | failed */
function mapAgentSlotState(raw) {
  var s = String(raw || '').trim().toLowerCase();
  if (!s || s === 'idle' || s === 'blank' || s === 'ready' || s === 'ok') return 'idle';
  if (s === 'running' || s === 'busy' || s === 'working' || s === 'thinking') return 'running';
  if (s === 'needs_input' || s === 'waiting' || s === 'approval' || s === 'attention' || s === 'listening' || s === 'dictating' || s === 'ptt' || s === 'mic') return 'needs_input';
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
assert.strictEqual(mapAgentSlotState('thinking'), 'running');
assert.strictEqual(mapAgentSlotState('approval'), 'needs_input');
assert.strictEqual(mapAgentSlotState('listening'), 'needs_input');
assert.strictEqual(mapAgentSlotState('failed'), 'failed');

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
assert.ok(vendor.indexOf('agent_slots') >= 0);
assert.ok(vendor.indexOf('ever_native') >= 0);
assert.ok(vendor.indexOf('NATIVE_STALE_MS') >= 0);
assert.ok(vendor.indexOf('needs_input') >= 0);
assert.ok(vendor.indexOf('connection_state') >= 0);
// Protocol must not drive overlay local run status from thstatus.
assert.ok(vendor.indexOf('apply_thstatus') >= 0);
var thFn = vendor.slice(vendor.indexOf('fn apply_thstatus'), vendor.indexOf('fn map_agent_slot_state'));
assert.ok(thFn.indexOf('note_pad_run_status') < 0);

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

var overlayHtml = fs.readFileSync(
  path.join(__dirname, '../src/codex-micro-overlay.html'),
  'utf8'
);
assert.ok(overlayHtml.indexOf('data-status-source') >= 0);
assert.ok(overlayHtml.indexOf('statusSource') >= 0);

var overlayCss = fs.readFileSync(
  path.join(__dirname, '../src/css/codex-micro-overlay.css'),
  'utf8'
);
assert.ok(overlayCss.indexOf('needs_input') >= 0);

// Loopback HTTP status surface (Labs) — status only, never hid/rad
var protocolServer = fs.readFileSync(
  path.join(__dirname, '../src-tauri/src/codex_micro_protocol_server.rs'),
  'utf8'
);
assert.ok(protocolServer.indexOf('codex_micro_protocol_server') >= 0 || protocolServer.indexOf('PROTOCOL_PATH') >= 0);
assert.ok(protocolServer.indexOf('v.oai.thstatus') >= 0);
assert.ok(protocolServer.indexOf('v.oai.rgbcfg') >= 0);
assert.ok(protocolServer.indexOf('lights.preview') >= 0);
assert.ok(protocolServer.indexOf('device.status') >= 0);
assert.ok(protocolServer.indexOf('sys.version') >= 0);
assert.ok(protocolServer.indexOf('ALLOWED_METHODS') >= 0);
assert.ok(protocolServer.indexOf('fn allowed_http_method') >= 0);
// Default HTTP whitelist must NOT include action methods
var allowBlock = protocolServer.slice(
  protocolServer.indexOf('ALLOWED_METHODS'),
  protocolServer.indexOf(']', protocolServer.indexOf('ALLOWED_METHODS')) + 1
);
assert.ok(allowBlock.indexOf('v.oai.hid') < 0);
assert.ok(allowBlock.indexOf('v.oai.rad') < 0);
assert.ok(protocolServer.indexOf('is_http_action_method') >= 0);
assert.ok(protocolServer.indexOf('Default: OFF') >= 0 || protocolServer.indexOf('默认') >= 0);
assert.ok(protocolServer.indexOf('ONETONE_CODEX_MICRO_PROTOCOL') >= 0);
assert.ok(protocolServer.indexOf('8796') >= 0);
assert.ok(protocolServer.indexOf('/api/codex-app/state') >= 0 || protocolServer.indexOf('APP_STATE_PATH') >= 0);
assert.ok(protocolServer.indexOf('codex_app_state') >= 0);
assert.ok(protocolServer.indexOf('handle_app_state_post') >= 0);
assert.ok(protocolServer.indexOf('handle_app_state_get') >= 0);
assert.ok(protocolServer.indexOf('codex-micro-http') >= 0);

var appStateRs = fs.readFileSync(
  path.join(__dirname, '../src-tauri/src/codex_app_state.rs'),
  'utf8'
);
assert.ok(appStateRs.indexOf('codex_hook') >= 0);
assert.ok(appStateRs.indexOf('codex_app') >= 0);
assert.ok(appStateRs.indexOf('native_micro') >= 0); // rejected as source
assert.ok(appStateRs.indexOf('v.oai.thstatus') < 0 || appStateRs.indexOf('Never converts') >= 0);
assert.ok(appStateRs.indexOf('apply_rpc_json') < 0);
assert.ok(appStateRs.indexOf('invalid_method') >= 0);
assert.ok(appStateRs.indexOf('UserPromptSubmit') >= 0);
assert.ok(appStateRs.indexOf('PermissionRequest') >= 0);
assert.ok(appStateRs.indexOf('IDLE_AFTER_DONE_MS') >= 0);
assert.ok(appStateRs.indexOf('last_event') >= 0);

var reducer = require('./codex-hook-reducer');
assert.equal(reducer.mapEventToStatus('UserPromptSubmit'), 'running');
assert.equal(reducer.mapEventToStatus('PreToolUse'), 'running');
assert.equal(reducer.mapEventToStatus('PostToolUse'), 'running');
assert.equal(reducer.mapEventToStatus('PermissionRequest'), 'needs_input');
assert.equal(reducer.mapEventToStatus('Stop'), 'done');
var st = reducer.createStore();
st = reducer.applyEvent(st, { source: 'codex_hook', event: 'Stop' }, 5000);
assert.equal(st.status, 'done');
var snapIdle = reducer.snapshot(st, 5000 + reducer.IDLE_AFTER_DONE_MS);
assert.equal(snapIdle.status, 'idle');
assert.equal(snapIdle.lastEvent, 'Stop');

assert.ok(vendor.indexOf('map_thstatus_color_to_state') >= 0);
assert.ok(vendor.indexOf('extract_json_array_field(json, "params")') >= 0);

var relayLib = require('./codex-micro-relay-lib');
var native = {
  id: 42,
  method: 'v.oai.thstatus',
  params: [{ id: 0, c: 3166206, b: 1, e: 4, s: 0.4 }]
};
var norm = relayLib.normalizeCodexRpc(native);
assert.strictEqual(norm.m, 'v.oai.thstatus');
assert.strictEqual(norm.p.slots[0].i, 0);
assert.strictEqual(norm.p.slots[0].s, 'running');
assert.strictEqual(relayLib.mapThstatusColorToState(3166206), 'running');
assert.strictEqual(relayLib.mapThstatusColorToState(16739584), 'needs_input');
var relayArgs = relayLib.parseArgs(['node', 'relay.js', '--file', 'x.jsonl', '--url', 'http://127.0.0.1:8796/a']);
assert.strictEqual(relayArgs.file, 'x.jsonl');
assert.strictEqual(relayArgs.url, 'http://127.0.0.1:8796/a');

var relay = fs.readFileSync(
  path.join(__dirname, 'codex-micro-agentcontroller-relay.js'),
  'utf8'
);
assert.ok(relay.indexOf('normalizeCodexRpc') >= 0);
var relayLibSrc = fs.readFileSync(
  path.join(__dirname, 'codex-micro-relay-lib.js'),
  'utf8'
);
assert.ok(relayLibSrc.indexOf('--file') >= 0);
assert.ok(relay.indexOf('[relay] POST') >= 0);

var relayExample = fs.readFileSync(
  path.join(__dirname, 'codex-micro-agentcontroller-relay.example.js'),
  'utf8'
);
assert.ok(relayExample.indexOf('codex-micro-agentcontroller-relay.js') >= 0);

console.log('codex-micro-rpc.test.js ok');
