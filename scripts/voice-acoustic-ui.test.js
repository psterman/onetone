#!/usr/bin/env node
'use strict';

var assert=require('assert');

global.OneToneDom={ $:function(){ return null; } };
global.OneToneI18n={
  t:function(key,vars){
    var map={
      habitAcousticCmdLearned:'已学会一条语音命令',
      habitAcousticCmdSuggestRerecord:'建议重录',
      habitAcousticCmdPaused:'已暂停',
      habitAcousticCmdTitle:'语音命令',
      habitAcousticCmdAuxLabel:'辅助识别：{text}',
      habitAcousticCmdNoLabelHint:'尚未命名，点击「编辑名称」方便以后查看。'
    };
    var s=map[key]||key;
    if(!vars) return s;
    return String(s).replace(/\{(\w+)\}/g,function(_,k){
      return vars[k]!=null?String(vars[k]):'';
    });
  }
};
global.OneToneState={ state:{ config:{} }, ui:function(){ return {}; } };
global.OneToneMappingCore={ byId:function(){ return null; } };
global.OneToneHabitOverrideDiff={ isAppScenarioMapping:function(){ return true; } };
global.OneToneVoiceAcousticIpc={ isAvailable:function(){ return true; } };

require('../src/js/features/mapping/habit-scenario-voice-command.js');

var H=global.OneToneHabitScenarioVoiceCommand;

var namedChip=H.hubChipHtml({
  id:'sc1',
  acousticVoiceCommands:[{
    id:'acmd_1',
    enabled:true,
    quality:'good',
    displayText:'打开微信',
    samples:[{}]
  }]
});
assert.ok(namedChip.indexOf('>打开微信<')>=0,'named chip should show displayText');

var goodChip=H.hubChipHtml({
  id:'sc1',
  acousticVoiceCommands:[{
    id:'acmd_1',
    enabled:true,
    quality:'good',
    displayText:'',
    samples:[{}]
  }]
});
assert.ok(goodChip.indexOf('>已学会一条语音命令<')>=0);

var pausedChip=H.hubChipHtml({
  id:'sc1',
  acousticVoiceCommands:[{id:'acmd_1',enabled:false,quality:'good',samples:[{}]}]
});
assert.ok(pausedChip.indexOf('已暂停')>=0);

assert.strictEqual(H.hubChipHtml({id:'sc1',acousticVoiceCommands:[]}),'');

console.log('voice-acoustic-ui.test.js: ok');
