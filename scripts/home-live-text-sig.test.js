'use strict';

/** Guard: home live text must bust workbench sig; vosk_text must update OneToneVoiceUiState. */
var assert = require('assert');
var fs = require('fs');
var path = require('path');

var root = path.resolve(__dirname, '..');
var model = fs.readFileSync(path.join(root, 'src/js/features/home/home-workbench-model.js'), 'utf8');
var bus = fs.readFileSync(path.join(root, 'src/js/core/webview-bus.js'), 'utf8');
var persist = fs.readFileSync(path.join(root, 'src/js/core/config-persist.js'), 'utf8');
var bridge = fs.readFileSync(path.join(root, 'src/js/features/home/home-v9-bridge.js'), 'utf8');
var wake = fs.readFileSync(path.join(root, 'src/js/features/voice/voice-wake.js'), 'utf8');
var session = fs.readFileSync(path.join(root, 'src/js/core/app-session.js'), 'utf8');
var drawer = fs.readFileSync(path.join(root, 'src/js/features/settings/settings-drawer.js'), 'utf8');
var wb = fs.readFileSync(path.join(root, 'src/js/features/home/home-workbench.js'), 'utf8');
var panels = fs.readFileSync(path.join(root, 'src/js/features/home/home-workbench-panels.js'), 'utf8');
var soft = fs.readFileSync(path.join(root, 'src/js/features/agent/soft-pad-hub-ui.js'), 'utf8');
var index = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8');

assert.ok(model.includes('raw.live && raw.live.finalized'), 'model.sig must include live.finalized');
assert.ok(model.includes('raw.live && raw.live.pending'), 'model.sig must include live.pending');
assert.ok(model.includes('raw.live.placeholder'), 'model.sig must include live.placeholder');
assert.ok(model.includes('raw.live.hintKey'), 'model.sig must include live.hintKey');

assert.ok(bus.includes("msg.type==='vosk_text'"), 'webview-bus must handle vosk_text');
assert.ok(
  bus.includes('OneToneVoiceUiState') && bus.includes('snapshot'),
  'vosk_text must read OneToneVoiceUiState.snapshot'
);
assert.ok(
  !/vosk_text[\s\S]*hooks\(\)\.voiceUiSnapshot/.test(bus),
  'vosk_text must not use hooks().voiceUiSnapshot'
);

assert.ok(
  /mvp_scheme_switched[\s\S]*hooks\.showSchemeSwitchFeedback/.test(bus),
  'mvp_scheme_switched must call hooks.showSchemeSwitchFeedback'
);
assert.ok(
  !/mvp_scheme_switched[\s\S]*hooks\(\)\.showSchemeSwitchFeedback/.test(bus),
  'mvp_scheme_switched must not call hooks() as function'
);
assert.ok(
  /mvp_scheme_select_blocked[\s\S]*t\('schemeSelectBlocked/.test(bus),
  'scheme_select_blocked must use hooks.t via local t()'
);

assert.ok(
  persist.includes('applySchemeSwitchedRuntime') && persist.includes('forceHomeRender'),
  'applySchemeSwitchedRuntime must force home refresh after habit switch'
);

assert.ok(
  /homeWbLiveVoskStoppedHint/.test(bridge),
  'liveTextParts must surface vosk stopped hint'
);
assert.ok(
  drawer.includes("panel==='voiceWake'")&&drawer.includes('parkVoice'),
  'settings drawer must park voice only on voiceWake, not debug'
);
assert.ok(
  drawer.includes('ensureHomeVoiceEngine'),
  'closeDrawer must unpark voice engine on home return'
);

assert.ok(
  /ensureHomeVoiceEngine/.test(wake),
  'voice-wake must expose ensureHomeVoiceEngine for drawer unpark'
);
assert.ok(
  /activate_desired_engine is async/.test(session)||/IPC return only means enqueued/.test(session),
  'deferred boot must not require sync desired===active'
);
assert.ok(
  /ensureHomeVoiceEngineIfMismatch/.test(wake),
  'voice-wake must heal supervisor mismatch on home'
);
assert.ok(
  /ensureHomeVoiceEngineIfMismatch/.test(wb),
  'home workbench render must call ensureHomeVoiceEngineIfMismatch'
);
assert.ok(
  /function voiceEngineMismatch/.test(wake),
  'voice-wake must define voiceEngineMismatch helper'
);
assert.ok(
  panels.includes('activeHabitMapping(vm)')&&panels.includes('projectActive'),
  'wakePhrases must scope to active habit, not all mappings'
);
assert.ok(
  !/cfg\.mappings\.forEach\(function\(map\)[\s\S]*acousticVoiceCommands/.test(panels),
  'wakePhrases must not scan all mappings acousticVoiceCommands'
);

assert.ok(model.includes('raw.live.matched'), 'model.sig must include live.matched');
assert.ok(model.includes('raw.live.miss'), 'model.sig must include live.miss');

assert.ok(bridge.includes('micHeardLiveParts'), 'home mic heard must read vosk snapshot directly');
assert.ok(!/paintMicHeardSurface\(vm\.live\)/.test(wb), 'render must not pass placeholder vm.live to mic heard');
assert.ok(index.includes('wbHeroMicHeard'), 'home mic strip must host live heard text');
assert.ok(!index.includes('homeWbLiveIdleHint'), 'home must not show idle placeholder caption');
assert.ok(bridge.includes('liveMatchMeta'), 'home must compute wake match metadata');
assert.ok(bridge.includes('syncVoiceHeardSurfaces'), 'home bridge must sync heard to softpad');
assert.ok(bus.includes('patchVoskLive'), 'vosk_text must patch voice ui cache');
assert.ok(bus.includes('paintHomeLiveTextImmediate'), 'vosk_text must paint home live text immediately');

assert.ok(
  soft.includes('__otVoiceHeardSurface')&&soft.includes('updateScopeHint'),
  'softpad hint must show live heard text'
);

var usage=fs.readFileSync(path.join(root,'src/js/core/app-process-usage.js'),'utf8');
assert.ok(usage.includes('(value/1024)'), 'process memory GB must divide MB by 1024');

var wake=fs.readFileSync(path.join(root,'src/js/features/voice/voice-wake.js'),'utf8');
assert.ok(wake.includes('applyStatusFromPoll'), 'voice poll must merge vosk live via applyStatusFromPoll');
assert.ok(wake.includes('scheduleVoiceUiRender(pollPayload)'), 'voice poll must pass payload to home render');

console.log('All home-live-text-sig tests passed.');
