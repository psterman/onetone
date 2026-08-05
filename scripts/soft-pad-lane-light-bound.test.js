'use strict';

/** Guard: Claude session-lane / status-host lamps must not be greyed by is-route-disabled. */
var assert = require('assert');
var fs = require('fs');
var path = require('path');

var root = path.resolve(__dirname, '..');
var html = fs.readFileSync(path.join(root, 'src/codex-micro-overlay.html'), 'utf8');
var rust = fs.readFileSync(path.join(root, 'src-tauri/src/codex_micro_overlay.rs'), 'utf8');
var tokens = fs.readFileSync(path.join(root, 'src/css/codex-micro-hw-tokens.css'), 'utf8');

assert.ok(
  html.includes("if(keyRole==='agentLane') bound=true"),
  'grid build must force-bound agentLane keys'
);
assert.ok(
  html.includes("!!info.bound||keyRole==='agentLane'") ||
    html.includes("info.bound||keyRole==='agentLane'"),
  'patchGridRunStates must treat agentLane as bound'
);
assert.ok(
  /nav_lane[\s\S]{0,200}status_light_micro_key_id[\s\S]{0,120}micro_key_routable/.test(rust),
  'Rust bound must include nav lanes + status host before chord routable'
);
assert.ok(
  rust.includes('overlay_claude_permission_request_lights_session_lane_ag00'),
  'missing AG00 needs_input regression test'
);
assert.ok(
  tokens.includes('.micro-hw__key--lane[data-run-status="needs_input"]') &&
    tokens.includes('opacity: 1'),
  'CSS must keep lane needs_input visible over is-route-disabled'
);

console.log('soft-pad lane-light bound tests passed');
