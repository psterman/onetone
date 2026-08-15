'use strict';
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var root = path.resolve(__dirname, '..');
var css = fs.readFileSync(path.join(root, 'src/css/app.css'), 'utf8');
var html = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8');
var js = fs.readFileSync(path.join(root, 'src/js/features/voice/voice-wake.js'), 'utf8');

var block = css.match(/\.voice-setup-overlay\s*\{[^}]+\}/);
assert.ok(block, 'voice-setup-overlay rule');
assert.ok(/inset:\s*auto\s+16px\s+16px\s+auto/.test(block[0]), 'bottom-right corner tip');
assert.ok(/pointer-events:\s*none/.test(block[0]), 'host does not block clicks');
assert.ok(!/inset:\s*0/.test(block[0]), 'must not be full-screen modal');
assert.ok(/background:\s*transparent/.test(block[0]), 'no dimming veil');

assert.ok(html.includes('id="voiceSetupOverlay"'));
assert.ok(html.includes('role="status"'), 'non-modal status tip');
assert.ok(!/id="voiceSetupOverlay"[^>]*aria-modal="true"/.test(html), 'no aria-modal blocker');

assert.ok(js.includes("setAttribute('role','status')"));
assert.ok(js.includes("removeAttribute('aria-modal')"));
assert.ok(!js.includes("setAttribute('aria-modal','true')"));

console.log('ok: voice setup corner tip');
