/**
 * SoftPad Panel A (方案 A 次行) — copy + light plate + cancel chord contract.
 * Run: node scripts/softpad-panel-a.test.js
 */
'use strict';

var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

var html = read('src/codex-micro-overlay.html');
var css = read('src/css/codex-micro-overlay.css');
var beginner = read('src-tauri/src/cursor_beginner.rs');

var fails = [];
function ok(cond, msg) {
  if (!cond) fails.push(msg);
}

ok(html.indexOf('miniBeginnerListenFlow') >= 0, 'overlay has flow hint element');
ok(html.indexOf('发送→右侧框+Enter') >= 0 || beginner.indexOf('FLOW_HINT') >= 0, 'flow hint copy present');
ok(html.indexOf('cursorBeginnerFlowHint') >= 0, 'FE reads cursorBeginnerFlowHint');
ok(css.indexOf('isolation: isolate') >= 0, 'listen banner isolates from pad light');
ok(css.indexOf('html[data-theme="dark"] .overlay-mini-listen') >= 0, 'dark theme keeps light plate');
ok(css.indexOf('background: rgba(255, 255, 255, 0.96) !important') >= 0, 'forced light background');
ok(beginner.indexOf('CANCEL_GENERATION_CHORD') >= 0, 'cancel chord constant');
ok(beginner.indexOf('Ctrl+Shift+Backspace') >= 0, 'cancel uses Ctrl+Shift+Backspace');
ok(beginner.indexOf('FLOW_HINT') >= 0, 'FLOW_HINT in rust');

if (fails.length) {
  console.error('FAIL softpad-panel-a:\n - ' + fails.join('\n - '));
  process.exit(1);
}
console.log('ok softpad-panel-a (' + (8 - fails.length) + ' checks)');
