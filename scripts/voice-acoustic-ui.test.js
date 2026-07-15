#!/usr/bin/env node
'use strict';

var assert=require('assert');

global.OneToneDom={ $:function(){ return null; } };
global.OneToneI18n={
  t:function(key,vars){
    var map={
      habitAcousticCmdLearned:'已学会一条语音命令',
      habitAcousticCmdSuggestRerecord:'建议重录',
      habitAcousticCmdSuggestMoreSpecific:'能用，但建议说得更具体一点。',
      habitAcousticCmdPaused:'已暂停',
      habitAcousticCmdTitle:'语音命令',
      habitAcousticCmdAuxLabel:'辅助识别：{text}',
      habitAcousticCmdNoLabelHint:'尚未命名，点击「编辑名称」方便以后查看。',
      habitAcousticCmdPhasePreparing:'正在检查麦克风…',
      habitAcousticCmdPhaseArmed:'准备好后点「开始说」',
      habitAcousticCmdPhaseStartingMic:'正在打开麦克风…',
      habitAcousticCmdPhaseSpeakNow:'现在说，说完点「说完了」',
      habitAcousticCmdPhaseWaiting:'等你开始说',
      habitAcousticCmdPhaseTooQuiet:'声音有点小，靠近一点',
      habitAcousticCmdPhaseGood:'正合适，说完后点「说完了」',
      habitAcousticCmdPhaseTooLong:'有点长了，控制在 {s} 秒内',
      habitAcousticCmdPhaseTooLongSoft:'超过推荐时长了，说完就点「说完了」',
      habitAcousticCmdPhaseProcessing:'正在学习这句口令…',
      habitAcousticCmdPhaseSpeaking:'正在听，请连续说完',
      habitAcousticCmdRecording:'正在录音',
      habitAcousticCmdNeedMore:'再说一遍确认（尽量同样说法）',
      habitAcousticCmdTooShortHint:'绿色区域为理想时长',
      habitAcousticCmdTimeoutHint:'没有检测到有效语音',
      habitAcousticCmdErrHintNoAudio:'靠近麦克风，说清楚一点后再试。',
      habitAcousticCmdErrHintMic:'请检查麦克风',
      habitAcousticCmdErrHintBusy:'请先关掉占用麦克风的应用',
      habitAcousticCmdErrHintGeneric:'请靠近麦克风再录一次',
      habitAcousticCmdNeedRebuild:'录音功能未就绪',
      habitAcousticCmdMatchFailHint:'三次录音差异较大'
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

assert.strictEqual(H.recordPhaseText('preparing'),'正在检查麦克风…');
assert.strictEqual(H.recordPhaseText('armed'),'准备好后点「开始说」');
assert.strictEqual(H.recordPhaseText('startingMic'),'正在打开麦克风…');
assert.strictEqual(H.recordPhaseText('recording',{level:0,speechMs:0}),'现在说，说完点「说完了」');
assert.strictEqual(H.recordPhaseText('recording',{level:0.05,speechMs:200,peak:0.08}),'声音有点小，靠近一点');
assert.ok(H.recordPhaseText('recording',{level:0.4,speechMs:900,peak:0.5}).indexOf('说完了')>=0);
assert.ok(H.recordPhaseText('recording',{level:0.4,speechMs:2500,peak:0.5}).indexOf('说完了')>=0);
assert.strictEqual(H.recordPhaseText('processing'),'正在学习这句口令…');
assert.strictEqual(H.recordPhaseText('readyNext'),'正在录音');

assert.ok(H.recordErrorHint('habitAcousticCmdNoAudio').indexOf('靠近麦克风')>=0);
assert.ok(H.recordErrorHint('habitAcousticCmdTooShort').indexOf('理想时长')>=0);
assert.ok(H.recordErrorHint('habitAcousticCmdNoMic').indexOf('检查麦克风')>=0);

assert.strictEqual(H.recordQualityLabel('good'),'已学会一条语音命令');
assert.strictEqual(H.recordQualityLabel('ok',0.6),'能用，但建议说得更具体一点。');
assert.strictEqual(H.recordQualityLabel('ok',0.8),'建议重录');

var scales=H.levelToBarScales(0.8,8);
assert.strictEqual(scales.length,8);
assert.ok(scales[3]>scales[0],'center bars taller than edges');
assert.ok(scales.every(function(v){ return v>=0.1&&v<=1; }));

var meter=H.durationMeterState(0,900,{minSpeechMs:450,preferSpeechMs:700,maxSpeechMs:2000});
assert.strictEqual(meter.zone,'good');
assert.ok(meter.pct>0&&meter.pct<=100);
var meterLong=H.durationMeterState(0,2500,{minSpeechMs:450,preferSpeechMs:700,maxSpeechMs:2000});
assert.strictEqual(meterLong.zone,'warn');

console.log('voice-acoustic-ui.test.js: ok');
