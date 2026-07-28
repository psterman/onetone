#!/usr/bin/env node
'use strict';

var assert=require('assert');

var listeners={};
global.document={
  readyState:'loading',
  getElementById:function(){ return null; },
  querySelector:function(){ return null; },
  querySelectorAll:function(){ return []; },
  addEventListener:function(type,fn){
    if(!listeners[type]) listeners[type]=[];
    listeners[type].push(fn);
  }
};
global.window=global;
global.innerWidth=1920;
global.innerHeight=1080;
global.screenX=100;
global.screenY=50;
global.devicePixelRatio=1.25;
global.performance={now:function(){ return Date.now(); }};
global.requestAnimationFrame=function(fn){ return setTimeout(fn,0); };
global.cancelAnimationFrame=function(id){ clearTimeout(id); };
global.OneToneDom={$:function(){ return null; }};
global.OneToneI18n={t:function(k){ return k; }};

function legacyProfile(){
  return {
    kind:'idw',
    calibMode:'fine',
    rmse:36,
    vw:1920,
    vh:1080,
    savedAt:Date.now(),
    anchors:[
      {feats:[0.42,0.48,0.4,0.5,-0.12,0.08,0.2,0.4],rx:0.42,ry:0.48,nx:0.5,ny:0.5,targetId:'center',cx:960,cy:540},
      {feats:[0.16,0.16,0.4,0.5,0.26,-0.24,0.2,0.4],rx:0.16,ry:0.16,nx:0.04,ny:0.04,targetId:'tl',cx:80,cy:80},
      {feats:[0.84,0.16,0.4,0.5,-0.26,-0.24,0.2,0.4],rx:0.84,ry:0.16,nx:0.96,ny:0.04,targetId:'tr',cx:1840,cy:80},
      {feats:[0.16,0.84,0.4,0.5,0.28,0.24,0.2,0.4],rx:0.16,ry:0.84,nx:0.04,ny:0.93,targetId:'bl',cx:80,cy:1000},
      {feats:[0.84,0.84,0.4,0.5,-0.28,0.24,0.2,0.4],rx:0.84,ry:0.84,nx:0.96,ny:0.93,targetId:'br',cx:1840,cy:1000}
    ]
  };
}

global.OneToneState={
  state:{
    config:{
      cameraPrefs:{
        gazeCalibration:{
          schemaVersion:2,
          activeProfileKey:'fp|100|50|1920|1080|1.250',
          legacyProfile:legacyProfile(),
          profilesByMonitor:{
            'fp|100|50|1920|1080|1.250':legacyProfile()
          }
        }
      }
    }
  }
};

require('../src/js/features/camera/camera-gaze-calibration.js');
var Api=global.OneToneCameraGazeCalibration;
assert.ok(Api,'OneToneCameraGazeCalibration should export');
assert.equal(typeof Api.apply,'function');
assert.equal(typeof Api.loadFromPrefs,'function');
assert.equal(typeof Api.getState,'function');

Api.loadFromPrefs();
var st=Api.getState();
assert.strictEqual(st.hasModel,true,'model should load from schemaVersion=2 snapshot');
assert.strictEqual(st.profileSchemaVersion,2,'state should expose schemaVersion=2');
assert.ok(st.profileCount>=1,'profile map should exist');

var route=Api._debugResolveMonitorRouteKey();
assert.ok(route&&route.key,'monitor route key should resolve');

var out=Api.apply({
  x:0.91,
  y:0.88,
  confidence:0.08,
  state:'tracking',
  feats:[0.9,0.88,0.4,0.5,-0.31,0.22,0.2,0.4]
});
assert.strictEqual(out.calibrated,true);
assert.strictEqual(out.coarseOnly,true,'low confidence output should gate to coarse zone');
assert.ok(typeof out.regionZone==='string'&&out.regionZone.length>0,'should still output region zone');

var metrics=Api.getMetrics();
assert.ok(metrics&&metrics.apply,'metrics should be exposed');
assert.ok(metrics.apply.coarseGateCount>=1,'coarse gate metric should increment');

console.log('camera-gaze-calibration.test.js: ok');
