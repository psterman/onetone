import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const context={
  console,
  document:{documentElement:{lang:'zh-CN'}},
  OneToneI18n:{getLang:()=> 'zh',t:(k,fb)=>fb||k},
  OneToneVoiceWake:{currentMode:()=> 'vosk'},
  OneToneSceneConfig:{
    globalWakePhrases:()=>['你好'],
    globalEndPhrases:()=>({zh:['结束'],en:['done']}),
    globalVoiceTargetKey:()=> 'RAlt'
  },
  OneToneState:{
    state:{config:{
      cameraPrefs:{presenceActions:{enabled:true,triggers:{blink:true},deliberateBlink:'pressCtrlI'}},
      mappings:[
        {id:'base',group:'通用设置',enabled:true,triggerKey:'F8',targetKey:'RAlt',triggerMode:'tap'},
        {id:'app-1',group:'Cursor',appTargetId:'cursor-chat',enabled:true,triggerKey:'F9',targetKey:'Enter',voiceOverride:{wakePhrases:['开始写作']}}
      ]
    }},
    ui:{}
  },
  OneToneMappingCore:{byId(id){return context.OneToneState.state.config.mappings.find((m)=>m.id===id)||null;}},
  OneToneAppBehaviorRules:{appDisplayName:(id)=>id==='cursor-chat'?'Cursor':id},
  OneToneHabitProfile:{habitDisplayName:(m)=>m.group||m.id},
  OneToneHabitOverrideDiff:{
    isAppScenarioMapping:(m)=>!!m.appTargetId,
    findGlobalBaselineMapping:(cfg)=>cfg.mappings[0],
    getGlobalKeyBaseline:()=>({triggerKey:'F8',targetKey:'RAlt',triggerMode:'tap',autoEnterEnabled:true,cancelEnabled:true}),
    getGlobalVoiceBaseline:()=>({targetKey:'RAlt',wakePhrases:['你好'],engine:'off',endPhrases:{zh:[],en:[]},cancelPhrases:{zh:[],en:[]},sendPhrases:{zh:[],en:[]}}),
    getKeysAccessState:()=>({status:'overridden',overrideCount:2}),
    getVoiceAccessState:()=>({status:'overridden',overrideCount:1}),
    fieldKeyStatus:()=>'overridden',fieldVoiceStatus:()=>'inherited'
  },
  OneToneAppTargetPresets:{presetById:()=>null}
};
context.globalThis=context;
vm.createContext(context);
for(const file of ['src/js/core/habit-override-diff.js','src/js/features/mapping/habit-shared.js']){
  vm.runInContext(readFileSync(new URL('../'+file,import.meta.url),'utf8'),context,{filename:file});
}
const Shared=context.OneToneHabitShared;
const m=context.OneToneState.state.config.mappings[1];
const rows=Shared.buildRuleRows(m,{channel:'all'});
assert.ok(rows.length>0,'buildRuleRows returns items');
assert.ok(rows.some((r)=>r.channel==='key'&&r.txt.includes('F9')),'key row uses trigger key');
assert.equal(rows[0].priority,'overridden','overrides sort first');
const keyOnly=Shared.buildRuleRows(m,{channel:'key'});
assert.ok(keyOnly.every((r)=>r.channel==='key'),'channel filter works');
const sum=Shared.inheritSummary(m);
assert.ok(sum.total===rows.length,'inherit summary total matches');
assert.ok(Shared.channelVizHtml('all',m).includes('habit-ws-viz-card'),'overview viz renders');
assert.ok(Shared.inheritHintHtml(m).includes('habit-novice-inherit-hint'),'inherit hint renders');
assert.ok(Shared.inheritChainHtml(m).includes('habit-ws-inherit-chain'),'inherit chain renders');
console.log('[habit-rule-rows] assertions passed');
