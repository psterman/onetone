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
    if(String(sel).indexOf('habit-ws-main')>=0||String(sel).indexOf('habit-novice-main')>=0) return {scrollTop:42};
    return null;
  }
};
const hub={
  querySelector(sel){
    if(sel==='.habit-hub-toolbar'||sel==='.habit-hub-body') return {hidden:false};
    return null;
  }
};
let openedEditor=null;
const context={
  console,
  setTimeout:(fn)=>fn(),
  localStorage:{getItem:(k)=>storage.has(k)?storage.get(k):null,setItem:(k,v)=>storage.set(k,String(v))},
  document:{
    documentElement:{lang:'zh-CN'},
    getElementById:(id)=>id==='habitHubView'?hub:id==='habitWorkspace'?host:id==='settingsPanelWrap'?null:null,
    querySelector:()=>null,
    addEventListener(){}
  },
  OneToneI18n:{getLang:()=> 'zh'},
  OneToneVoiceWake:{currentMode:()=> 'vosk'},
  OneToneSceneConfig:{
    globalWakePhrases:()=>['你好'],
    globalEndPhrases:()=>({zh:['结束'],en:['done']}),
    globalVoiceTargetKey:()=> 'RAlt'
  },
  OneToneAppTargetPresets:{
    presetById:(id)=>id==='cursor-chat'?{id:'cursor-chat',icon:'icons/app-target/cursor.png'}:null
  },
  OneToneActionNav:{
    openChannelEditor:(opts)=>{ openedEditor=opts; }
  },
  OneToneState:{
    state:{selectedMappingId:'app-1',config:{activeSceneId:'base',cameraPrefs:{presenceActions:{enabled:true,triggers:{blink:true},deliberateBlink:'pressCtrlI'}},mappings:[
      {id:'base',group:'通用设置',enabled:true,keyModeEnabled:true,voiceModeEnabled:true,triggerKey:'F8',targetKey:'RAlt',triggerMode:'tap',autoEnterEnabled:true,cancelEnabled:true},
      {id:'app-1',group:'Cursor 专注写作',appTargetId:'cursor-chat',enabled:true,keyModeEnabled:true,voiceModeEnabled:false,triggerKey:'F9',targetKey:'Enter',voiceOverride:{wakePhrases:['开始写作']},cameraOverride:{triggers:{blink:true},deliberateBlink:'pressCtrlI'},codexMicroPad:{enabled:true,layoutProfile:'beginner',keys:[{id:'1'}]}}
    ]}},
    ui:{habitExperienceMode:null,habitWorkspaceChannel:'key',habitWorkspaceItemId:'key-main',habitProgramSection:'scope',habitNoviceDim:'key',habitNoviceScene:'begin',habitWorkspaceScrollTop:0,habitWorkspaceFocusSelector:''}
  },
  OneToneMappingCore:{byId(id){return context.OneToneState.state.config.mappings.find((m)=>m.id===id)||null;}},
  OneToneAppBehaviorRules:{appDisplayName:(id)=>id==='cursor-chat'?'Cursor':id},
  OneToneHabitProfile:{habitDisplayName:(m)=>m.group||m.id}
};
context.globalThis=context;
vm.createContext(context);
for(const file of ['src/js/core/habit-experience-prefs.js','src/js/core/habit-override-diff.js','src/js/features/mapping/habit-shared.js','src/js/features/mapping/habit-card-utils.js','src/js/features/mapping/habit-novice-mode.js','src/js/features/mapping/habit-workspace.js']){
  vm.runInContext(readFileSync(new URL('../'+file,import.meta.url),'utf8'),context,{filename:file});
}

const Prefs=context.OneToneHabitExperiencePrefs;
const Workspace=context.OneToneHabitWorkspace;
assert.equal(Prefs.getMode(),'novice','empty storage defaults to novice');
assert.equal(Prefs.hasSeenProgrammerIntro(),false);
Prefs.markProgrammerIntroSeen();
context.OneToneState.ui.habitExperienceMode='quick';

