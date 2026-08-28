#!/usr/bin/env node
'use strict';

var assert = require('assert');

global.OneToneI18n = {
  t: function (key) {
    if (key === 'voiceSurfaceKeyLine') return '按 {key} 说话';
    if (key === 'voiceSurfaceWakeLine') return '说「{wake}」开始';
    if (key === 'voiceSurfaceDictatingLine') return '正在输入… 说「{end}」结束';
    return key;
  },
};

global.OneToneState = {
  state: {
    config: {
      voiceAssistEnabled: true,
      voiceWakeListeningOptIn: false,
      voiceListeningStrategy: 'off',
      activeSceneId: 'm1',
      mappings: [{ id: 'm1', enabled: true, triggerKey: 'F8' }],
    },
  },
  runtime: { paused: false },
};

global.OneToneHomeLive = {
  voiceWakePhrase: function () { return '开始输入'; },
  voiceEndPhrases: function () { return ['结束']; },
};

require('../src/js/shared/voice-surface-copy.js');

var C = global.OneToneVoiceSurfaceCopy;

var key = C.resolve();
assert.strictEqual(key.phase, 'key');
assert.strictEqual(key.switchOn, true);
assert.ok(key.line1.indexOf('F8') >= 0);

global.OneToneState.state.config.voiceAssistEnabled = false;
var off = C.resolve();
assert.strictEqual(off.phase, 'off');
assert.strictEqual(off.switchOn, false);

global.OneToneState.state.config.voiceAssistEnabled = true;
global.OneToneState.state.config.voiceWakeListeningOptIn = true;
global.OneToneState.state.config.voiceListeningStrategy = 'resourceSaver';
var wake = C.resolve();
assert.strictEqual(wake.phase, 'wake');
assert.ok(wake.line1.indexOf('开始输入') >= 0);

var dict = C.resolve({ dictating: true });
assert.strictEqual(dict.phase, 'dictating');
assert.strictEqual(dict.switchDisabled, true);

console.log('voice-surface-copy.test.js ok');
