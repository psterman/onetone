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
  querySelector(sel){
    if(String(sel).indexOf('habit-ws-main')>=0||String(sel).indexOf('habit-locator')>=0) return {scrollTop:42};
    if(String(sel).indexOf('data-habit-search')>=0) return {focus(){},setSelectionRange(){}};
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
  OneToneI18n:{getLang:()=> 'zh',t:(k,fb)=>fb||k},
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
  OneToneHabitActionStats:{
    headKpiHtml:(id)=>'<div class="habit-locator-usage" data-kpi="'+id+'"><span class="habit-locator-status-tag">近 7 天用了 3 次</span><button type="button" class="habit-locator-status-tag is-action" data-habit-usage-peek="'+id+'">查看记录</button><button type="button" class="habit-locator-status-tag is-action" data-habit-usage-export="'+id+'">导出文档</button></div>',
    isFresh:()=>true,
    fetch:()=>Promise.resolve()
  },
  OneToneState:{
    state:{selectedMappingId:'app-1',config:{activeSceneId:'base',cameraPrefs:{presenceActions:{enabled:true,triggers:{blink:true,away:false,shake:false,fist:false,openPalm:false,okHand:false,wave:false},deliberateBlink:'pressCtrlI',onAway:'none',onReturn:'none'}},mappings:[
      {id:'base',group:'通用设置',enabled:true,keyModeEnabled:true,voiceModeEnabled:true,triggerKey:'F8',targetKey:'RAlt',triggerMode:'tap',autoEnterEnabled:true,cancelEnabled:true},
      {id:'app-1',group:'Cursor 专注写作',appTargetId:'cursor-chat',enabled:true,keyModeEnabled:true,voiceModeEnabled:true,triggerKey:'F9',targetKey:'Enter',voiceOverride:{wakePhrases:['开始写作']},cameraOverride:{triggers:{blink:true},deliberateBlink:'pressCtrlI'},codexMicroPad:{enabled:true,layoutProfile:'beginner',keys:[{id:'1',slotId:'semantic:softPad:send',microKeyId:'ACT10',enabled:true},{id:'2',enabled:true},{id:'3',slotId:'x',enabled:false}]}}
    ]}},
    ui:{habitExperienceMode:null,habitWorkspaceChannel:'key',habitWorkspaceItemId:'key-main',habitProgramSection:'scope',habitWorkspaceAdvancedOpen:false,habitWorkspaceScrollTop:0}
  },
  OneToneMappingCore:{byId(id){return context.OneToneState.state.config.mappings.find((m)=>m.id===id)||null;}},
  OneToneAppBehaviorRules:{
    appDisplayName:(id)=>id==='cursor-chat'?'Cursor':id,
    isIncompleteCustomStub:()=>false
  },
  OneToneHabitProfile:{habitDisplayName:(m)=>m.group||m.id}
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
const Snap=context.OneToneHabitChannelSnapshot;

assert.equal(Prefs.getMode(),'locator','prefs fixed to locator');
assert.equal(Prefs.setMode('novice'),'locator','setMode is no-op to locator');

const model=Workspace.buildWorkspaceModel();
assert.equal(model.mapping.id,'app-1');
assert.equal(model.mode,'locator');

Workspace.render();
assert.equal(/data-habit-mode=/.test(host.innerHTML),false,'no modebar');
assert.equal(/habit-novice-card/.test(host.innerHTML),false,'no novice cards');
assert.equal(/habit-ws-ch-tabs/.test(host.innerHTML),false,'no quick channel tabs');
assert.match(host.innerHTML,/habit-locator-boards/,'locator four boards');
assert.match(host.innerHTML,/data-ch="key"/,'key board');
assert.match(host.innerHTML,/data-ch="voice"/,'voice board');
assert.match(host.innerHTML,/data-ch="cam"/,'cam board');
assert.match(host.innerHTML,/data-ch="pad"/,'pad board');
assert.match(host.innerHTML,/habit-ws-row-tools[\s\S]*data-habit-enable="app-1"/,'enable toggle beside sidebar delete');
assert.match(host.innerHTML,/habit-ws-row-tools[\s\S]*data-habit-del="app-1"/,'delete with enable in sidebar tools');
assert.equal(/habit-locator-hero[\s\S]*data-habit-enable=/.test(host.innerHTML),false,'enable not in hero');
assert.match(host.innerHTML,/data-habit-scenario-use="app-1"/,'set-active only when not in use');
assert.equal(/habit-locator-hdr[\s\S]*data-habit-del=/.test(host.innerHTML),false,'delete not in detail header');
assert.equal(/habit-ws-truth-cell/.test(host.innerHTML),false,'no tall FG dual-cell card');
assert.equal(/正在编辑此前台习惯/.test(host.innerHTML),false,'no duplicate editing copy in FG strip');
assert.match(host.innerHTML,/habit-locator-hero[\s\S]*habit-locator-usage/,'title + usage share one hero card');
assert.match(host.innerHTML,/habit-locator-status-tag/,'usage as status tags');
assert.match(host.innerHTML,/data-habit-usage-peek=/,'view log wired');
assert.match(host.innerHTML,/data-habit-usage-export=/,'export wired');
assert.match(host.innerHTML,/data-kpi="app-1"/,'KPI mounted once');
assert.equal((host.innerHTML.match(/data-kpi=/g)||[]).length,1,'KPI not duplicated');
assert.equal(/habit-locator-usage-kicker/.test(host.innerHTML),false,'no heavy 最近使用 kicker');
assert.match(host.innerHTML,/data-habit-scope=/,'sidebar groups by scope');
assert.match(host.innerHTML,/icons\/app-target\/cursor\.png/,'app icon in sidebar');
assert.match(host.innerHTML,/habit-locator-sub/,'subtitle present');
assert.equal(/Cursor · Cursor/.test(host.innerHTML),false,'subtitle must not repeat app · habit title');
assert.equal(/已启用/.test(host.innerHTML),false,'no redundant enabled text beside toggle');

// When mapping is active: live-dot only (no visible 正在使用 label), no set-use button
context.OneToneState.state.config.activeSceneId='app-1';
host.__habitWorkspaceBound=false;
Workspace.render();
assert.match(host.innerHTML,/habit-locator-live-dot/,'active shown as live-dot');
assert.equal(/>正在使用</.test(host.innerHTML),false,'no visible 正在使用 text label');
assert.equal(/data-habit-scenario-use=/.test(host.innerHTML),false,'no set-use when already active');
context.OneToneState.state.config.activeSceneId='base';
host.__habitWorkspaceBound=false;
Workspace.render();

const snap=Snap.make(model.mapping,context.OneToneState.state.config,'zh');
assert.equal(snap.channels.key.tone,'ready');
assert.ok(snap.channels.pad.actions.length===1,'pad only counts bound enabled keys');

openedEditor=null;
const click=host._listeners&&host._listeners.click;
assert.equal(typeof click,'function','click bound');
function fire(attrs){
  var node={
    hasAttribute:(a)=>Object.prototype.hasOwnProperty.call(attrs,a),
    getAttribute:(a)=>Object.prototype.hasOwnProperty.call(attrs,a)?attrs[a]:null,
    closest:function(sel){
      if(!sel) return null;
      var s=String(sel);
      if(s.indexOf('data-habit-enable')>=0) return null;
      if(s.indexOf('data-nav-scene')>=0||s.indexOf('button')>=0||s.indexOf('data-habit')>=0) return node;
      return null;
    }
  };
  click({stopPropagation(){},target:node});
}

fire({'data-nav-scene':'key','data-nav-action':'keys.trigger'});
assert.equal(openedEditor&&openedEditor.channel,'key');
assert.equal(openedEditor&&openedEditor.focusId,'trigger');
assert.equal(openedEditor&&openedEditor.mappingId,'app-1');
assert.equal(openedEditor&&openedEditor.returnContext&&openedEditor.returnContext.mode,'locator');

openedEditor=null;
fire({'data-nav-scene':'voice','data-nav-action':'voice.wake.0'});
assert.equal(openedEditor&&openedEditor.channel,'voice');
assert.equal(openedEditor&&openedEditor.focusId,'wakePhrases');

openedEditor=null;
fire({'data-nav-scene':'cam','data-nav-action':'cam.blink'});
assert.equal(openedEditor&&openedEditor.channel,'camera');
assert.equal(openedEditor&&openedEditor.focusId,'cameraPresence');

openedEditor=null;
fire({'data-nav-scene':'pad','data-nav-action':''});
assert.equal(openedEditor&&openedEditor.channel,'softPad');
assert.equal(openedEditor&&openedEditor.focusId,'softPadLayout');

Workspace.restoreReturnContext({mappingId:'app-1',channel:'camera',itemId:'camera-blink',mode:'programmer',sectionId:'safety'});
assert.equal(context.OneToneState.ui.habitExperienceMode,'locator','old modes normalize to locator');
assert.equal(context.OneToneState.state.selectedMappingId,'app-1');
assert.equal(context.OneToneState.state.config.activeSceneId,'base','edit focus must not change active');

// baseline: no delete control in sidebar
context.OneToneState.state.selectedMappingId='base';
host.__habitWorkspaceBound=false;
Workspace.render();
assert.equal(/data-habit-del="base"/.test(host.innerHTML),false,'baseline has no sidebar delete');

const indexHtml=readFileSync(new URL('../src/index.html',import.meta.url),'utf8');
assert.equal(/habit-novice-mode\.js/.test(indexHtml),false,'novice script removed from index');
assert.match(indexHtml,/habit-channel-snapshot\.js/,'snapshot script in index');

console.log('[habit-workspace] locator assertions passed');
