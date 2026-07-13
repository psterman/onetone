#!/usr/bin/env node
'use strict';

var assert=require('assert');

global.OneToneSceneConfig={
  desiredEngine:function(){ return 'vosk'; },
  globalWakePhrases:function(){ return ['你好']; },
  globalEndPhrases:function(){ return {zh:['结束'],en:['done']}; },
  globalVoiceTargetKey:function(){ return 'RAlt'; }
};
global.OneToneVoiceWake={ currentMode:function(){ return 'vosk'; } };

require('../src/js/core/habit-override-diff.js');

var Diff=global.OneToneHabitOverrideDiff;
var cfg={
  voiceVosk:{enabled:true,phrases:['你好'],targetKey:'RAlt',modelPreset:'cn-light'},
  voiceEnd:{
    phrasesZh:['结束'],phrasesEn:['done'],
    cancelPhrasesZh:['取消'],cancelPhrasesEn:['cancel']
  }
};

var baseline=Diff.getGlobalVoiceBaseline(cfg);
assert.strictEqual(baseline.targetKey,'RAlt');
assert.deepStrictEqual(baseline.wakePhrases,['你好']);

var sparse=Diff.normalizeVoiceOverrideForSave({
  targetKey:'RAlt',
  wakePhrases:['你好','小旺'],
  endPhrases:{zh:['结束'],en:['done']},
  cancelPhrases:{zh:['取消'],en:['cancel']},
  engine:'vosk',
  modelPreset:'cn-light'
},cfg);
assert.deepStrictEqual(sparse.wakePhrases,['你好','小旺']);
assert.strictEqual(sparse.targetKey,undefined);
assert.strictEqual(sparse.engine,undefined);

var empty=Diff.normalizeVoiceOverrideForSave({
  targetKey:'RAlt',
  wakePhrases:['你好'],
  endPhrases:{zh:['结束'],en:['done']},
  cancelPhrases:{zh:['取消'],en:['cancel']},
  engine:'vosk',
  modelPreset:'cn-light'
},cfg);
assert.strictEqual(Diff.isEmptyOverride(empty),true);

assert.strictEqual(Diff.fieldVoiceStatus('wakePhrases',{wakePhrases:['你好','小旺']},baseline),'overridden');
assert.strictEqual(Diff.fieldVoiceStatus('targetKey',{targetKey:'RAlt'},baseline),'inherited');

var mapping={
  appTargetId:'cursor',
  group:'Cursor 情景',
  enabled:true,
  triggerKey:'F8',
  targetKey:'',
  voiceOverride:{wakePhrases:['小旺']}
};
var preview=Diff.buildScenarioSavePreview(mapping,cfg,{
  pickedAppId:'cursor',
  name:'Cursor 情景',
  appName:'Cursor',
  labels:{
    chipAppSelected:'App·{app}',
    chipAppMissing:'No app',
    chipNameOk:'Name ok',
    chipNameMissing:'Name missing',
    chipKeysInherit:'Keys inherit',
    chipKeysOverride:'Keys·{n}',
    chipVoiceInherit:'Voice inherit',
    chipVoiceOverride:'Voice·{n}',
    chipSaveReady:'Ready',
    chipSaveEmpty:'Ready empty',
    chipSaveBlocked:'Blocked'
  }
});
assert.strictEqual(preview.saveKind,'overrides');
assert.strictEqual(preview.canSave,true);
assert.ok(preview.keysOverrideCount>=1);
assert.ok(preview.voiceOverrideCount>=1);
assert.strictEqual(preview.statusChips.length,5);

