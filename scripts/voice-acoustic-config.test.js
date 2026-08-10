#!/usr/bin/env node
'use strict';

var assert=require('assert');

require('../src/js/core/config-persist.js');

var P=global.OneToneConfigPersist;

function sampleFeature(frames){
  var len=frames*P.ACOUSTIC_FEATURE_DIMS;
  var out=[];
  for(var i=0;i<len;i++) out.push(0.1+i*0.01);
  return out;
}

function sampleCmd(quality){
  return {
    id:'acmd_test',
    version:1,
    kind:'scenario-acoustic-activate',
    scenarioId:'sc1',
    label:'测试',
    displayText:'',
    samples:[{
      id:'sample_test',
      durationMs:900,
      feature:sampleFeature(40),
      featureKind:'mfcc-v1',
      featureFrames:40,
      featureDims:13,
      sampleRate:16000,
      qualitySignals:{hasSpeech:true,tooShort:false,tooLong:false,sampleAgreement:0.91},
      createdAt:1
    }],
    threshold:0.78,
    margin:0.08,
    quality:quality||'good',
    activationScope:'global',
    appBoost:true,
    enabled:true,
    createdAt:1,
    updatedAt:1
  };
}

var normalized=P.normalizeAcousticVoiceCommands([sampleCmd('good')],'sc1');
assert.strictEqual(normalized.length,1);
assert.strictEqual(normalized[0].samples[0].featureDims,13);
assert.strictEqual(normalized[0].samples[0].feature.length,40*13);

assert.strictEqual(P.normalizeAcousticVoiceCommands([sampleCmd('weak')],'sc1').length,0);

var bad=sampleCmd('good');
bad.samples[0].feature[0]=NaN;
assert.strictEqual(P.normalizeAcousticVoiceCommands([bad],'sc1').length,0);

var rekeyed=P.rekeyAcousticVoiceCommandsForMapping([sampleCmd('good')],'sc2');
assert.strictEqual(rekeyed.length,1);
assert.notStrictEqual(rekeyed[0].id,'acmd_test');
assert.strictEqual(rekeyed[0].scenarioId,'sc2');
assert.notStrictEqual(rekeyed[0].samples[0].id,'sample_test');

var serialized=P.serializeAcousticVoiceCommands([sampleCmd('good')],'sc1');
assert.strictEqual(serialized[0].samples[0].featureFrames,40);

var inbound={
  id:'sc1',
  voice_commands:[{canonicalPhrase:'旧命令',scenarioId:'sc1',quality:'good',samples:[{transcript:'测',source:'vosk'}]}],
  acoustic_voice_commands:[sampleCmd('good')]
};
var normInbound=Object.assign({},inbound);
if(!Array.isArray(normInbound.acousticVoiceCommands)&&Array.isArray(normInbound.acoustic_voice_commands)){
  normInbound.acousticVoiceCommands=normInbound.acoustic_voice_commands;
}
normInbound.acousticVoiceCommands=P.normalizeAcousticVoiceCommands(normInbound.acousticVoiceCommands,normInbound.id);
assert.strictEqual(normInbound.acousticVoiceCommands.length,1);

assert.strictEqual(P.ACOUSTIC_PREVIEW_MAX_BYTES,38400);

// Preview: camelCase round-trip
var withPreview=sampleCmd('good');
var pcmEven=Buffer.alloc(4);
pcmEven.writeInt16LE(1000,0);
pcmEven.writeInt16LE(-2000,2);
var b64Even=pcmEven.toString('base64');
withPreview.samples[0].previewPcmB64=b64Even;
var nPreview=P.normalizeAcousticVoiceCommands([withPreview],'sc1');
assert.strictEqual(nPreview[0].samples[0].previewPcmB64,b64Even);
var serPreview=P.serializeAcousticVoiceCommands([withPreview],'sc1');
assert.strictEqual(serPreview[0].samples[0].previewPcmB64,b64Even);
assert.strictEqual(Object.prototype.hasOwnProperty.call(serPreview[0].samples[0],'preview_pcm_b64'),false);

// Preview: snake_case input → camelCase output
var snakePreview=sampleCmd('good');
snakePreview.samples[0].preview_pcm_b64=b64Even;
delete snakePreview.samples[0].previewPcmB64;
var nSnake=P.normalizeAcousticVoiceCommands([snakePreview],'sc1');
assert.strictEqual(nSnake[0].samples[0].previewPcmB64,b64Even);

// Invalid base64 omitted; sample still kept
var badB64=sampleCmd('good');
badB64.samples[0].previewPcmB64='!!!not-base64!!!';
var nBad=P.normalizeAcousticVoiceCommands([badB64],'sc1');
assert.strictEqual(nBad.length,1);
assert.strictEqual(nBad[0].samples[0].previewPcmB64,undefined);

// Odd byte length → drop last byte
var odd=Buffer.alloc(5);
odd.writeUInt8(1,0); odd.writeUInt8(2,1); odd.writeUInt8(3,2); odd.writeUInt8(4,3); odd.writeUInt8(5,4);
var nOdd=P.normalizePreviewPcmB64(odd.toString('base64'));
assert.ok(nOdd);
assert.strictEqual(Buffer.from(nOdd,'base64').length,4);

// Oversize → truncate to ACOUSTIC_PREVIEW_MAX_BYTES
var over=Buffer.alloc(P.ACOUSTIC_PREVIEW_MAX_BYTES+100,7);
var nOver=P.normalizePreviewPcmB64(over.toString('base64'));
assert.strictEqual(Buffer.from(nOver,'base64').length,P.ACOUSTIC_PREVIEW_MAX_BYTES);

console.log('voice-acoustic-config.test.js: ok');
