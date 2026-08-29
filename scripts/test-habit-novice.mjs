import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const storage=new Map();
const host={
  id:'habitWorkspace',
  className:'habit-workspace',
  innerHTML:'',
  __habitWorkspaceBound:false,
  __habitNoviceBound:false,
  setAttribute(){},
  addEventListener(type,fn){ this._listeners=this._listeners||{}; this._listeners[type]=fn; },
  querySelector(sel){
    if(sel==='.habit-ws-main, .habit-novice-main') return {scrollTop:0};
    return null;
  }
};
const hub={querySelector:(sel)=>(sel==='.habit-hub-toolbar'||sel==='.habit-hub-body')?{hidden:false}:null};
const context={
  console,
  setTimeout:(fn,d)=>{ if(typeof fn==='function') fn(); },
  localStorage:{getItem:(k)=>storage.has(k)?storage.get(k):null,setItem:(k,v)=>storage.set(k,String(v))},
  document:{
    documentElement:{lang:'zh-CN'},
    getElementById:(id)=>id==='habitHubView'?hub:id==='habitWorkspace'?host:null,
    querySelector:()=>null,
    createElement:(tag)=>{ const el={tagName:tag,className:'',innerHTML:'',children:[],style:{},classList:{add(){},remove(){}},addEventListener(){},querySelector:()=>null,setAttribute(){}}; return el; },
    body:{appendChild(){}},
    addEventListener(){}
  },
  OneToneI18n:{getLang:()=> 'zh',t:(k,fb)=>fb||k},
  OneToneVoiceWake:{currentMode:()=> 'vosk'},
  OneToneSceneConfig:{
    globalWakePhrases:()=>['你好'],
    globalEndPhrases:()=>({zh:['结束'],en:['done']}),
    globalVoiceTargetKey:()=> 'RAlt'
  },
  OneToneState:{
    state:{selectedMappingId:'app-1',config:{activeSceneId:'base',mappings:[
      {id:'base',group:'通用设置',enabled:true,triggerKey:'F8',targetKey:'RAlt',triggerMode:'tap',autoEnterEnabled:true,cancelEnabled:true},
      {id:'app-1',group:'Cursor 专注写作',appTargetId:'cursor-chat',enabled:true,keyModeEnabled:true,voiceModeEnabled:false,triggerKey:'F9',targetKey:'Enter'}
    ]}},
    ui:{habitExperienceMode:null,habitWorkspaceChannel:'key',habitWorkspaceItemId:'key-main',habitProgramSection:'scope',habitNoviceDim:'key',habitNoviceScene:'begin',habitWorkspaceScrollTop:0,habitWorkspaceFocusSelector:''}
  },
  OneToneMappingCore:{byId(id){return context.OneToneState.state.config.mappings.find((m)=>m.id===id)||null;}},
  OneToneAppBehaviorRules:{appDisplayName:(id)=>id==='cursor-chat'?'Cursor':id},
  OneToneHabitProfile:{habitDisplayName:(m)=>m.group||m.id},
  OneToneAppTargetPresets:{presetById:()=>null},
  OneToneActionNav:{openChannelEditor:()=>{}}
};
context.globalThis=context;
vm.createContext(context);
for(const file of [
  'src/js/core/habit-experience-prefs.js',
  'src/js/core/habit-override-diff.js',
  'src/js/features/mapping/habit-shared.js',
  'src/js/features/mapping/habit-card-utils.js',
  'src/js/features/mapping/habit-novice-mode.js',
  'src/js/features/mapping/habit-workspace.js'
]){
  vm.runInContext(readFileSync(new URL('../'+file,import.meta.url),'utf8'),context,{filename:file});
}

const Prefs=context.OneToneHabitExperiencePrefs;
const Workspace=context.OneToneHabitWorkspace;
const Novice=context.OneToneHabitNoviceMode;

assert.equal(Prefs.getMode(),'novice','empty storage defaults to novice');

storage.clear();
vm.runInContext(readFileSync(new URL('../src/js/core/habit-experience-prefs.js',import.meta.url),'utf8'),context,{filename:'prefs2'});
const PrefsFresh=context.OneToneHabitExperiencePrefs;
Workspace.switchMode('programmer');
assert.equal(context.OneToneState.ui.habitProgrammerIntroOpen,true,'首次误入先显示说明');
assert.notEqual(context.OneToneState.ui.habitExperienceMode,'programmer','未确认不切换偏好');
PrefsFresh.markProgrammerIntroSeen();
Workspace.switchMode('programmer',true);

const model=Workspace.buildWorkspaceModel();
context.OneToneState.ui.habitExperienceMode='novice';
Workspace.render();
assert.match(host.innerHTML,/data-habit-mode="novice"/,'mode bar has novice');
assert.match(host.innerHTML,/habit-novice-card/,'novice renders big cards');
assert.match(host.innerHTML,/habit-novice-inherit-hint/,'novice renders inherit hint');
assert.match(host.innerHTML,/habit-novice-viz/,'novice renders channel viz');
assert.match(host.innerHTML,/habit-ws-viz-key-svg/,'novice key viz uses svg');

const before=model.mapping.id;
Workspace.switchMode('quick');
assert.equal(context.OneToneState.state.selectedMappingId,before,'mode switch keeps selected mapping');
assert.match(host.innerHTML,/habit-ws-rules/,'quick mode renders rules list');
assert.match(host.innerHTML,/habit-ws-inherit-chain/,'quick mode renders inherit chain');
assert.match(host.innerHTML,/is-overridden/,'quick mode shows override tags');

const demoSteps=context.OneToneHabitCardUtils.buildDemo({detail:{when:'F9',what:'test'}});
assert.equal(demoSteps.length,2,'demo fallback never empty');

console.log('[habit-novice] assertions passed');
