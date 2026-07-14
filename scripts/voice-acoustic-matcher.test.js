#!/usr/bin/env node
'use strict';

var assert=require('assert');

require('../src/js/features/voice/voice-acoustic-matcher.js');

var M=global.OneToneVoiceAcousticMatcher;

M.resetCooldownForTests();

var cfg={
  mappings:[{
    id:'sc1',
    appTargetId:'wechat',
    acousticVoiceCommands:[{
      id:'acmd_1',
      scenarioId:'sc1',
      enabled:true,
      quality:'good',
      samples:[{id:'s1'}]
    }]
  }]
};

var cmds=M.collectAcousticCommands(cfg);
assert.strictEqual(cmds.length,1);
assert.strictEqual(cmds[0].scenarioId,'sc1');
assert.strictEqual(cmds[0].appTargetId,'wechat');

var activated=0;
global.OneToneSceneActivate={
  isActiveScene:function(){ return false; },
  activateScene:function(id){
    activated+=1;
    assert.strictEqual(id,'sc1');
  }
};

assert.strictEqual(M.triggerMatch({scenarioId:'sc1',commandId:'acmd_1'}),true);
assert.strictEqual(activated,1);
assert.strictEqual(M.triggerMatch({scenarioId:'sc1',commandId:'acmd_1'}),false);

M.resetCooldownForTests();
var ev={
  kind:'acoustic_voice_matched',
  payload:{scenarioId:'sc1',commandId:'acmd_1',score:0.91}
};
var res=M.onRuntimeEvent(ev);
assert.ok(res&&res.triggered);

assert.strictEqual(M.onRuntimeEvent({kind:'voice_wake_triggered'}),null);

console.log('voice-acoustic-matcher.test.js: ok');
