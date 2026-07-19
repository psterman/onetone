#!/usr/bin/env node
'use strict';

var assert=require('assert');

global.document={
  readyState:'loading',
  getElementById:function(){ return null; },
  createElement:function(){
    return {
      setAttribute:function(){},
      appendChild:function(){},
      classList:{add:function(){},remove:function(){},toggle:function(){}},
      style:{},
      getContext:function(){ return null; }
    };
  },
  addEventListener:function(){}
};
global.window=global;
global.OneToneDom={$:function(){ return null; }};
global.OneToneState={state:{config:{cameraPrefs:{
  selectedFrameRate:30,
  videoEnhancement:{enabled:false,look:'off'}
}}}};

require('../src/vendor/gpuimage-beautify/gpuimage-beautify.js');
require('../src/js/features/camera/camera-video-enhancer.js');

var Gpu=global.OneToneGpuBeautify;
assert.ok(Gpu,'gpu beautify vendor export');
assert.equal(Gpu.smoothDegreeFromLevel(0),0);
assert.equal(Gpu.smoothDegreeFromLevel(2),0.5,'mid smooth matches upstream default');
assert.ok(Gpu.brightFromWhiten(3)<=1.12,'heavy whiten stays near upstream 1.1');

var Enh=global.OneToneCameraVideoEnhancer;
assert.ok(Enh,'enhancer export');

var d=Enh.defaultPrefs();
assert.equal(d.look,'off');
assert.equal(d.enabled,false);
assert.equal(d.whiten,0);

assert.equal(Enh.mapLegacyPresetToLook('soft'),'cream');
assert.equal(Enh.mapLegacyPresetToLook('clear'),'glow');
assert.equal(Enh.mapLegacyPresetToLook('lowLight'),'fresh');
assert.equal(Enh.mapLegacyPresetToLook('natural'),'natural');
assert.equal(Enh.mapLegacyPresetToLook('unknown'),'off');

var cream=Enh.applyLook('cream');
assert.equal(cream.look,'cream');
assert.equal(cream.enabled,true);
assert.equal(cream.beautyEnabled,true);
assert.equal(cream.whiten,1);
assert.equal(cream.smooth,2);
assert.equal(cream.rosy,1);
assert.equal(cream.slim,0);

var fresh=Enh.applyLook('fresh');
assert.equal(fresh.slim,1);

var off=Enh.applyLook('off');
assert.equal(off.enabled,false);
assert.equal(off.look,'off');

var mid=Enh.setPrefs({look:'natural',whiten:2});
assert.equal(mid.look,'natural');
assert.equal(mid.whiten,2);
assert.equal(mid.smooth,1); // look defaults then override whiten only if setPrefs applies look first

// Legacy preset in normalize
var legacy=Enh.normalizePrefs({enabled:true,preset:'soft'});
assert.equal(legacy.look,'cream');
assert.equal(legacy.enabled,true);

console.log('camera-video-enhancement.test.js: ok');
