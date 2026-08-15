#!/usr/bin/env node
'use strict';

var assert = require('assert');

global.document = {
  readyState: 'loading',
  getElementById: function () { return null; },
  querySelector: function () { return null; },
  querySelectorAll: function () { return []; },
  createElement: function () {
    return { setAttribute: function () {}, appendChild: function () {}, addEventListener: function () {}, innerHTML: '' };
  },
  addEventListener: function () {},
  body: { appendChild: function () {}, classList: { add: function () {}, remove: function () {} } }
};
global.window = global;
global.localStorage = {
  _d: {},
  getItem: function (k) { return this._d[k] || null; },
  setItem: function (k, v) { this._d[k] = String(v); }
};

global.OneToneCameraPresenceActions = {
  normalizeAction: function (t) {
    var s = String(t || 'none');
    if (s === 'none') return 'none';
    return s;
  },
  allowedActionsForBindKey: function (key) {
    if (key === 'onAway') return ['none', 'privacyScreen', 'pauseVoice', 'lowPowerMode'];
    return ['none', 'pressEsc', 'pressCtrlI', 'privacyScreen'];
  },
  actionLabel: function (t) { return String(t); }
};
global.OneToneAgentActions = {
  agentActionToken: function (id) { return 'agent:' + id; },
  cameraRecommendedActionIds: function () { return ['status']; }
};
global.OneToneSemanticActionStore = {
  catalog: function () {
    return {
      entries: [
        { id: 'input.start', implemented: true, channels: ['camera'], category: 'input', labelZh: '开始输入' },
        { id: 'input.cancel', implemented: true, channels: ['camera'], category: 'input', labelZh: '取消' },
        { id: 'status', implemented: true, channels: ['camera'], category: 'general', labelZh: '状态' }
      ]
    };
  },
  entryMeta: function (id) {
    var cat = this.catalog().entries;
    for (var i = 0; i < cat.length; i++) if (cat[i].id === id) return cat[i];
    return null;
  }
};
global.OneToneState = { state: { config: { mappings: [] } } };

require('../src/js/features/camera/camera-action-picker.js');

var Picker = global.OneToneCameraActionPicker;
assert.ok(Picker, 'exports picker');
assert.equal(Picker.defaultSceneForBindKey('onAway'), 'general');
assert.equal(Picker.defaultSceneForBindKey('deliberateBlink'), 'begin');
assert.equal(Picker.defaultSceneForBindKey('shakeHead'), 'end');

var options = [
  { actionId: 'input.start', bindable: true },
  { actionId: 'input.cancel', bindable: true },
  { actionId: 'status', bindable: true },
  { actionId: 'agent.interrupt', bindable: false }
];

var general = Picker.buildCameraActionPickerModel({
  bindKey: 'onAway',
  mappingId: 'cursor',
  sceneTab: 'general',
  query: '',
  currentToken: 'none',
  views: [{ actionId: 'status', channel: 'key', trigger: 'F2', mappingId: 'cursor' }],
  options: options,
  showAll: true
});
var generalToks = general.candidates.map(function (r) { return r.token; });
assert.ok(generalToks.indexOf('pauseVoice') >= 0, 'keeps local away actions');
assert.ok(generalToks.indexOf('agent:status') >= 0, 'includes mapping camera option in general');
assert.ok(generalToks.indexOf('agent:input.start') < 0, 'begin action stays off general tab');
assert.ok(generalToks.indexOf('agent:interrupt') < 0, 'drops unbindable options');
var statusRow = general.candidates.filter(function (r) { return r.token === 'agent:status'; })[0];
assert.ok(statusRow && statusRow.crossHint, 'cross-channel hint from bindingViews');

var begin = Picker.buildCameraActionPickerModel({
  bindKey: 'onAway',
  mappingId: 'cursor',
  sceneTab: 'begin',
  query: '',
  currentToken: 'none',
  views: [],
  options: options,
  showAll: true
});
var beginToks = begin.candidates.map(function (r) { return r.token; });
assert.ok(beginToks.indexOf('agent:input.start') >= 0, 'left-app catalog begin commands appear');

var searched = Picker.buildCameraActionPickerModel({
  bindKey: 'onAway',
  mappingId: 'cursor',
  sceneTab: 'general',
  query: 'start',
  currentToken: 'none',
  views: [],
  options: options
});
var searchToks = searched.candidates.map(function (r) { return r.token; });
assert.ok(searchToks.indexOf('agent:input.start') >= 0, 'search ignores scene and finds catalog');

var byKey = Picker.buildCameraActionPickerModel({
  bindKey: 'onAway',
  mappingId: 'cursor',
  sceneTab: 'general',
  channelTab: 'key',
  query: '',
  currentToken: 'none',
  views: [
    { actionId: 'status', channel: 'key', trigger: 'F2', mappingId: 'cursor', enabled: true },
    { actionId: 'status', channel: 'voice', trigger: '查看状态', mappingId: 'cursor', enabled: false },
    { actionId: 'input.start', channel: 'key', trigger: 'F2', mappingId: 'cursor', enabled: true },
    { actionId: 'input.start', channel: 'voice', trigger: '开始输入', mappingId: 'cursor', enabled: true }
  ],
  options: options,
  showAll: true
});
var keyToks = byKey.candidates.map(function (r) { return r.token; });
assert.ok(keyToks.indexOf('agent:status') >= 0, 'key directory keeps key-bound actions');
assert.ok(keyToks.indexOf('agent:input.start') >= 0, 'key directory ignores scene');
assert.ok(keyToks.indexOf('pauseVoice') < 0, 'key directory hides unbound local actions');
assert.equal(byKey.channelCounts.key, 2, 'key count skips aliases and counts unique actions');
assert.equal(byKey.channelCounts.voice, 1, 'disabled voice binding is not counted');

var byVoice = Picker.buildCameraActionPickerModel({
  bindKey: 'onAway',
  mappingId: 'cursor',
  sceneTab: 'general',
  channelTab: 'voice',
  query: '',
  currentToken: 'none',
  views: [
    { actionId: 'status', channel: 'key', trigger: 'F2', mappingId: 'cursor', enabled: true },
    { actionId: 'status', channel: 'voice', trigger: '查看状态', mappingId: 'cursor', enabled: false },
    { actionId: 'input.start', channel: 'key', trigger: 'F2', mappingId: 'cursor', enabled: true },
    { actionId: 'input.start', channel: 'voice', trigger: '开始输入', mappingId: 'cursor', enabled: true }
  ],
  options: options,
  showAll: true
});
var voiceToks = byVoice.candidates.map(function (r) { return r.token; });
assert.ok(voiceToks.indexOf('agent:input.start') >= 0, 'voice directory keeps enabled voice actions');
assert.ok(voiceToks.indexOf('agent:status') < 0, 'voice directory hides disabled voice bindings');
var startRow = byVoice.candidates.filter(function (r) { return r.token === 'agent:input.start'; })[0];
assert.ok(startRow && startRow.crossHint.indexOf('开始输入') >= 0, 'voice tab shows voice trigger only');
assert.ok(startRow.crossHint.indexOf('F2') < 0, 'voice tab hides key trigger');

console.log('camera-action-picker.test.js: ok');
