/**
 * Soft Pad「改按钮」quiet restore defaults entry.
 * Run: node scripts/soft-pad-restore-quiet.test.js
 */
'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

var html = fs.readFileSync(path.join(__dirname, '../src/index.html'), 'utf8');
var pad = fs.readFileSync(
  path.join(__dirname, '../src/js/features/agent/codex-micro-pad-ui.js'),
  'utf8'
);
var hub = fs.readFileSync(
  path.join(__dirname, '../src/js/features/agent/soft-pad-hub-ui.js'),
  'utf8'
);
var css = fs.readFileSync(path.join(__dirname, '../src/css/soft-pad-hub.css'), 'utf8');
var i18n = fs.readFileSync(path.join(__dirname, '../src/js/core/i18n.js'), 'utf8');

assert.ok(html.indexOf('id="btnSoftPadRestoreDefaults"') >= 0, 'quiet restore button in Soft Pad mid');
assert.ok(html.indexOf('soft-pad-mid-pad__restore') >= 0, 'quiet restore class');
assert.ok(css.indexOf('.soft-pad-mid-pad__restore') >= 0, 'quiet restore styles');
assert.ok(i18n.indexOf("softPadLayoutRestoreQuiet:") >= 0, 'zh/en restore quiet copy');
assert.ok(pad.indexOf('function confirmRestoreSoftPadLayout') >= 0, 'confirmRestoreSoftPadLayout');
assert.ok(
  /confirmRestoreSoftPadLayout[\s\S]*restoreDefaultCustomLayout\s*\(\s*m\s*\)/.test(pad),
  'reuses restoreDefaultCustomLayout'
);
assert.ok(
  pad.indexOf('confirmRestoreSoftPadLayout: confirmRestoreSoftPadLayout') >= 0,
  'exported on OneToneCodexMicroPadUi'
);
assert.ok(hub.indexOf('btnSoftPadRestoreDefaults') >= 0, 'hub binds quiet restore');

console.log('soft-pad-restore-quiet.test.js: ok');
