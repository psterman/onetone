'use strict';
var fs = require('fs');
var assert = require('assert');
var path = require('path');
var root = path.join(__dirname, '..');
var ui = fs.readFileSync(path.join(root, 'src/js/features/agent/codex-micro-pad-ui.js'), 'utf8');
var css = fs.readFileSync(path.join(root, 'src/css/soft-pad-hub.css'), 'utf8');
var i18n = fs.readFileSync(path.join(root, 'src/js/core/i18n.js'), 'utf8');

assert.ok(ui.indexOf('data-cursor-arm-card') >= 0, 'arm card marker');
assert.ok(ui.indexOf('softPadCursorArmSectionLbl') >= 0, 'section label');
assert.ok(ui.indexOf('soft-pad-runtime-arm__input') >= 0, 'styled input');
assert.ok(/<\/div>' \+\s*\n\s*armRow/.test(ui), 'armRow sibling after show block');
assert.ok(css.indexOf('.soft-pad-runtime-arm__input:focus') >= 0, 'focus style');
assert.ok(i18n.indexOf('与语音页全局唤醒词无关') >= 0, 'zh hint');
assert.ok(i18n.indexOf('Not the global wake phrases') >= 0, 'en hint');
console.log('soft-pad-cursor-arm-card.test.js: ok');
