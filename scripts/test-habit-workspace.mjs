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
    ui:{habitExperienceMode:null,habitWorkspaceChannel:'key',habitWorkspaceItemId:'key-main',habitProgramSection:'scope',habitWorkspaceAdvancedOpen:false,habitNoviceDim:'key',habitNoviceScene:'begin',habitWorkspaceScrollTop:0,habitWorkspaceFocusSelector:''}
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

Workspace.switchMode('programmer');
assert.equal(Prefs.getMode(),'quick','stored programmer migrates to quick');

const exported=context.OneToneHabitShared.exportMappingJson(quick.mapping);
assert.equal(exported.kind,'onetone-habit-mapping');
assert.equal(exported.mapping.id,'app-1');

const scrollBefore=42;
host.querySelector=()=>({scrollTop:scrollBefore});
Workspace.switchMode('quick');
assert.equal(context.OneToneState.ui.habitWorkspaceScrollTop,scrollBefore,'mode switch captures scroll');

Workspace.restoreReturnContext({mappingId:'app-1',channel:'camera',itemId:'camera-blink',mode:'programmer',sectionId:'safety'});
assert.equal(context.OneToneState.ui.habitExperienceMode,'quick','programmer return maps to quick');
assert.equal(context.OneToneState.ui.habitWorkspaceAdvancedOpen,true,'programmer return opens advanced panel');
assert.equal(context.OneToneState.ui.habitWorkspaceChannel,'camera');
assert.equal(context.OneToneState.ui.habitWorkspaceItemId,'camera-blink');
assert.equal(context.OneToneState.ui.habitProgramSection,'safety');
assert.equal(context.OneToneState.state.config.activeSceneId,'base','编辑定位不得修改正在使用的习惯');

context.OneToneState.ui.habitExperienceMode='quick';
context.OneToneState.ui.habitWorkspaceChannel='all';
context.OneToneState.ui.habitWorkspaceItemId='key-main';
context.OneToneState.ui.habitWorkspaceAdvancedOpen=false;
host.__habitNoviceBound=false;
Workspace.render();
assert.equal(/data-habit-mode="programmer"/.test(host.innerHTML),false,'no programmer mode tab');
assert.match(host.innerHTML,/habit-ws-advanced/,'quick mode has advanced panel shell');
assert.match(host.innerHTML,/data-habit-fine/,'rules head links to advanced panel');
assert.equal(/habit-ws-advanced is-open/.test(host.innerHTML),false,'advanced panel collapsed by default');
assert.match(host.innerHTML,/habit-ws-ch-tabs/,'通道 tab 使用下划线样式');
assert.match(host.innerHTML,/habit-ws-ch-tab is-active/,'选中通道为下划线 tab');
assert.match(host.innerHTML,/habit-ws-page-bar/,'quick mode renders page indicator');
assert.match(host.innerHTML,/habit-ws-key-card/,'quick mode renders stream deck key cards');
assert.match(host.innerHTML,/habit-ws-rule-accent/,'rule rows have channel accent');
assert.equal(/pref-segmented is-wide habit-ws-channels/.test(host.innerHTML),false,'不再使用 segmented 通道栏');
assert.equal(/<select[^>]*data-habit-item/.test(host.innerHTML),false,'不再使用场景下拉');
assert.match(host.innerHTML,/habit-ws-rules/,'quick mode renders rules list');
assert.match(host.innerHTML,/habit-ws-viz/,'quick mode renders channel viz');
assert.match(host.innerHTML,/habit-ws-inherit-chain/,'quick mode renders inherit chain');
assert.equal(/habit-novice-card/.test(host.innerHTML),false,'quick mode has no story cards');
assert.equal(/data-habit-novice-demo/.test(host.innerHTML),false,'quick mode has no try-demo buttons');
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
fire({'data-habit-rule-toggle':'app-1::key::key-main'});
assert.equal(context.OneToneState.ui.habitWorkspaceRuleOpen,'app-1::key::key-main','rule row toggles peek');
assert.equal(openedEditor,null,'rule toggle must not open editor');
host.__habitWorkspaceBound=false;
Workspace.render();
assert.match(host.innerHTML,/怎么触发/,'peek uses human trigger label');
assert.equal(/<b>1<\/b>/.test(host.innerHTML),false,'peek must not use numbered circles');
fire({'data-habit-fine':''});
assert.equal(context.OneToneState.ui.habitWorkspaceAdvancedOpen,true,'fine link opens advanced panel');
host.__habitWorkspaceBound=false;
Workspace.render();
assert.match(host.innerHTML,/habit-ws-advanced is-open/,'advanced panel expands after fine link');

fire({'data-habit-edit':'','data-channel':'key','data-focus':'trigger'});
assert.equal(openedEditor&&openedEditor.channel,'key','只有修改才跳转编辑');
assert.equal(openedEditor&&openedEditor.returnContext&&openedEditor.returnContext.itemId,'key-main','返回上下文保留 item');

// Channel tab must not open editors (hub used to catch data-habit-channel and jump).
openedEditor=null;
fire({'data-habit-channel':'voice'});
assert.equal(context.OneToneState.ui.habitWorkspaceChannel,'voice','通道 tab 只页内切换');
assert.equal(openedEditor,null,'通道 tab 不得打开编辑页');

console.log('[habit-workspace] assertions passed');
