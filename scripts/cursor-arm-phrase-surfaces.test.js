/**
 * Cursor arm phrase on home howto + habit hub — smoke markers.
 * Run: node scripts/cursor-arm-phrase-surfaces.test.js
 */
'use strict';
var fs = require('fs');
var path = require('path');
var assert = require('assert');
var root = path.join(__dirname, '..');

var panels = fs.readFileSync(path.join(root, 'src/js/features/home/home-workbench-panels.js'), 'utf8');
var hero = fs.readFileSync(path.join(root, 'src/js/features/home/home-hero-mode-model.js'), 'utf8');
var hub = fs.readFileSync(path.join(root, 'src/js/features/mapping/habit-hub.js'), 'utf8');
var bridge = fs.readFileSync(path.join(root, 'src/js/features/home/home-v9-bridge.js'), 'utf8');
var i18n = fs.readFileSync(path.join(root, 'src/js/core/i18n.js'), 'utf8');
var css = fs.readFileSync(path.join(root, 'src/css/app.css'), 'utf8');

assert.ok(panels.indexOf('cursorArmPhrase') >= 0, 'panels collect cursorArmPhrase');
assert.ok(panels.indexOf('cursorBeginnerArmPhrase') >= 0, 'panels read config');
assert.ok(hero.indexOf('homeCursorArmMetaLbl') >= 0, 'hero voice line');
assert.ok(hero.indexOf('voiceLines.unshift') >= 0, 'arm line preferred on active card');
assert.ok(hub.indexOf('habit-hub-card-arm') >= 0, 'hub arm badge');
assert.ok(hub.indexOf('isCursorHabitMapping') >= 0, 'hub cursor gate');
assert.ok(hub.indexOf('primaryActivationPhrase') >= 0, 'wake badge kept');
assert.ok(bridge.indexOf('habitHubCursorArm') >= 0, 'home habit card desc');
assert.ok(i18n.indexOf('habitHubCursorArm') >= 0 && i18n.indexOf('homeCursorArmMetaLbl') >= 0, 'i18n');
assert.ok(css.indexOf('.habit-hub-card-arm') >= 0, 'css');

console.log('cursor-arm-phrase-surfaces.test.js: ok');
