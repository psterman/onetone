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

var palm=Api.mapCategoryForTest('Open_Palm',0.9);
assert.strictEqual(palm.kind,'openPalm');
assert.ok(palm.score>=0.9);

var fist=Api.mapCategoryForTest('Closed_Fist',0.8);
assert.strictEqual(fist.kind,'fist');

var none=Api.mapCategoryForTest('Thumb_Up',0.95);
assert.strictEqual(none,null);

var weak=Api.mapCategoryForTest('Open_Palm',0.2);
assert.strictEqual(weak,null);

// OK: thumb tip near index tip, other tips far from wrist (extended).
function pt(x,y){ return {x:x,y:y,z:0}; }
var hand=[];
for(var i=0;i<21;i++) hand.push(pt(0.5,0.5));
hand[0]=pt(0.5,0.8);   // wrist
hand[4]=pt(0.42,0.45);  // thumb tip
hand[8]=pt(0.44,0.44);  // index tip (near thumb)
hand[5]=pt(0.46,0.55);  // index MCP
hand[12]=pt(0.50,0.25); // middle tip extended
hand[16]=pt(0.54,0.28);
hand[20]=pt(0.58,0.30);
hand[9]=pt(0.50,0.55);
hand[13]=pt(0.54,0.55);
hand[17]=pt(0.58,0.55);

var ok=Api.detectOkForTest(hand);
assert.strictEqual(ok.ok,true,'OK heuristic should accept circle');
assert.ok(ok.score>0.4);

var fistHand=[];
for(var j=0;j<21;j++) fistHand.push(pt(0.5,0.5));
fistHand[0]=pt(0.5,0.7);
fistHand[4]=pt(0.48,0.58);
fistHand[8]=pt(0.50,0.58);
fistHand[12]=pt(0.52,0.58);
fistHand[16]=pt(0.54,0.58);
fistHand[20]=pt(0.56,0.58);
var notOk=Api.detectOkForTest(fistHand);
assert.strictEqual(notOk.ok,false,'curled tips should not be OK');

console.log('camera-hand-gesture.test.js: ok');
