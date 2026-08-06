'use strict';

/**
 * Guard: habits hub is a light orchestration hub — channel doors + micro-status,
 * not a second full settings surface with inline keys/voice/camera/softpad editors.
 */
var assert = require('assert');
var fs = require('fs');
var path = require('path');

var root = path.resolve(__dirname, '..');
var hub = fs.readFileSync(path.join(root, 'src/js/features/mapping/habit-hub.js'), 'utf8');
var css = fs.readFileSync(path.join(root, 'src/css/app.css'), 'utf8');

assert.ok(hub.includes('function hubChannelMicroPillsHtml'));
assert.ok(hub.includes('habit-hub-micro-pills'));
assert.ok(hub.includes('data-habit-scenario-keys'));
assert.ok(hub.includes('data-habit-scenario-voice'));
assert.ok(hub.includes('data-habit-scenario-camera'));
assert.ok(hub.includes('data-habit-scenario-softpad'));
assert.ok(hub.includes('data-habit-scenario-use'));
assert.ok(hub.includes('returnToHub:true'));
assert.ok(hub.includes('habitHubEditReturn=true'));
assert.ok(hub.includes('data-habit-global-voice'));
assert.ok(hub.includes('data-habit-global-camera'));

// Fat-hub forbidden: do not mount channel editors inside renderCard / hub list HTML.
var renderCard = hub.match(/function renderCard\([\s\S]*?\n  function /);
assert.ok(renderCard, 'renderCard missing');
assert.ok(!/habitKeyMapCellTrigger|keys-capture|voiceRecognizeSourceGrid|__otMountVoice|cmd_start_record/.test(renderCard[0]));
assert.ok(!/function openEditKeycap|codex-micro-pad__layout/.test(renderCard[0]));
assert.ok(css.includes('.habit-hub-micro-pill'));

console.log('ok habit-hub-light-orchestrator');
