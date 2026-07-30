#!/usr/bin/env node
'use strict';

var assert=require('assert');

// Minimal DOM so the camera presence module can load without auto-init side effects.
var listeners={};
global.document={
  readyState:'loading',
  getElementById:function(){ return null; },
  querySelector:function(){ return null; },
  querySelectorAll:function(){ return []; },
  createElement:function(){
    return {
      setAttribute:function(){},
      appendChild:function(){},
      classList:{add:function(){},remove:function(){},toggle:function(){}}
    };
  },
  addEventListener:function(type,fn){
    if(!listeners[type]) listeners[type]=[];
    listeners[type].push(fn);
  }
};
global.window=global;
global.performance={now:function(){ return Date.now(); }};
global.OneToneDom={$:function(){ return null; }};
global.OneToneState={state:{config:{cameraPrefs:{presenceActions:{enabled:false}}}},ui:{},runtime:{paused:false}};

require('../src/js/features/camera/camera-presence-actions.js');

var Api=global.OneToneCameraPresenceActions;
assert.ok(Api,'OneToneCameraPresenceActions should export');
assert.equal(typeof Api.allowedActionsForBindKey,'function');
assert.equal(typeof Api.normalizePrefs,'function');
assert.equal(typeof Api.canExecuteCameraAction,'function');
assert.equal(typeof Api.shouldThrottleCameraAction,'function');
assert.equal(typeof Api.actionRiskLevel,'function');
assert.equal(typeof Api.recommendedPresencePrefs,'function');
assert.equal(Api.MID_RISK_DELAY_MS,750);

// Away bind must not offer key-injection actions (runtime requires present).
var away=Api.allowedActionsForBindKey('onAway');
assert.ok(away.indexOf('privacyScreen')>=0,'away allows privacyScreen');
assert.ok(away.indexOf('pauseVoice')>=0,'away allows pauseVoice');
assert.ok(away.indexOf('lowPowerMode')>=0,'away allows lowPowerMode');
assert.ok(away.indexOf('pressEsc')<0,'away blocks pressEsc');
assert.ok(away.indexOf('pressCtrlI')<0,'away blocks pressCtrlI');

var ret=Api.allowedActionsForBindKey('onReturn');
assert.ok(ret.indexOf('resumeVoice')>=0,'return allows resumeVoice');
assert.ok(ret.indexOf('pressEsc')<0,'return blocks pressEsc');

var shake=Api.allowedActionsForBindKey('shakeHead');
assert.ok(shake.indexOf('pressEsc')>=0,'shake allows pressEsc');
assert.ok(shake.indexOf('privacyScreen')>=0,'shake allows privacyScreen');
// Send-class still absent from all bind menus.
assert.ok(shake.indexOf('send')<0&&shake.indexOf('submit')<0,'no send-class actions');

// Legacy prefs without triggers: derive flags from action bindings.
var derived=Api.normalizePrefs({
  enabled:true,
  onAway:'privacyScreen',
  onReturn:'none',
  shakeHead:'pressEsc',
  deliberateBlink:'none'
});
assert.strictEqual(derived.enabled,true);
assert.strictEqual(derived.triggers.away,true);
assert.strictEqual(derived.triggers.shake,true);
assert.strictEqual(derived.triggers.blink,false);
assert.strictEqual(derived.onAway,'privacyScreen');
assert.strictEqual(derived.shakeHead,'pressEsc');

// normalizePrefs duration defaults
var durationNorm=Api.normalizePrefs({awayMs:99999,presentMs:100});
assert.strictEqual(durationNorm.awayMs,30000,'awayMs clamped to max');
assert.strictEqual(durationNorm.presentMs,500,'presentMs clamped to min');
assert.strictEqual(Api.awayThresholdMs({awayMs:5000}),5000);
assert.strictEqual(Api.presentThresholdMs({presentMs:2000}),2000);

var keepTrig=Api.normalizePrefs({
  enabled:true,
  triggers:{away:true,shake:false,blink:true},
  onAway:'none',
  onReturn:'none',
  shakeHead:'none',
  deliberateBlink:'none'
});
assert.strictEqual(keepTrig.triggers.away,true);
assert.strictEqual(keepTrig.triggers.shake,false);
assert.strictEqual(keepTrig.triggers.blink,true);
assert.strictEqual(keepTrig.onAway,'none');

// —— actionRiskLevel ——
assert.strictEqual(Api.actionRiskLevel('privacyScreen'),'low');
assert.strictEqual(Api.actionRiskLevel('pauseVoice'),'low');
assert.strictEqual(Api.actionRiskLevel('lowPowerMode'),'low');
assert.strictEqual(Api.actionRiskLevel('pressEsc'),'mid');
assert.strictEqual(Api.actionRiskLevel('pressCtrlI'),'mid');
assert.strictEqual(Api.actionRiskLevel('resumeVoice'),'mid');
assert.strictEqual(Api.actionRiskLevel('none'),'none');

// —— canExecuteCameraAction ——
function enablePresence(){
  global.OneToneState.state.config.cameraPrefs={
    presenceActions:{
      enabled:true,
      triggers:{away:true,shake:true,blink:true},
      onAway:'privacyScreen',
      onReturn:'resumeVoice',
      shakeHead:'pressEsc',
      deliberateBlink:'pressCtrlI'
    }
  };
}
function setRunning(on){
  global.OneToneCameraPreview={
    isRunning:function(){ return !!on; },
    getGazeDebugState:function(){ return {previewLive:!!on}; }
  };
}
function setCalibrating(on){
  global.OneToneCameraGazeCalibration={
    getState:function(){ return {running:!!on}; }
  };
}

