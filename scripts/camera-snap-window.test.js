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

require('../src/js/features/camera/camera-snap-window.js');

var Snap=global.OneToneCameraSnapWindow;
assert.ok(Snap,'snap module exports');

var norm=Snap.normalizeSnapWindow({enabled:true,dwellMs:50,cooldownMs:99999});
assert.strictEqual(norm.enabled,true);
assert.strictEqual(norm.dwellMs,100,'dwell clamped min');
assert.strictEqual(norm.cooldownMs,5000,'cooldown clamped max');

var drag={lmbDown:true,isTitleBar:true,hwnd:'0xABC',monitorId:'monitor-0'};
var result={monitorId:'monitor-1',confidence:0.9};
var stability={monitorId:'monitor-1',stableMs:250};
assert.strictEqual(Snap.shouldSnap({enabled:true,dwellMs:200,cooldownMs:600,minConfidence:0.25},drag,result,stability,1000),true);

assert.strictEqual(Snap.shouldSnap({enabled:false,dwellMs:200,cooldownMs:600,minConfidence:0.25},drag,result,stability,1000),false,'disabled');
assert.strictEqual(Snap.shouldSnap({enabled:true,dwellMs:200,cooldownMs:600,minConfidence:0.25},
  Object.assign({},drag,{isTitleBar:false}),result,stability,1000),false,'not title bar');
assert.strictEqual(Snap.shouldSnap({enabled:true,dwellMs:200,cooldownMs:600,minConfidence:0.25},
  Object.assign({},drag,{monitorId:'monitor-1'}),result,stability,1000),false,'same monitor');
assert.strictEqual(Snap.shouldSnap({enabled:true,dwellMs:200,cooldownMs:600,minConfidence:0.25},
  drag,Object.assign({},result,{stableMs:250}),null,1000),true,'stableMs on result');
assert.strictEqual(Snap.shouldSnap({enabled:true,dwellMs:200,cooldownMs:600,minConfidence:0.25},
  drag,result,{monitorId:'monitor-1',stableMs:50},1000),false,'dwell not met');

// Same hwnd+monitor after land should skip
Snap._rt.lastMovedHwnd='0xABC';
Snap._rt.lastMovedMonitorId='monitor-1';
assert.strictEqual(Snap.shouldSnap({enabled:true,dwellMs:200,cooldownMs:600,minConfidence:0.25},drag,result,stability,1000),false,'already moved');
Snap._rt.lastMovedHwnd=null;
Snap._rt.lastMovedMonitorId=null;
Snap._rt.lastMoveAt=900;
assert.strictEqual(Snap.shouldSnap({enabled:true,dwellMs:200,cooldownMs:600,minConfidence:0.25},drag,result,stability,1000),false,'cooldown');
Snap._rt.lastMoveAt=0;

console.log('camera-snap-window.test.js OK');