var previewLabels={
  chipAppSelected:'App·{app}',chipAppMissing:'No app',chipNameOk:'Name ok',chipNameMissing:'Name missing',
  chipKeysInherit:'Keys inherit',chipKeysOverride:'Keys·{n}',chipVoiceInherit:'Voice inherit',chipVoiceOverride:'Voice·{n}',
  chipSaveReady:'Ready',chipSaveEmpty:'Ready empty',chipSaveBlocked:'Blocked',
  enableScenario:'Scenario',enableKeys:'Keys',enableVoice:'Voice',enableOff:'Off'
};
var blockedPreview=Diff.buildScenarioSavePreview({
  appTargetId:'',group:'X',enabled:true,
  triggerKey:'F8',targetKey:''
},cfg,{pickedAppId:'',name:'X',appName:'',labels:previewLabels});
assert.strictEqual(blockedPreview.canSave,false);
assert.strictEqual(blockedPreview.saveBlockReason,'no_app');

var emptyPreview=Diff.buildScenarioSavePreview({
  appTargetId:'cursor',group:'X',enabled:true,
  triggerKey:'',targetKey:'',
  autoEnterEnabled:true,cancelEnabled:true,triggerMode:'tap',
  voiceOverride:null
},cfg,{pickedAppId:'cursor',name:'X',appName:'Cursor',labels:previewLabels});
assert.strictEqual(emptyPreview.saveKind,'empty');
assert.strictEqual(emptyPreview.allInherited,true);

var disabledPreview=Diff.buildScenarioSavePreview({
  appTargetId:'cursor',group:'X',enabled:false,
  triggerKey:'',targetKey:'',
  autoEnterEnabled:true,cancelEnabled:true,triggerMode:'tap',
  keyModeEnabled:false,
  voiceModeEnabled:false,
  voiceOverride:null
},cfg,{pickedAppId:'cursor',name:'X',appName:'Cursor',labels:previewLabels});
assert.strictEqual(disabledPreview.saveKind,'overrides');
assert.strictEqual(disabledPreview.allInherited,false);
assert.deepStrictEqual(disabledPreview.stateOverrides.map(function(x){ return x.field; }),[
  'scenarioEnabled','keysModeEnabled','voiceModeEnabled'
]);

var keySparse={triggerKey:'RAlt',targetKey:'V'};
Diff.normalizeKeyFieldsForSave(keySparse,{triggerKey:'RAlt',targetKey:'V'},true);
assert.strictEqual(keySparse.triggerKey,'');
assert.strictEqual(keySparse.targetKey,'');

var mockCore={
  byId:function(id){
    if(id==='global-1') return {id:'global-1',triggerKey:'RAlt',targetKey:'V',appTargetId:''};
    if(id==='app-1') return {id:'app-1',triggerKey:'F8',targetKey:'',appTargetId:'cursor'};
    return null;
  }
};
cfg.mappings=[
  {id:'global-1',triggerKey:'RAlt',targetKey:'V',appTargetId:'',appBehaviorRules:[]},
  {id:'app-1',triggerKey:'F8',targetKey:'',appTargetId:'cursor',appBehaviorRules:[]},
  {id:'legacy-1',triggerKey:'F9',targetKey:'',appTargetId:'',appBehaviorRules:[]}
];
cfg.activeSceneId='app-1';
var baselineMapping=Diff.findGlobalBaselineMapping(cfg,mockCore);
assert.strictEqual(baselineMapping.id,'global-1');
assert.strictEqual(Diff.isAppScenarioMapping({appTargetId:'cursor'}),true);
assert.strictEqual(Diff.isAppScenarioMapping({appTargetId:'',appBehaviorRules:[{appId:'notepad'}]}),false);
assert.strictEqual(Diff.isAppScenarioMapping({appTargetId:'',appBehaviorRules:[]}),false);
assert.strictEqual(Diff.isGlobalBaselineMapping({id:'global-1'},cfg,mockCore),true);
assert.strictEqual(Diff.isGlobalBaselineMapping({id:'app-1',appTargetId:'cursor'},cfg,mockCore),false);

var keysAccess=Diff.getKeysAccessState({triggerKey:'F8',targetKey:'',keyModeEnabled:true},cfg,mockCore);
assert.strictEqual(keysAccess.status,'overridden');

console.log('habit-override-diff.test.js: ok');
