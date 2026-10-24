/**
 * Former novice-mode tests — locator shell replaces dual mode.
 * Kept filename so existing npm scripts / docs that name it still run.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const storage=new Map();
const host={
  id:'habitWorkspace',
  className:'habit-workspace',
  innerHTML:'',
  __habitWorkspaceBound:false,
  setAttribute(){},
  addEventListener(type,fn){ this._listeners=this._listeners||{}; this._listeners[type]=fn; },
  querySelector(){ return null; }
};
const hub={querySelector:(sel)=>(sel==='.habit-hub-toolbar'||sel==='.habit-hub-body')?{hidden:false}:null};
const context={
  console,
  setTimeout:(fn)=>{ if(typeof fn==='function') fn(); },
  localStorage:{getItem:(k)=>storage.has(k)?storage.get(k):null,setItem:(k,v)=>storage.set(k,String(v))},
  document:{
    documentElement:{lang:'zh-CN'},
    getElementById:(id)=>id==='habitHubView'?hub:id==='habitWorkspace'?host:null,
    querySelector:()=>null,
    addEventListener(){}
  },
  OneToneI18n:{getLang:()=> 'zh',t:(k,fb)=>fb||k},
  OneToneVoiceWake:{currentMode:()=> 'vosk'},
  OneToneSceneConfig:{
    globalWakePhrases:()=>['你好'],
    globalEndPhrases:()=>({zh:['结束'],en:['done']}),
    globalVoiceTargetKey:()=> 'RAlt'
  },
  OneToneHabitActionStats:{headKpiHtml:()=>'',isFresh:()=>true,fetch:()=>Promise.resolve()},
  OneToneState:{
    state:{selectedMappingId:'app-1',config:{activeSceneId:'base',cameraPrefs:{presenceActions:{enabled:false,triggers:{}}},mappings:[
      {id:'base',group:'通用设置',enabled:true,triggerKey:'F8',targetKey:'RAlt',triggerMode:'tap',autoEnterEnabled:true,cancelEnabled:true},
      {id:'app-1',group:'Cursor 专注写作',appTargetId:'cursor-chat',enabled:true,keyModeEnabled:true,voiceModeEnabled:false,triggerKey:'F9',targetKey:'Enter'}
    ]}},
    ui:{habitExperienceMode:null,habitWorkspaceChannel:'key',habitWorkspaceItemId:'key-main',habitProgramSection:'scope',habitWorkspaceScrollTop:0}
  },
  OneToneMappingCore:{byId(id){return context.OneToneState.state.config.mappings.find((m)=>m.id===id)||null;}},
  OneToneAppBehaviorRules:{appDisplayName:(id)=>id==='cursor-chat'?'Cursor':id,isIncompleteCustomStub:()=>false},
  OneToneHabitProfile:{habitDisplayName:(m)=>m.group||m.id},
  OneToneAppTargetPresets:{presetById:()=>null},
  OneToneActionNav:{openChannelEditor:()=>{}}
};
context.globalThis=context;
context.window=context;
vm.createContext(context);
for(const file of [
  'src/js/core/habit-experience-prefs.js',
  'src/js/core/habit-override-diff.js',
  'src/js/features/mapping/habit-shared.js',
  'src/js/features/mapping/habit-channel-snapshot.js',
  'src/js/features/mapping/habit-workspace.js'
]){
  vm.runInContext(readFileSync(new URL('../'+file,import.meta.url),'utf8'),context,{filename:file});
}

const Prefs=context.OneToneHabitExperiencePrefs;
const Workspace=context.OneToneHabitWorkspace;

assert.equal(Prefs.getMode(),'locator');
Workspace.switchMode('novice');
assert.equal(Prefs.getMode(),'locator');
assert.equal(context.OneToneState.ui.habitExperienceMode,'locator');

Workspace.render();
assert.equal(/data-habit-mode=/.test(host.innerHTML),false,'no modebar');
assert.equal(/habit-novice-card/.test(host.innerHTML),false,'novice cards gone');
assert.equal(/data-habit-novice-demo/.test(host.innerHTML),false,'novice demo gone');
assert.match(host.innerHTML,/habit-locator-boards/,'locator boards present');
assert.match(host.innerHTML,/habit-ws-layout habit-locator/,'locator layout class');

const before=context.OneToneState.state.selectedMappingId;
Workspace.switchMode('quick');
assert.equal(context.OneToneState.state.selectedMappingId,before,'mode switch keeps selection');
assert.equal(context.OneToneState.ui.habitExperienceMode,'locator');

console.log('[habit-novice→locator] assertions passed');
