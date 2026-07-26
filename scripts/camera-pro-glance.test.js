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
global.OneToneState={state:{config:{cameraPrefs:{}}},ui:{},runtime:{}};

require('../src/js/features/camera/camera-pro-glance.js');

var Api=global.OneToneCameraProGlance;
assert.ok(Api,'OneToneCameraProGlance exports');
assert.equal(typeof Api.normalizeProFeatures,'function');

var d=Api.defaultProFeatures();
assert.strictEqual(d.privacyAlert,false);
assert.strictEqual(d.visualizer,false);
assert.strictEqual(d.labSmartPointer,false);

var n=Api.normalizeProFeatures({
  privacyAlert:true,
  privacyGuard:true,
  privacySensitivity:'high',
  wellness2020:true,
  wellness2020Minutes:99,
  labSmartPointer:true
});
assert.strictEqual(n.privacyAlert,true);
assert.strictEqual(n.privacyGuard,true);
assert.strictEqual(n.privacySensitivity,'high');
assert.strictEqual(n.wellness2020Minutes,60,'clamp max 60');
assert.strictEqual(n.labSmartPointer,false,'lab flags never persist as on');

var bad=Api.normalizeProFeatures({privacySensitivity:'nope',wellness2020Minutes:5});
assert.strictEqual(bad.privacySensitivity,'mid');
assert.strictEqual(bad.wellness2020Minutes,20);

console.log('camera-pro-glance.test.js OK');
