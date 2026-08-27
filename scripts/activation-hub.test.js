'use strict';

/**
 * SoftPad Hub 方案 A — 最小自检：开窗/关窗、门闩语义、迷你栏结构不抢 Agent。
 */
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var root = path.resolve(__dirname, '..');
var hubSrc = fs.readFileSync(
  path.join(root, 'src/js/features/activation/activation-hub.js'),
  'utf8'
);
var html = fs.readFileSync(path.join(root, 'src/codex-micro-overlay.html'), 'utf8');
var css = fs.readFileSync(path.join(root, 'src/css/codex-micro-overlay.css'), 'utf8');
var cam = fs.readFileSync(
  path.join(root, 'src/js/features/camera/camera-presence-actions.js'),
  'utf8'
);
var rust = fs.readFileSync(path.join(root, 'src-tauri/src/codex_micro_overlay.rs'), 'utf8');
var guide = fs.readFileSync(path.join(root, 'docs/soft-pad-mini-ui-guidelines.md'), 'utf8');

var sandbox = { console: console, setInterval: setInterval, clearInterval: clearInterval, setTimeout: setTimeout, clearTimeout: clearTimeout };
vm.createContext(sandbox);
vm.runInContext(hubSrc, sandbox);
var Hub = sandbox.OneToneActivationHub;
assert.ok(Hub, 'OneToneActivationHub exported');

var seen = [];
Hub.on('activation:on', function () { seen.push('on'); });
Hub.on('activation:off', function (p) { seen.push('off:' + (p && p.reason)); });

assert.strictEqual(Hub.isActive(), false);
Hub.onRuntimeEvent({ source: 'session', kind: 'session_started', message: 'ptt' });
assert.strictEqual(Hub.isActive(), true);
assert.ok(seen.indexOf('on') >= 0, 'activation:on fired');
assert.strictEqual(Hub.getPhase(), 'listen');

Hub.setPhase('watch');
assert.strictEqual(Hub.getPhase(), 'watch');

Hub.onRuntimeEvent({ source: 'session', kind: 'session_ended', message: 'cancel' });
assert.strictEqual(Hub.isActive(), false);
assert.ok(seen.some(function (x) { return String(x).indexOf('off:') === 0; }), 'activation:off fired');

// Structure: scheme A merged into listen band
assert.ok(html.includes('id="miniBeginnerListenBanner"'), 'shared listen/hub band');
assert.ok(html.includes('data-act="hub-cancel"'), 'hub cancel on listen band');
assert.ok(html.includes('function applyHubMini'), 'applyHubMini');
assert.ok(html.includes('activation-hub.js'), 'hub script in overlay');
assert.ok(!html.includes('id="miniHubBar"'), 'no separate hub bar');
assert.ok(css.includes('is-hub-active'), 'hub active class');
assert.ok(css.includes('overlay-mini-listen__cancel'), 'cancel on listen band');

// Camera gate
assert.ok(cam.includes('requireActivationHub'), 'prefs gate');
assert.ok(cam.includes('hub_inactive'), 'gate fail reason');
assert.ok(cam.includes('OneToneActivationHub'), 'reads hub');

// Rust snapshot + geometry
assert.ok(rust.includes('activation_hub_active'), 'snapshot field');
assert.ok(rust.includes('apply_activation_hub'), 'apply helper');
assert.ok(
  /activation_hub_active[\s\S]*listen_band|listen_band[\s\S]*activation_hub_active/.test(rust),
  'listen_band includes hub'
);

// Guidelines: Hub 次行 ≠ Agent 灯
assert.ok(guide.includes('Hub') || guide.includes('激活窗') || guide.includes('次行'), 'guidelines mention hub row');

console.log('activation-hub.test.js: ok');
