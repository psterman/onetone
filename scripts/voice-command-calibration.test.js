#!/usr/bin/env node
'use strict';

var assert=require('assert');

require('../src/js/features/voice/voice-command-calibration.js');
require('../src/js/features/voice/voice-command-matcher.js');

var C=global.OneToneVoiceCommandCalibration;
var M=global.OneToneVoiceCommandMatcher;

assert.strictEqual(C.normalizeTranscript('  微信输入！ '), '微信输入');
assert.ok(C.phraseSimilarity('微信输入','微信输入')===1);
assert.ok(C.phraseSimilarity('微信输入','微信 输入')>0.9);
assert.ok(C.phraseSimilarity('微信输入','打开邮箱')<0.5);

var samples=[
  {transcript:'微信输入',confidence:null,source:'vosk',createdAt:1},
  {transcript:'微信输入',confidence:null,source:'vosk',createdAt:2}
];
var scored=C.scoreSamples(samples);
assert.strictEqual(scored.quality,'good');
assert.ok(scored.agreement>=0.88);

var built=C.buildCommandFromSamples(samples,[],{scenarioId:'sc1'});
assert.strictEqual(built.ok,true);
assert.strictEqual(built.command.canonicalPhrase,'微信输入');
assert.strictEqual(built.command.threshold,0.80);
assert.strictEqual(built.command.margin,0.06);
assert.strictEqual(built.command.samples.length,2);

var other={
  id:'cmd_other',
  scenarioId:'sc2',
  canonicalPhrase:'微信输入模式',
  aliases:[],
  enabled:true
};
var conflict=C.detectCommandConflict(
  {canonicalPhrase:'微信输入'},
  [other],
  {currentScenarioId:'sc1',config:{mappings:[{id:'sc2',group:'微信场景'}]}}
);
assert.ok(conflict);

var selfConflict=C.detectCommandConflict(
  {canonicalPhrase:'微信输入'},
  [{id:'cmd_old',scenarioId:'sc1',canonicalPhrase:'微信输入',enabled:true}],
  {currentScenarioId:'sc1',currentCommandId:'cmd_old'}
);
assert.strictEqual(selfConflict,null);

var blocked=C.buildCommandFromSamples(samples,[other],{
  scenarioId:'sc1',
  config:{mappings:[{id:'sc2',group:'微信场景'}]}
});
assert.strictEqual(blocked.ok,false);
assert.strictEqual(blocked.reason,'conflict');
assert.strictEqual(blocked.messageKey,'habitVoiceCmdConflict');

var unstable=C.buildCommandFromSamples([
  {transcript:'微信输入',source:'vosk'},
  {transcript:'打开邮箱',source:'vosk'}
],[],{scenarioId:'sc1'});
assert.strictEqual(unstable.ok,false);
assert.ok(unstable.reason==='unstable'||unstable.reason==='weak');

var short=C.buildCommandFromSamples([{transcript:'微',source:'vosk'}],[],{scenarioId:'sc1'});
assert.strictEqual(short.ok,false);
assert.strictEqual(short.messageKey,'habitVoiceCmdTooShort');

M.suspend(true);
assert.strictEqual(M.isSuspended(),true);
assert.strictEqual(M.onFinalTranscript('微信输入',{commands:[built.command]}),null);
M.suspend(false);

var cfg={
  mappings:[{
    id:'sc1',
    appTargetId:'wechat',
    voiceCommands:[built.command]
  }]
};
var hit=M.matchVoiceCommand('微信输入',{config:cfg});
assert.ok(hit);
assert.strictEqual(hit.scenarioId,'sc1');

var activated=false;
global.OneToneSceneActivate={
  isActiveScene:function(){ return false; },
  activateScene:function(id){ activated=id; }
};
M.resetCooldownForTests();
var r1=M.onFinalTranscript('微信输入',{config:cfg});
assert.ok(r1&&r1.triggered);
assert.strictEqual(activated,'sc1');
var r2=M.onFinalTranscript('微信输入',{config:cfg});
assert.ok(r2);
assert.strictEqual(r2.triggered,false);

var fgOnly=Object.assign({},built.command,{
  id:'cmd_fg',
  activationScope:'foreground-app',
  appTargetId:'wechat'
});
assert.strictEqual(M.matchVoiceCommand('微信输入',{commands:[fgOnly],foregroundAppId:''}),null);
assert.ok(M.matchVoiceCommand('微信输入',{commands:[fgOnly],foregroundAppId:'wechat'}));

console.log('voice-command-calibration.test.js: ok');