const quick=Workspace.buildWorkspaceModel();
assert.equal(quick.mapping.id,'app-1');
assert.equal(quick.channel,'key');
assert.equal(quick.detail.when.includes('F9'),true,'快速视图读取真实按键');
assert.equal(quick.channels.voice.enabled,false,'通道关闭状态来自同一 MappingEntry');
assert.equal(quick.groups.safety.some((row)=>row.source.id==='global'),true,'设备参数明确标为 global');

Workspace.switchMode('programmer',true);
assert.equal(Prefs.getMode(),'programmer');

const scrollBefore=42;
host.querySelector=()=>({scrollTop:scrollBefore});
Workspace.switchMode('quick');
assert.equal(context.OneToneState.ui.habitWorkspaceScrollTop,scrollBefore,'mode switch captures scroll');

Workspace.restoreReturnContext({mappingId:'app-1',channel:'camera',itemId:'camera-blink',mode:'programmer',sectionId:'safety'});
assert.equal(context.OneToneState.ui.habitWorkspaceChannel,'camera');
assert.equal(context.OneToneState.ui.habitWorkspaceItemId,'camera-blink');
assert.equal(context.OneToneState.ui.habitProgramSection,'safety');
assert.equal(context.OneToneState.state.config.activeSceneId,'base','编辑定位不得修改正在使用的习惯');

context.OneToneState.ui.habitExperienceMode='quick';
context.OneToneState.ui.habitWorkspaceChannel='key';
context.OneToneState.ui.habitWorkspaceItemId='key-main';
context.OneToneState.ui.habitProgrammerIntroOpen=false;
host.__habitNoviceBound=false;
Workspace.render();
assert.match(host.innerHTML,/pref-segmented is-wide habit-ws-channels/,'通道 tab 使用主题 segmented');
assert.match(host.innerHTML,/pref-segmented-btn habit-ws-channel is-active/,'选中通道为白底 segmented');
assert.equal(/<select[^>]*data-habit-item/.test(host.innerHTML),false,'不再使用场景下拉');
assert.match(host.innerHTML,/icons\/app-target\/cursor\.png/,'官方应用图标');
assert.match(host.innerHTML,/∞/,'通用设置字母/∞ fallback 仍存在于列表');

openedEditor=null;
const click=host._listeners&&host._listeners.click;
assert.equal(typeof click,'function','已绑定点击');
function fire(attrs){
  var node={
    hasAttribute:(a)=>Object.prototype.hasOwnProperty.call(attrs,a),
    getAttribute:(a)=>Object.prototype.hasOwnProperty.call(attrs,a)?attrs[a]:null,
    closest:function(sel){
      if(!sel) return null;
      if(sel.indexOf('button')>=0||sel.indexOf('data-habit')>=0) return node;
      return null;
    }
  };
  click({stopPropagation(){},target:node});
}
fire({'data-habit-item':'key-finish'});
assert.equal(context.OneToneState.ui.habitWorkspaceItemId,'key-finish','场景 subtab 只切换 item');
assert.equal(openedEditor,null,'场景切换不得打开编辑页');

fire({'data-habit-edit':'','data-channel':'key','data-focus':'trigger'});
assert.equal(openedEditor&&openedEditor.channel,'key','只有修改才跳转编辑');
assert.equal(openedEditor&&openedEditor.returnContext&&openedEditor.returnContext.itemId,'key-finish','返回上下文保留场景');

// Channel tab must not open editors (hub used to catch data-habit-channel and jump).
openedEditor=null;
fire({'data-habit-channel':'voice'});
assert.equal(context.OneToneState.ui.habitWorkspaceChannel,'voice','通道 tab 只页内切换');
assert.equal(openedEditor,null,'通道 tab 不得打开编辑页');

console.log('[habit-workspace] assertions passed');