enablePresence();
setRunning(false);
setCalibrating(false);
var g1=Api.canExecuteCameraAction('privacyScreen','away');
assert.strictEqual(g1.ok,false);
assert.strictEqual(g1.reason,'not_running');

setRunning(true);
setCalibrating(true);
var g2=Api.canExecuteCameraAction('privacyScreen','away');
assert.strictEqual(g2.ok,false);
assert.strictEqual(g2.reason,'calibrating');

setCalibrating(false);
var g3=Api.canExecuteCameraAction('pressEsc','away');
assert.strictEqual(g3.ok,false);
assert.ok(g3.reason==='need_present'||g3.reason==='invalid_combo','away+pressEsc blocked');

Api._testSetPresence('present');
Api.setPrivacyOpen(true);
var g4=Api.canExecuteCameraAction('pressEsc','shake');
assert.strictEqual(g4.ok,false);
assert.strictEqual(g4.reason,'privacy_blocks_key');
Api.setPrivacyOpen(false);

Api._testSetPausedByPresence(false);
var g5=Api.canExecuteCameraAction('resumeVoice','return');
assert.strictEqual(g5.ok,false);
assert.strictEqual(g5.reason,'resume_manual');

Api._testSetPausedByPresence(true);
var g6=Api.canExecuteCameraAction('resumeVoice','return');
assert.strictEqual(g6.ok,true);

// Away low-risk must NOT require present.
Api._testSetPresence('away');
var g7=Api.canExecuteCameraAction('privacyScreen','away');
assert.strictEqual(g7.ok,true,'away privacy ok while presence=away');

// Cooldown is separate from canExecute.
Api._testSetLastKeyAt(performance.now());
var thr=Api.shouldThrottleCameraAction('pressEsc','shake');
assert.strictEqual(thr.ok,false);
assert.strictEqual(thr.reason,'cooldown');
var g8=Api.canExecuteCameraAction('pressEsc','shake');
Api._testSetPresence('present');
assert.strictEqual(Api.canExecuteCameraAction('pressEsc','shake').ok,true,'canExecute ignores key cooldown');

// Recommend patch shape.
var rec=Api.recommendedPresencePrefs();
assert.strictEqual(rec.onAway,'privacyScreen');
assert.strictEqual(rec.onReturn,'resumeVoice');
assert.strictEqual(rec.shakeHead,'pressEsc');
assert.strictEqual(rec.deliberateBlink,'pressCtrlI');
assert.strictEqual(rec.triggers.away,true);
assert.strictEqual(rec.triggers.shake,true);
assert.strictEqual(rec.triggers.blink,true);

// Hand gesture prefs normalize + derive triggers from actions.
var handNorm=Api.normalizePrefs({
  enabled:true,
  openPalm:'pressEsc',
  okHand:'none',
  fist:'privacyScreen',
  wave:'none'
});
assert.strictEqual(handNorm.triggers.openPalm,true);
assert.strictEqual(handNorm.triggers.okHand,false);
assert.strictEqual(handNorm.triggers.fist,true);
assert.strictEqual(handNorm.triggers.wave,false);
assert.strictEqual(handNorm.openPalm,'pressEsc');
assert.strictEqual(handNorm.fist,'privacyScreen');

var handKeep=Api.normalizePrefs({
  enabled:true,
  triggers:{openPalm:true,okHand:true,fist:false,wave:true},
  openPalm:'none',
  okHand:'none',
  fist:'none',
  wave:'none'
});
assert.strictEqual(handKeep.triggers.openPalm,true);
assert.strictEqual(handKeep.triggers.okHand,true);
assert.strictEqual(handKeep.triggers.wave,true);
assert.strictEqual(handKeep.openPalm,'none');

var handActions=Api.allowedActionsForBindKey('openPalm');
assert.ok(handActions.indexOf('pressEsc')>=0,'hand allows pressEsc');
assert.ok(handActions.indexOf('pressCtrlI')>=0,'hand allows pressCtrlI');

Api._testSetPresence('present');
setRunning(true);
setCalibrating(false);
assert.strictEqual(Api.canExecuteCameraAction('pressEsc','openPalm').ok,true);
assert.strictEqual(Api.canExecuteCameraAction('pressEsc','wave').ok,true);
assert.strictEqual(Api.canExecuteCameraAction('pressEsc','ok').ok,true);

// #4b Send Guard model + bind-time rejection of send-class tokens.
assert.equal(typeof Api.buildCameraSendGuardModel,'function');
assert.equal(typeof Api.isSendClassAction,'function');
var guard=Api.buildCameraSendGuardModel();
assert.strictEqual(guard.allowsDirectSend,false);
assert.strictEqual(guard.visionOutcome,'pendingConfirm');
assert.strictEqual(guard.pendingActionIsNotSendConfirm,true);
assert.ok(Array.isArray(guard.confirmSources)&&guard.confirmSources.indexOf('key')>=0);
assert.ok(Api.isSendClassAction('send'));
assert.ok(Api.isSendClassAction('agent:stopOrSendDictation'));
assert.ok(!Api.isSendClassAction('pressEsc'));
assert.ok(!Api.isSendClassAction('agent:openAgent'));
assert.strictEqual(Api.normalizePrefs({shakeHead:'send'}).shakeHead,'none','send prefs normalize to none');
assert.strictEqual(Api.normalizePrefs({deliberateBlink:'agent:stopOrSendDictation'}).deliberateBlink,'none');

Api.dispatchAction('send','blink').then(function(r){
  assert.strictEqual(r.ok,false);
  assert.strictEqual(r.reason,'send_guard');
  assert.ok(!listeners.DOMContentLoaded||listeners.DOMContentLoaded.length===1,
    'module may register init listener but tests do not fire it');
  console.log('camera-presence-actions.test.js: ok');
}).catch(function(err){
  console.error(err);
  process.exit(1);
});
