import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const storage=new Map();
const context={
  console,
  document:{documentElement:{lang:'zh-CN'}},
  localStorage:{getItem:(k)=>storage.has(k)?storage.get(k):null,setItem:(k,v)=>storage.set(k,String(v))},
  OneToneI18n:{getLang:()=> 'zh',t:(k)=>k},
  OneToneState:{state:{config:{mappings:[
    {id:'app-1',group:'Cursor 场景',appTargetId:'cursor-chat',enabled:true,dim:'voice',scene:'begin',triggerKey:'F9',targetKey:'Enter',keyModeEnabled:true,voiceModeEnabled:true},
    {id:'base',group:'通用设置',enabled:true,triggerKey:'F8',targetKey:'RAlt'}
  ]},selectedMappingId:'app-1'},ui:{}},
  OneToneMappingCore:{},
  OneToneHabitOverrideDiff:{
    getGlobalKeyBaseline:()=>({triggerKey:'F8',targetKey:'RAlt',triggerMode:'tap',autoEnterEnabled:true,cancelEnabled:true}),
    getGlobalVoiceBaseline:()=>({targetKey:'RAlt',wakePhrases:['你好'],engine:'off',endPhrases:{zh:[],en:[]},cancelPhrases:{zh:[],en:[]},sendPhrases:{zh:[],en:[]}}),
    getKeysAccessState:()=>({status:'inherited',overrideCount:0}),
    getVoiceAccessState:()=>({status:'inherited',overrideCount:0})
  },
  OneToneHabitProfile:{habitDisplayName:(m)=>m.group||m.id},
  OneToneAppBehaviorRules:{appDisplayName:(id)=>id==='cursor-chat'?'Cursor':id},
  OneToneAppTargetPresets:{presetById:()=>null}
};
context.globalThis=context;
vm.createContext(context);
for(const file of ['src/js/features/mapping/habit-shared.js','src/js/features/mapping/habit-card-utils.js']){
  vm.runInContext(readFileSync(new URL('../'+file,import.meta.url),'utf8'),context,{filename:file});
}

const Shared=context.OneToneHabitShared;
const CardUtils=context.OneToneHabitCardUtils;

const view=Shared.resolveHabitView({mapping:{dim:'voice',scene:'begin'},channel:'key',itemId:'key-main'});
assert.equal(view.dim,'voice','mapping.dim overrides itemId');
assert.equal(view.scene,'begin','mapping.scene overrides item map');

const inferred=Shared.resolveHabitView({mapping:{},channel:'voice',itemId:'voice-end'});
assert.equal(inferred.dim,'voice');
assert.equal(inferred.scene,'end');

const wave=Shared.resolveHabitView({mapping:{},channel:'camera',itemId:'camera-wave'});
assert.equal(wave.scene,'general');

const cards=Shared.buildNoviceCards(context.OneToneState.state.config.mappings);
assert.ok(cards.length>0,'buildNoviceCards expands mappings');
const keyCard=cards.find((c)=>c.mappingId==='app-1'&&c.itemId==='key-main');
assert.ok(keyCard,'key card exists');
assert.equal(keyCard.dim,'voice','mapping.dim on card');

const demo=CardUtils.buildDemo({detail:{when:'F9',what:'开始听写'}});
assert.equal(demo.length,2,'buildDemo fallback always 2 steps');
assert.equal(demo[0].type,'cursor');

console.log('[habit-shared] assertions passed');
