import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const storage=new Map();
const context={
  console,
  setTimeout:(fn)=>fn(),
  localStorage:{getItem:(k)=>storage.has(k)?storage.get(k):null,setItem:(k,v)=>storage.set(k,String(v))},
  document:{documentElement:{lang:'zh-CN'},getElementById:()=>null,querySelector:()=>null},
  OneToneI18n:{getLang:()=> 'zh'},
  OneToneVoiceWake:{currentMode:()=> 'vosk'},
  OneToneSceneConfig:{
    globalWakePhrases:()=>['你好'],
    globalEndPhrases:()=>({zh:['结束'],en:['done']}),
    globalVoiceTargetKey:()=> 'RAlt'
  },
  OneToneState:{
    state:{selectedMappingId:'app-1',config:{activeSceneId:'base',cameraPrefs:{presenceActions:{enabled:true,triggers:{blink:true},deliberateBlink:'pressCtrlI'}},mappings:[
      {id:'base',group:'通用设置',enabled:true,keyModeEnabled:true,voiceModeEnabled:true,triggerKey:'F8',targetKey:'RAlt',triggerMode:'tap',autoEnterEnabled:true,cancelEnabled:true},
      {id:'app-1',group:'Cursor 专注写作',appTargetId:'cursor',enabled:true,keyModeEnabled:true,voiceModeEnabled:false,triggerKey:'F9',targetKey:'Enter',voiceOverride:{wakePhrases:['开始写作']},cameraOverride:{triggers:{blink:true},deliberateBlink:'pressCtrlI'},codexMicroPad:{enabled:true,layoutProfile:'beginner',keys:[{id:'1'}]}}
    ]}},
    ui:{habitExperienceMode:null,habitWorkspaceChannel:'key',habitWorkspaceItemId:'key-main',habitProgramSection:'scope'}
  },
  OneToneMappingCore:{byId(id){return context.OneToneState.state.config.mappings.find((m)=>m.id===id)||null;}},
  OneToneAppBehaviorRules:{appDisplayName:(id)=>id==='cursor'?'Cursor':id},
  OneToneHabitProfile:{habitDisplayName:(m)=>m.group||m.id}
};
context.globalThis=context;
vm.createContext(context);
for(const file of ['src/js/core/habit-experience-prefs.js','src/js/core/habit-override-diff.js','src/js/features/mapping/habit-workspace.js']){
  vm.runInContext(readFileSync(new URL('../'+file,import.meta.url),'utf8'),context,{filename:file});
}

const Prefs=context.OneToneHabitExperiencePrefs;
const Workspace=context.OneToneHabitWorkspace;
assert.equal(Prefs.getMode(),'quick','旧用户默认快速设置');
assert.equal(Prefs.hasSeenProgrammerIntro(),false);

const quick=Workspace.buildWorkspaceModel();
assert.equal(quick.mapping.id,'app-1');
assert.equal(quick.channel,'key');
assert.equal(quick.detail.when.includes('F9'),true,'快速视图读取真实按键');
assert.equal(quick.channels.voice.enabled,false,'通道关闭状态来自同一 MappingEntry');
assert.equal(quick.groups.safety.some((row)=>row.source.id==='global'),true,'设备参数明确标为 global');

Workspace.switchMode('programmer');
assert.equal(context.OneToneState.ui.habitProgrammerIntroOpen,true,'首次误入先显示说明');
assert.notEqual(context.OneToneState.ui.habitExperienceMode,'programmer','未确认不切换偏好');
Prefs.markProgrammerIntroSeen();
Workspace.switchMode('programmer',true);
assert.equal(Prefs.getMode(),'programmer');

Workspace.restoreReturnContext({mappingId:'app-1',channel:'camera',itemId:'camera-blink',mode:'programmer',sectionId:'safety'});
assert.equal(context.OneToneState.ui.habitWorkspaceChannel,'camera');
assert.equal(context.OneToneState.ui.habitWorkspaceItemId,'camera-blink');
assert.equal(context.OneToneState.ui.habitProgramSection,'safety');
assert.equal(context.OneToneState.state.config.activeSceneId,'base','编辑定位不得修改正在使用的习惯');

console.log('[habit-workspace] 12 assertions passed');
