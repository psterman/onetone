#!/usr/bin/env node
'use strict';

var assert=require('assert');

global.document={
  readyState:'loading',
  getElementById:function(){ return null; },
  createElement:function(tag){
    var el={
      tagName:String(tag||'').toUpperCase(),
      width:0,
      height:0,
      setAttribute:function(){},
      appendChild:function(){},
      classList:{add:function(){},remove:function(){},toggle:function(){}},
      style:{},
      getContext:function(){
        return {
          clearRect:function(){},
          fillRect:function(){},
          beginPath:function(){},
          moveTo:function(){},
          lineTo:function(){},
          closePath:function(){},
          fill:function(){},
          stroke:function(){},
          save:function(){},
          restore:function(){},
          clip:function(){},
          setTransform:function(){},
          drawImage:function(){},
          createRadialGradient:function(){
            return {addColorStop:function(){}};
          },
          arc:function(){},
          ellipse:function(){},
          quadraticCurveTo:function(){}
        };
      }
    };
    return el;
  },
  addEventListener:function(){}
};
global.window=global;
global.OneToneDom={$:function(){ return null; }};
global.OneToneState={state:{config:{cameraPrefs:{
  selectedFrameRate:30,
  videoEnhancement:{enabled:false,look:'off',faceMask:'off'}
}}}};

require('../src/vendor/face-mask/face-mask.js');
require('../src/vendor/gpuimage-beautify/gpuimage-beautify.js');
require('../src/js/features/camera/camera-video-enhancer.js');

var Mask=global.OneToneFaceMask;
assert.ok(Mask,'face mask vendor export');
assert.equal(Mask.normalizeStyle('EMOJI'),'emoji');
assert.equal(Mask.normalizeStyle('nope'),'off');
assert.ok(Mask.FACE_OVAL.length>20,'face oval ring');

var Gpu=global.OneToneGpuBeautify;
assert.ok(Gpu,'gpu beautify vendor export');
assert.equal(Gpu.smoothDegreeFromLevel(0),0);
assert.equal(Gpu.smoothDegreeFromLevel(2),0.5,'mid smooth matches upstream default');
assert.ok(Gpu.brightFromWhiten(3)<=1.12,'heavy whiten stays near upstream 1.1');

var Enh=global.OneToneCameraVideoEnhancer;
assert.ok(Enh,'enhancer export');

var d=Enh.defaultPrefs();
assert.equal(d.look,'off');
assert.equal(d.faceMask,'off');
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
assert.equal(off.beautyEnabled,false);

var mid=Enh.setPrefs({look:'natural',whiten:2});
assert.equal(mid.look,'natural');
assert.equal(mid.whiten,2);
assert.equal(mid.smooth,1);

// Legacy preset in normalize
var legacy=Enh.normalizePrefs({enabled:true,preset:'soft'});
assert.equal(legacy.look,'cream');
assert.equal(legacy.enabled,true);

// Privacy mask alone enables preview pipeline without beauty look
Enh.applyLook('off');
var maskOnly=Enh.applyFaceMask('emoji');
assert.equal(maskOnly.faceMask,'emoji');
assert.equal(maskOnly.look,'off');
assert.equal(maskOnly.enabled,true);
assert.equal(maskOnly.beautyEnabled,false);

var maskOff=Enh.applyFaceMask('off');
assert.equal(maskOff.faceMask,'off');
assert.equal(maskOff.enabled,false);

// Mask + look both on
var both=Enh.setPrefs({look:'natural',faceMask:'solid'});
assert.equal(both.look,'natural');
assert.equal(both.faceMask,'solid');
assert.equal(both.enabled,true);
assert.equal(both.beautyEnabled,true);

console.log('camera-video-enhancement.test.js: ok');
