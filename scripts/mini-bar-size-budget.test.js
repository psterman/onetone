'use strict';
/** Self-check: mini overlay size budget stays ahead of CSS content. */
var assert = require('assert');
var fs = require('fs');
var path = require('path');

var root = path.resolve(__dirname, '..');
var rs = fs.readFileSync(path.join(root, 'src-tauri/src/codex_micro_overlay.rs'), 'utf8');
var css = fs.readFileSync(path.join(root, 'src/css/codex-micro-overlay.css'), 'utf8');
var onboard = fs.readFileSync(path.join(root, 'src/js/cursor-beginner-onboard.js'), 'utf8');
var hub = fs.readFileSync(path.join(root, 'src/css/soft-pad-hub.css'), 'utf8');

function constF64(name) {
  var m = rs.match(new RegExp('const ' + name + ': f64 = ([0-9.]+);'));
  assert.ok(m, 'missing ' + name);
  return Number(m[1]);
}

var w = constF64('OVERLAY_WIDTH_MINI');
var h0 = constF64('OVERLAY_HEIGHT_MINI');
var hT = constF64('OVERLAY_HEIGHT_MINI_TOOLS');
var hL = constF64('OVERLAY_HEIGHT_MINI_LISTEN');
var hTL = constF64('OVERLAY_HEIGHT_MINI_TOOLS_LISTEN');

assert.strictEqual(w, 400);
assert.ok(h0 >= 48, 'bare mini too short');
assert.ok(hT >= h0 + 40, 'tools row budget');
assert.ok(hL >= h0 + 56, 'listen band budget');
assert.ok(hTL >= hT + 56, 'tools+listen budget');
assert.ok(hTL > hT && hTL > hL);

assert.ok(rs.includes('cursor_probe_ok'));
assert.ok(css.includes('white-space: normal'));
assert.ok(css.includes('overflow-wrap: anywhere'));
assert.ok(/\.overlay-mini-listen__text \{[\s\S]*?text-overflow:\s*unset/.test(css));
assert.ok(onboard.includes('overlayMiniStack'));
assert.ok(onboard.includes('cursor_beginner_armed'));
assert.ok(hub.includes('max-width: 400px'));
assert.ok(hub.includes('width: 28px'));

console.log('ok mini-bar-size-budget', { w: w, h0: h0, hT: hT, hL: hL, hTL: hTL });
