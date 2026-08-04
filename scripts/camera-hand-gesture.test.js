#!/usr/bin/env node
'use strict';

var assert=require('assert');

global.document={
  readyState:'loading',
  getElementById:function(){ return null; },
  addEventListener:function(){}
};
global.window=global;
global.performance={now:function(){ return Date.now(); }};
global.location={href:'http://localhost/'};

require('../src/js/features/camera/camera-hand-gesture.js');

var Api=global.OneToneCameraHandGesture;
assert.ok(Api,'OneToneCameraHandGesture should export');
assert.equal(typeof Api.mapCategoryForTest,'function');
assert.equal(typeof Api.detectOkForTest,'function');
assert.equal(typeof Api.setDetectIntervalMs,'function');
Api.setDetectIntervalMs(200);
assert.strictEqual(Api.getDetectIntervalMs(),200);
Api.setDetectIntervalMs(50);

var palm=Api.mapCategoryForTest('Open_Palm',0.9);
assert.strictEqual(palm.kind,'openPalm');
assert.ok(palm.score>=0.9);

var fist=Api.mapCategoryForTest('Closed_Fist',0.8);
assert.strictEqual(fist.kind,'fist');

var none=Api.mapCategoryForTest('Thumb_Up',0.95);
assert.strictEqual(none,null);

var weak=Api.mapCategoryForTest('Open_Palm',0.2);
assert.strictEqual(weak,null);

function pt(x,y){ return {x:x,y:y,z:0}; }

// OK: tight thumb≈index ring, index curled, other fingers clearly extended.
var hand=[];
for(var i=0;i<21;i++) hand.push(pt(0.5,0.5));
hand[0]=pt(0.5,0.85);  // wrist
hand[4]=pt(0.46,0.58);  // thumb tip
hand[5]=pt(0.50,0.48);  // index MCP farther from wrist than tip
hand[8]=pt(0.47,0.60);  // index tip curled near thumb
hand[9]=pt(0.50,0.55);
hand[12]=pt(0.50,0.18); // middle extended
hand[13]=pt(0.54,0.55);
hand[16]=pt(0.54,0.20);
hand[17]=pt(0.58,0.55);
hand[20]=pt(0.58,0.22);

var ok=Api.detectOkForTest(hand);
assert.strictEqual(ok.ok,true,'OK heuristic should accept circle');
assert.ok(ok.score>=0.72);

// Open palm-like: all tips extended — must NOT be OK.
var palmHand=[];
for(var p=0;p<21;p++) palmHand.push(pt(0.5,0.5));
palmHand[0]=pt(0.5,0.8);
palmHand[4]=pt(0.42,0.35);
palmHand[8]=pt(0.44,0.30);
palmHand[5]=pt(0.46,0.55);
palmHand[12]=pt(0.50,0.25);
palmHand[16]=pt(0.54,0.28);
palmHand[20]=pt(0.58,0.30);
palmHand[9]=pt(0.50,0.55);
palmHand[13]=pt(0.54,0.55);
palmHand[17]=pt(0.58,0.55);
assert.strictEqual(Api.detectOkForTest(palmHand).ok,false,'open palm must not count as OK');

var fistHand=[];
for(var j=0;j<21;j++) fistHand.push(pt(0.5,0.5));
fistHand[0]=pt(0.5,0.7);
fistHand[4]=pt(0.48,0.58);
fistHand[8]=pt(0.50,0.58);
fistHand[12]=pt(0.52,0.58);
fistHand[16]=pt(0.54,0.58);
fistHand[20]=pt(0.56,0.58);
assert.strictEqual(Api.detectOkForTest(fistHand).ok,false,'curled tips should not be OK');

console.log('camera-hand-gesture.test.js: ok');
