#!/usr/bin/env node
'use strict';

var assert=require('assert');

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
  addEventListener:function(){}
};
global.window=global;
global.performance={now:function(){ return Date.now(); }};
global.OneToneDom={$:function(){ return null; }};
global.OneToneState={state:{config:{cameraPrefs:{}}}};
global.OneToneIpc={
  invoke:function(){ return Promise.reject(new Error('no_ipc_in_test')); }
};

require('../src/js/features/camera/camera-auto-mute.js');

var Am=global.OneToneCameraAutoMute;
assert.ok(Am,'auto mute module exports');

var near=Am.faceAreaToCm(0.12);
var far=Am.faceAreaToCm(0.02);
assert.ok(near<far,'larger face → closer');
assert.ok(near>=25&&near<=200);
assert.ok(far>=25&&far<=200);

var roundTrip=Am.faceAreaToCm(Am.cmToFaceArea(55));
assert.ok(Math.abs(roundTrip-55)<1.5,'cm↔faceArea round-trip ~55');

assert.strictEqual(Am.decideMuteAction(70,55,6,false),'mute');
assert.strictEqual(Am.decideMuteAction(70,55,6,true),'hold');
assert.strictEqual(Am.decideMuteAction(40,55,6,true),'unmute');
assert.strictEqual(Am.decideMuteAction(40,55,6,false),'hold');
assert.strictEqual(Am.decideMuteAction(52,55,6,true),'hold','hysteresis band');
assert.strictEqual(Am.decideMuteAction(52,55,6,false),'hold','hysteresis band unmuted');

var n=Am.normalizeAutoMute({enabled:1,thresholdCm:200,hysteresisCm:1,showStatus:false});
assert.strictEqual(n.enabled,true);
assert.strictEqual(n.thresholdCm,180);
assert.strictEqual(n.hysteresisCm,2);
assert.strictEqual(n.showStatus,false);
assert.strictEqual(n.noFaceMute,true);

var noFaceOff=Am.normalizeAutoMute({noFaceMute:false});
assert.strictEqual(noFaceOff.noFaceMute,false);

var withFa=Am.normalizeAutoMute({thresholdFaceArea:Am.cmToFaceArea(60),thresholdCm:55});
assert.ok(Math.abs(Am.effectiveThresholdCm(withFa)-60)<=2);

assert.strictEqual(n.proximityMode,'farMute');

var nearMode=Am.normalizeAutoMute({proximityMode:'nearMute'});
assert.strictEqual(nearMode.proximityMode,'nearMute');

assert.strictEqual(Am.decideMuteActionByMode('farMute',70,55,6,false),'mute');
assert.strictEqual(Am.decideMuteActionByMode('farMute',40,55,6,true),'unmute');
assert.strictEqual(Am.decideMuteActionByMode('nearMute',40,55,6,false),'mute');
assert.strictEqual(Am.decideMuteActionByMode('nearMute',70,55,6,true),'unmute');
assert.strictEqual(Am.decideMuteActionByMode('nearMute',52,55,6,false),'hold','near hysteresis');
assert.strictEqual(Am.decideMuteActionByMode('nearMute',52,55,6,true),'hold','near hysteresis muted');

assert.ok(Am.distanceToScenePct(30)===0);
assert.ok(Am.distanceToScenePct(180)===100);

// manual override: auto-mute should not change mic while override window active
var muteCalls=0;
var mockMuted=false;
global.OneToneAppMic={
  getMicUiState:function(){
    return {muteKnown:true,muted:mockMuted,available:true,key:mockMuted?'muted':'ready'};
  },
  isMicManualOverrideActive:function(){ return true; },
  setMicUiMuted:function(m){
    muteCalls++;
    mockMuted=!!m;
    return Promise.resolve({});
  }
};
Am.writeSettings({enabled:true,thresholdCm:55,hysteresisCm:6});
Am.applyDistanceDecision(80, Date.now());
assert.strictEqual(muteCalls,0,'manual override blocks auto-mute');

global.OneToneAppMic.isMicManualOverrideActive=function(){ return false; };
Am.applyDistanceDecision(80, Date.now()+300);
assert.strictEqual(muteCalls,1,'auto-mute applies after override expires');

console.log('camera-auto-mute.test.js OK');
