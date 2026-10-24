(function(global){
  'use strict';

  var CHANNELS=['key','voice','camera','softPad'];
  var QUICK_CHANNELS=['all','key','voice','camera','softPad'];
  var SECTIONS=['scope','trigger','action','safety','reuse'];
  var CAMERA_ITEMS=[
    {id:'camera-away',trigger:'away',action:'onAway',zh:'离开座位',en:'Away'},
    {id:'camera-return',trigger:'away',action:'onReturn',zh:'回到座位',en:'Return'},
    {id:'camera-shake',trigger:'shake',action:'shakeHead',zh:'摇头',en:'Shake head'},
    {id:'camera-blink',trigger:'blink',action:'deliberateBlink',zh:'刻意眨眼',en:'Deliberate blink'},
    {id:'camera-palm',trigger:'openPalm',action:'openPalm',zh:'张开手掌',en:'Open palm'},
    {id:'camera-ok',trigger:'okHand',action:'okHand',zh:'OK 手势',en:'OK hand'},
    {id:'camera-fist',trigger:'fist',action:'fist',zh:'握拳',en:'Fist'},
    {id:'camera-wave',trigger:'wave',action:'wave',zh:'挥手',en:'Wave'}
  ];

  var COPY={
    zh:{quick:'快速设置',recommended:'推荐',programmer:'程序员模式',backQuick:'返回快速设置',search:'搜索应用或场景…',universal:'通用设置',channels:{key:'按键',voice:'语音',camera:'摄像头',softPad:'Soft Pad'},enabled:'已启用',disabled:'已关闭',overrides:'{n} 项单独设置',inherited:'沿用通用',global:'全局设备设置',when:'什么时候触发',what:'会发生什么',status:'当前是否启用',change:'修改',fine:'包含 {n} 项精细设置',fineZero:'查看完整规则',scene:'使用场景',currentApp:'当前应用',addApp:'+ 新建应用场景',noHabit:'还没有可管理的习惯',noHabitDesc:'先新建应用场景，或在按键、语音页面保存一项设置。',introTitle:'程序员模式会展示完整真实参数',introBody:'进入页面不会改变任何设置。你会看到继承来源、设备级设置和执行细节，并且可以随时返回快速设置。',cancel:'留在快速设置',continue:'继续进入',summary:'完整规则摘要',scope:'适用范围',trigger:'触发方式',action:'执行动作与收尾',safety:'反馈与保护',reuse:'继承、能力绑定与复用',current:'当前值',source:'来源',edit:'更改',checkOk:'规则可运行',checkOff:'场景已关闭，不会触发',deviceGlobal:'摄像头识别阈值与设备校准由全局设备设置管理',rulePath:'{app} → {scene} → {trigger} → {action}',activeHabit:'正在使用',editingHabit:'正在编辑',notActive:'未设为当前使用习惯',allApps:'所有应用',foreground:'应用在前台时',anytime:'满足触发条件时',none:'未设置',on:'开启',off:'关闭'},
    en:{quick:'Quick settings',recommended:'Recommended',programmer:'Programmer mode',backQuick:'Back to quick settings',search:'Search apps or scenarios…',universal:'Universal settings',channels:{key:'Keys',voice:'Voice',camera:'Camera',softPad:'Soft Pad'},enabled:'Enabled',disabled:'Off',overrides:'{n} custom settings',inherited:'Uses universal',global:'Global device setting',when:'When it triggers',what:'What happens',status:'Current status',change:'Change',fine:'Includes {n} detailed settings',fineZero:'View full rule',scene:'Use case',currentApp:'Current app',addApp:'+ New app scenario',noHabit:'No habits to manage yet',noHabitDesc:'Create an app scenario, or save a key or voice setting first.',introTitle:'Programmer mode shows every real parameter',introBody:'Opening it changes nothing. You will see inheritance, device-level settings, and execution details, and can return to quick settings at any time.',cancel:'Stay in quick settings',continue:'Continue',summary:'Complete rule summary',scope:'Scope',trigger:'Trigger',action:'Action and finish',safety:'Feedback and protection',reuse:'Inheritance, bindings and reuse',current:'Current value',source:'Source',edit:'Change',checkOk:'Rule can run',checkOff:'Scenario is off and will not trigger',deviceGlobal:'Camera thresholds and calibration are managed in global device settings',rulePath:'{app} → {scene} → {trigger} → {action}',activeHabit:'In use',editingHabit:'Editing',notActive:'Not the active habit',allApps:'All apps',foreground:'When app is foreground',anytime:'When trigger conditions match',none:'Not set',on:'On',off:'Off'}
  };

  function state(){ return global.OneToneState&&global.OneToneState.state||{}; }
  function ui(){ return global.OneToneState&&global.OneToneState.ui||{}; }
  function cfg(){ return state().config||{}; }
  function prefs(){ return global.OneToneHabitExperiencePrefs; }
  function shared(){ return global.OneToneHabitShared; }
  function diff(){ return global.OneToneHabitOverrideDiff||{}; }
  function lang(){
    var value=global.OneToneI18n&&global.OneToneI18n.getLang?global.OneToneI18n.getLang():document.documentElement.lang;
    return String(value||'zh').toLowerCase().indexOf('en')===0?'en':'zh';
  }
  function c(key){ return COPY[lang()][key]; }
  function t(key,fb){
    try{
      var v=global.OneToneI18n&&global.OneToneI18n.t?global.OneToneI18n.t(key):key;
      if(v&&v!==key) return v;
    }catch(_){}
    return fb!=null?fb:key;
  }
  function esc(value){ return String(value==null?'':value).replace(/[&<>'"]/g,function(ch){ return {'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]; }); }
  function fmt(text,values){
    return String(text||'').replace(/\{(\w+)\}/g,function(_,key){ return values&&values[key]!=null?String(values[key]):''; });
  }
  function arr(value){ return Array.isArray(value)?value:[]; }
  function valueText(value){
    if(value==null||value==='') return c('none');
    if(Array.isArray(value)) return value.length?value.join(' / '):c('none');
    if(typeof value==='boolean') return value?c('on'):c('off');
    if(typeof value==='object') return JSON.stringify(value);
    return String(value);
  }
  function bundleText(value){
    value=value&&typeof value==='object'?value:{};
    return arr(value.zh).concat(arr(value.en)).join(' / ')||c('none');
  }
  function appName(m){
    if(!m) return '—';
    var id=String(m.appTargetId||'').trim();
    if(!id) return c('universal');
    var rules=global.OneToneAppBehaviorRules;
    return rules&&rules.appDisplayName?String(rules.appDisplayName(id)||id):id;
  }
  function sceneName(m){
    var hp=global.OneToneHabitProfile;
    return hp&&hp.habitDisplayName?hp.habitDisplayName(m):(String(m&&m.group||m&&m.label||m&&m.id||'—'));
  }
  function appIconHtml(m){
    var appId=String(m&&m.appTargetId||'').trim();
    var name=appName(m);
    var presets=global.OneToneAppTargetPresets;
    if(appId&&presets&&presets.presetById){
      var preset=presets.presetById(appId);
      if(preset&&preset.icon){
        return '<img class="habit-ws-app-icon habit-ws-app-icon--img" src="'+esc(preset.icon)+'" alt="" decoding="async" />';
      }
    }
    var rulesApi=global.OneToneAppBehaviorRules;
    var customs=rulesApi&&rulesApi.customRulesForMapping?rulesApi.customRulesForMapping(m):[];
    var rule=customs&&customs[0];
    if(rule){
      var url=String(rule.iconDataUrl||'').trim();
      if(!url&&rulesApi.ruleIconDataUrl) url=String(rulesApi.ruleIconDataUrl(rule)||'').trim();
      if(url){
        return '<img class="habit-ws-app-icon habit-ws-app-icon--img" src="'+esc(url)+'" alt="" decoding="async" />';
      }
    }
    var letter=!appId?'∞':(String(name||'').trim()[0]||'?').toUpperCase();
    return '<span class="habit-ws-app-icon" aria-hidden="true">'+esc(letter)+'</span>';
  }
  function mappings(){ return arr(cfg().mappings).filter(function(m){ return m&&m.id; }); }
  function byId(id){ return mappings().find(function(m){ return String(m.id)===String(id); })||null; }
  function isApp(m){ return !!(diff().isAppScenarioMapping&&diff().isAppScenarioMapping(m)); }
  function baseline(){ return diff().findGlobalBaselineMapping?diff().findGlobalBaselineMapping(cfg(),global.OneToneMappingCore):null; }

  function normalizeSelection(){
    var list=mappings();
    var selected=byId(state().selectedMappingId);
    if(!selected){
      selected=list.find(isApp)||baseline()||list[0]||null;
      state().selectedMappingId=selected?selected.id:null;
    }
    if(QUICK_CHANNELS.indexOf(ui().habitWorkspaceChannel)<0) ui().habitWorkspaceChannel='all';
    if(SECTIONS.indexOf(ui().habitProgramSection)<0) ui().habitProgramSection='scope';
    if(ui().habitWorkspaceChannel!=='all'&&!ui().habitWorkspaceItemId) ui().habitWorkspaceItemId=defaultItem(ui().habitWorkspaceChannel);
    return selected;
  }
  function fgIdentityKey(identity){
    if(!identity) return '';
    return String(identity.exeName||identity.exe_name||'')+'|'
      +String(identity.matchedPresetAppId||identity.matched_preset_app_id||identity.appId||'')+'|'
      +String(identity.fullPath||identity.full_path||'');
  }
  function fgDisplayName(identity){
    if(!identity) return '—';
    var name=String(identity.displayName||identity.display_name||'').trim();
    if(name) return name;
    var exe=String(identity.exeName||identity.exe_name||'').replace(/\.exe$/i,'');
    return exe||'—';
  }
  function loadHabitForeground(){
    var hub=global.OneToneHabitHub;
    if(hub&&typeof hub.loadHabitForeground==='function') return hub.loadHabitForeground();
    var invoke=global.OneToneIpc&&global.OneToneIpc.invoke;
    if(!invoke) return Promise.resolve(null);
    return invoke('cmd_habit_foreground_app',{}).catch(function(){ return null; }).then(function(held){
      var self=hub&&hub.isSelfForegroundIdentity;
      if(held&&(held.exeName||held.exe_name)&&!(self&&self(held))) return held;
      return invoke('cmd_foreground_app',{});
    });
  }
  /** Edit selection only — never touches activeSceneId / 正在使用. */
  function applyForegroundEditSelection(identity,force){
    var hub=global.OneToneHabitHub;
    var self=hub&&hub.isSelfForegroundIdentity;
    if(!identity||(self&&self(identity))){
      ui().habitWorkspaceFgIdentity=null;
      ui().habitWorkspaceFgHitId=null;
      return false;
    }
    ui().habitWorkspaceFgIdentity=identity;
    var hit=hub&&hub.findAppScenarioForIdentity?hub.findAppScenarioForIdentity(identity):null;
    ui().habitWorkspaceFgHitId=hit&&hit.id?String(hit.id):null;
    if(!hit||!hit.id) return false;
    if(!force&&ui().habitWorkspaceManualPick) return false;
    if(String(state().selectedMappingId||'')===String(hit.id)) return false;
    state().selectedMappingId=hit.id;
    ui().habitWorkspaceManualPick=false;
    return true;
  }
  function alignToForeground(opts){
    opts=opts||{};
    if(opts.force) ui().habitWorkspaceManualPick=false;
    if(ui().habitWorkspaceManualPick&&!opts.force){
      ui().habitWorkspaceFgReady=true;
      return Promise.resolve(false);
    }
    return loadHabitForeground().then(function(res){
      var prevKey=fgIdentityKey(ui().habitWorkspaceFgIdentity);
      var changed=applyForegroundEditSelection(res,!!opts.force);
      ui().habitWorkspaceFgReady=true;
      var nextKey=fgIdentityKey(ui().habitWorkspaceFgIdentity);
      if(changed||opts.force||prevKey!==nextKey){
        render({skipFgAlign:true,skipStatsFetch:opts.skipStatsFetch!==false});
      }
      if(opts.force&&!ui().habitWorkspaceFgHitId&&global.OneToneAppToast){
        global.OneToneAppToast.show(t('habitWsFgNoHabit','前台应用尚无习惯，可在左侧新建或切换查看'),'warn');
      }
      return changed;
    }).catch(function(){
      ui().habitWorkspaceFgReady=true;
      return false;
    });
  }
  function maybeAutoAlignForeground(opts){
    opts=opts||{};
    if(opts.skipFgAlign||ui().habitHubCreating||ui().habitWorkspaceFgReady||ui().habitWorkspaceManualPick) return;
    if(ui().habitWorkspaceFgAligning) return;
    ui().habitWorkspaceFgAligning=true;
    alignToForeground({skipStatsFetch:true}).then(function(){
      ui().habitWorkspaceFgAligning=false;
    },function(){
      ui().habitWorkspaceFgAligning=false;
    });
  }
  function defaultItem(channel){
    return channel==='voice'?'voice-wake':channel==='camera'?'camera-away':channel==='softPad'?'softpad-layout':'key-main';
  }
  function source(status){
    status=status==='overridden'||status==='global'||status==='disabled'?status:'inherited';
    return {id:status,label:status==='overridden'?fmt(c('overrides'),{n:1}):status==='global'?c('global'):status==='disabled'?c('disabled'):c('inherited')};
  }
  function sourceCount(status,count){
    if(status==='disabled') return source('disabled');
    if(status==='global') return source('global');
    if(count>0) return {id:'overridden',label:fmt(c('overrides'),{n:count})};
    return source('inherited');
  }
  function effectiveKey(m){
    var base=diff().getGlobalKeyBaseline?diff().getGlobalKeyBaseline(cfg(),global.OneToneMappingCore):{};
    return {
      triggerKey:String(m.triggerKey||base.triggerKey||''),
      targetKey:String(m.targetKey||base.targetKey||''),
      triggerMode:m.triggerMode||base.triggerMode||'tap',
      autoEnterEnabled:m.autoEnterEnabled==null?base.autoEnterEnabled:m.autoEnterEnabled,
      cancelEnabled:m.cancelEnabled==null?base.cancelEnabled:m.cancelEnabled,
      base:base
    };
  }
  function effectiveVoice(m){
    var base=diff().getGlobalVoiceBaseline?diff().getGlobalVoiceBaseline(cfg()):{};
    var ov=m.voiceOverride&&typeof m.voiceOverride==='object'?m.voiceOverride:{};
    return {
      targetKey:ov.targetKey||base.targetKey||'',
      wakePhrases:ov.wakePhrases||base.wakePhrases||[],
      endPhrases:ov.endPhrases||base.endPhrases||{zh:[],en:[]},
      cancelPhrases:ov.cancelPhrases||base.cancelPhrases||{zh:[],en:[]},
      sendPhrases:ov.sendPhrases||base.sendPhrases||{zh:[],en:[]},
      engine:ov.engine||base.engine||'off',
      modelPreset:ov.modelPreset||base.modelPreset||'',
      base:base,override:ov
    };
  }
  function globalCamera(){
    var cp=cfg().cameraPrefs||cfg().camera_prefs||{};
    return cp.presenceActions||cp.presence_actions||{};
  }
  function effectiveCamera(m,item){
    var base=globalCamera();
    var ov=m.cameraOverride&&typeof m.cameraOverride==='object'?m.cameraOverride:{};
    var otr=ov.triggers&&typeof ov.triggers==='object'?ov.triggers:{};
    var btr=base.triggers&&typeof base.triggers==='object'?base.triggers:{};
    var trigger=otr[item.trigger]!==undefined?!!otr[item.trigger]:!!btr[item.trigger];
    var action=ov[item.action]!=null&&String(ov[item.action]).trim()!==''?ov[item.action]:base[item.action];
    var overridden=otr[item.trigger]!==undefined||(ov[item.action]!=null&&String(ov[item.action]).trim()!=='');
    return {enabled:!!(base.enabled&&trigger&&m.enabled!==false),trigger:trigger,action:action||'none',source:overridden?'overridden':'inherited'};
  }
  function cameraItem(id){ return CAMERA_ITEMS.find(function(item){ return item.id===id; })||CAMERA_ITEMS[0]; }

  function quickItems(channel){
    if(channel==='voice') return [{id:'voice-wake',zh:'开始听写',en:'Start listening'},{id:'voice-end',zh:'结束听写',en:'Finish listening'},{id:'voice-cancel',zh:'取消本次输入',en:'Cancel input'},{id:'voice-send',zh:'发送内容',en:'Send content'},{id:'voice-engine',zh:'识别引擎',en:'Recognition engine'}];
    if(channel==='camera') return CAMERA_ITEMS;
    if(channel==='softPad') return [{id:'softpad-layout',zh:'键位与布局',en:'Keys and layout'},{id:'softpad-display',zh:'显示方式',en:'Display'},{id:'softpad-status',zh:'状态灯',en:'Status lights'}];
    return [{id:'key-main',zh:'启动输入',en:'Start input'},{id:'key-finish',zh:'结束与取消',en:'Finish and cancel'}];
  }
  function itemLabel(item){ return item?(lang()==='en'?item.en:item.zh):'—'; }

  function quickDetail(m,channel,itemId){
    var enabled=m.enabled!==false;
    if(channel==='key'){
      var k=effectiveKey(m);
      var ka=diff().getKeysAccessState?diff().getKeysAccessState(m,cfg(),global.OneToneMappingCore):{status:'inherited',overrideCount:0};
      enabled=enabled&&m.keyModeEnabled!==false;
      if(itemId==='key-finish') return {when:lang()==='en'?'After input completes':'输入完成后',what:(k.autoEnterEnabled?(lang()==='en'?'Send automatically':'自动发送'):(lang()==='en'?'Keep text for review':'保留文字等待确认'))+(k.cancelEnabled?(lang()==='en'?', cancel is available':'，可随时取消'):''),enabled:enabled,source:sourceCount(ka.status,ka.overrideCount),count:Math.max(ka.overrideCount||0,1),focus:'keyFinishFlow'};
      return {when:valueText(k.triggerKey)+' · '+valueText(k.triggerMode),what:(lang()==='en'?'Start input and route to ':'开始输入，发送到 ')+valueText(k.targetKey),enabled:enabled,source:sourceCount(ka.status,ka.overrideCount),count:Math.max(ka.overrideCount||0,1),focus:'trigger'};
    }
    if(channel==='voice'){
      var v=effectiveVoice(m);
      var va=diff().getVoiceAccessState?diff().getVoiceAccessState(m,cfg()):{status:'inherited',overrideCount:0};
      enabled=enabled&&m.voiceModeEnabled!==false;
      var common={enabled:enabled,source:sourceCount(va.status,va.overrideCount),count:Math.max(va.overrideCount||0,1)};
      if(itemId==='voice-end') return Object.assign(common,{when:bundleText(v.endPhrases),what:lang()==='en'?'Stop listening':'结束听写',focus:'endPhrases'});
      if(itemId==='voice-cancel') return Object.assign(common,{when:bundleText(v.cancelPhrases),what:lang()==='en'?'Discard this input':'取消并丢弃本次输入',focus:'endPhrases'});
      if(itemId==='voice-send') return Object.assign(common,{when:bundleText(v.sendPhrases),what:(lang()==='en'?'Send with ':'使用 ')+valueText(v.targetKey),focus:'endPhrases'});
      if(itemId==='voice-engine') return Object.assign(common,{when:lang()==='en'?'While voice recognition is active':'语音识别运行时',what:valueText(v.engine)+(v.modelPreset?' · '+v.modelPreset:''),focus:'engine'});
      return Object.assign(common,{when:valueText(v.wakePhrases),what:lang()==='en'?'Start listening':'开始听写',focus:'wakePhrases'});
    }
    if(channel==='camera'){
      var ci=cameraItem(itemId),cv=effectiveCamera(m,ci);
      return {when:itemLabel(ci),what:valueText(cv.action),enabled:cv.enabled,source:source(cv.source),count:cv.source==='overridden'?2:0,focus:'cameraPresence'};
    }
    var pad=m.codexMicroPad&&typeof m.codexMicroPad==='object'?m.codexMicroPad:{};
    enabled=enabled&&!!pad.enabled;
    var keys=arr(pad.keys),bindings=arr(m.agentBindings).filter(function(b){ return b&&b.triggerType==='softPad'&&b.enabled!==false; });
    if(itemId==='softpad-display') return {when:pad.requireForeground!==false?(lang()==='en'?'When the target app is foreground':'目标应用在前台时'):c('anytime'),what:(pad.overlayEnabled?c('on'):c('off'))+' · '+(pad.showNavigationPad===false?(lang()==='en'?'navigation hidden':'隐藏导航区'):(lang()==='en'?'navigation shown':'显示导航区')),enabled:enabled,source:source(pad.enabled?'overridden':'disabled'),count:2,focus:'softPadDisplay'};
    if(itemId==='softpad-status'){
      var lights=['codexStatusLightsEnabled','claudeStatusLightsEnabled','cursorStatusLightsEnabled','minimaxStatusLightsEnabled','workbuddyStatusLightsEnabled','traeStatusLightsEnabled','qoderStatusLightsEnabled'].filter(function(k){ return !!pad[k]; }).length;
      return {when:lang()==='en'?'When agent state changes':'Agent 状态变化时',what:lights?(lang()==='en'?lights+' status lights enabled':'已开启 '+lights+' 组状态灯'):c('disabled'),enabled:enabled&&lights>0,source:source(pad.enabled?'overridden':'disabled'),count:lights,focus:'softPadStatus'};
    }
    return {when:pad.requireForeground!==false?c('foreground'):c('anytime'),what:(pad.layoutProfile||'custom')+' · '+(lang()==='en'?keys.length+' key routes, '+bindings.length+' actions':keys.length+' 个键位路由，'+bindings.length+' 个动作'),enabled:enabled,source:source(pad.enabled?'overridden':'disabled'),count:keys.length+bindings.length,focus:'softPadLayout'};
  }

  function fieldRow(id,label,value,status,channel,focus){ return {id:id,label:label,value:valueText(value),source:source(status),channel:channel,focus:focus}; }
  function programmerGroups(m){
    var k=effectiveKey(m),v=effectiveVoice(m),ov=v.override,base=v.base;
    var kbase=k.base||{};
    var pad=m.codexMicroPad&&typeof m.codexMicroPad==='object'?m.codexMicroPad:{};
    var camera=m.cameraOverride&&typeof m.cameraOverride==='object'?m.cameraOverride:{};
    var bindings=arr(m.agentBindings);
    var ruleApps=arr(m.appBehaviorRules);
    function ks(field){ return diff().fieldKeyStatus?diff().fieldKeyStatus(field,m,kbase):'inherited'; }
    function vs(field){ return diff().fieldVoiceStatus?diff().fieldVoiceStatus(field,ov,base):'inherited'; }
    return {
      scope:[fieldRow('appTargetId',lang()==='en'?'Target app':'目标应用',m.appTargetId||c('allApps'),m.appTargetId?'overridden':'inherited','key','mappings'),fieldRow('appBehaviorRules',lang()==='en'?'App match rules':'应用匹配规则',ruleApps.length?(lang()==='en'?ruleApps.length+' rules':ruleApps.length+' 条规则'):c('none'),ruleApps.length?'overridden':'inherited','key','mappings'),fieldRow('enabled',lang()==='en'?'Scenario enabled':'场景启用',m.enabled!==false,m.enabled===false?'disabled':'overridden','key','mappings')],
      trigger:[fieldRow('triggerKey',lang()==='en'?'Trigger key':'触发按键',k.triggerKey,ks('triggerKey'),'key','trigger'),fieldRow('triggerMode',lang()==='en'?'Key trigger mode':'按键触发方式',k.triggerMode,ks('finish'),'key','trigger'),fieldRow('wakePhrases',lang()==='en'?'Wake phrases':'唤醒词',v.wakePhrases,vs('wakePhrases'),'voice','wakePhrases'),fieldRow('cameraTriggers',lang()==='en'?'Camera triggers':'摄像头触发开关',camera.triggers||c('inherited'),camera.triggers?'overridden':'inherited','camera','cameraPresence'),fieldRow('softPadRoutes',lang()==='en'?'Soft Pad routes':'Soft Pad 键位路由',arr(pad.keys).length?(lang()==='en'?arr(pad.keys).length+' routes':arr(pad.keys).length+' 条路由'):c('none'),pad.enabled?'overridden':'disabled','softPad','softPadLayout')],
      action:[fieldRow('targetKey',lang()==='en'?'Output key':'执行按键',k.targetKey,ks('targetKey'),'key','target'),fieldRow('voiceTargetKey',lang()==='en'?'Voice output key':'语音执行按键',v.targetKey,vs('targetKey'),'voice','endPhrases'),fieldRow('finish',lang()==='en'?'Finish behavior':'结束与收尾',(k.autoEnterEnabled?(lang()==='en'?'Auto send':'自动发送'):(lang()==='en'?'Keep text':'保留文字'))+' · '+(k.cancelEnabled?(lang()==='en'?'Cancelable':'可取消'):(lang()==='en'?'No cancel':'不可取消')),ks('finish'),'key','keyFinishFlow'),fieldRow('cameraActions',lang()==='en'?'Camera actions':'摄像头动作',Object.keys(camera).filter(function(x){ return x!=='triggers'; }).length?(lang()==='en'?'Configured':'已配置'):c('inherited'),Object.keys(camera).length?'overridden':'inherited','camera','cameraActions')],
      safety:[fieldRow('triggerDevice',lang()==='en'?'Input device':'输入设备',m.triggerDevice||c('global'),m.triggerDevice?'overridden':'global','key','trigger'),fieldRow('timing',lang()==='en'?'Long press / double click':'长按 / 双击阈值',(m.longPressMs||500)+' ms / '+(m.doubleClickMs||400)+' ms',(m.longPressMs||m.doubleClickMs)?'overridden':'inherited','key','trigger'),fieldRow('cameraThreshold',lang()==='en'?'Camera thresholds and calibration':'摄像头阈值与校准',c('deviceGlobal'),'global','camera','cameraPresence'),fieldRow('statusLights',lang()==='en'?'Soft Pad status feedback':'Soft Pad 状态反馈',pad.codexStatusLightsEnabled||pad.claudeStatusLightsEnabled||pad.cursorStatusLightsEnabled||pad.minimaxStatusLightsEnabled?c('on'):c('off'),pad.enabled?'overridden':'disabled','softPad','softPadStatus')],
      reuse:[fieldRow('keyInheritance',lang()==='en'?'Key inheritance':'按键继承',ks('triggerKey')==='inherited'&&ks('targetKey')==='inherited'?c('inherited'):c('overrides'),'inherited','key','trigger'),fieldRow('voiceInheritance',lang()==='en'?'Voice inheritance':'语音继承',Object.keys(ov).length?c('overrides'):c('inherited'),Object.keys(ov).length?'overridden':'inherited','voice','wakePhrases'),fieldRow('agentBindings',lang()==='en'?'Capability bindings':'能力绑定',bindings.length?(lang()==='en'?bindings.length+' bindings':bindings.length+' 个绑定'):c('none'),bindings.length?'overridden':'inherited',bindings[0]&&CHANNELS.indexOf(bindings[0].triggerType)>=0?bindings[0].triggerType:'softPad','softPadLayout'),fieldRow('agentTemplateId',lang()==='en'?'Reusable template':'复用模板',m.agentTemplateId||c('none'),m.agentTemplateId?'overridden':'inherited','softPad','softPadLayout')]
    };
  }

  function buildWorkspaceModel(){
    var m=normalizeSelection();
    if(!m) return {empty:true,mappings:[]};
    var channel=ui().habitWorkspaceChannel;
    var itemChannel=channel==='all'?'key':channel;
    var items=quickItems(itemChannel);
    var item=items.find(function(x){ return x.id===ui().habitWorkspaceItemId; });
    if(!item){ item=items[0]; ui().habitWorkspaceItemId=item.id; }
    var detail=quickDetail(m,itemChannel,item.id);
    var q={};
    CHANNELS.forEach(function(ch){
      var first=quickItems(ch)[0];
      var d=quickDetail(m,ch,first.id);
      q[ch]={enabled:d.enabled,count:d.count||0,source:d.source};
    });
    return {empty:false,mapping:m,mappings:mappings(),channel:channel,items:items,item:item,detail:detail,channels:q,groups:programmerGroups(m),mode:'locator',ruleRows:shared()&&shared().buildRuleRows?shared().buildRuleRows(m,{channel:channel}):[],inherit:shared()&&shared().inheritSummary?shared().inheritSummary(m):{overrideCount:0,inheritedCount:0,total:0}};
  }

  function ensureShell(){
    var hub=document.getElementById('habitHubView');
    if(!hub) return null;
    var host=document.getElementById('habitWorkspace');
    if(!host){
      host=document.createElement('section');
      host.id='habitWorkspace';
      host.className='habit-workspace';
      host.setAttribute('aria-live','polite');
      var head=hub.querySelector('.habit-hub-head');
      if(head&&head.parentNode) head.parentNode.insertBefore(host,head.nextSibling);
    }
    var oldToolbar=hub.querySelector('.habit-hub-toolbar');
    var oldBody=hub.querySelector('.habit-hub-body');
    var oldList=document.getElementById('habitHubList');
    if(oldToolbar) oldToolbar.hidden=true;
    if(oldBody) oldBody.hidden=true;
    if(oldList) oldList.hidden=true;
    return host;
  }
  function appListHtml(model){
    if(shared()&&shared().appListHtml) return shared().appListHtml(model,{variant:'ws'});
    var query=String(ui().habitWorkspaceSearch||'').trim().toLowerCase();
    var list=model.mappings.filter(function(m){ return !query||(appName(m)+' '+sceneName(m)).toLowerCase().indexOf(query)>=0; });
    return '<aside class="habit-ws-apps"><label class="habit-ws-search"><span aria-hidden="true">⌕</span><input type="search" data-habit-search value="'+esc(ui().habitWorkspaceSearch||'')+'" placeholder="'+esc(c('search'))+'" aria-label="'+esc(c('search'))+'"></label><div class="habit-ws-app-list" role="listbox">'+list.map(function(m){
      var selected=m.id===model.mapping.id;
      return '<button type="button" class="habit-ws-app'+(selected?' is-selected':'')+'" data-habit-mapping="'+esc(m.id)+'" role="option" aria-selected="'+(selected?'true':'false')+'">'+appIconHtml(m)+'<span class="habit-ws-app-copy"><strong>'+esc(appName(m))+'</strong><small>'+esc(sceneName(m))+'</small></span><span class="habit-ws-app-state '+(m.enabled===false?'is-off':'')+'">'+esc(m.enabled===false?c('disabled'):c('enabled'))+'</span></button>';
    }).join('')+'</div><button type="button" class="habit-ws-add" data-habit-add>'+esc(c('addApp'))+'</button></aside>';
  }
  function sceneTabsHtml(model){
    var d=model.detail;
    return '<div class="habit-ws-itembar"><div class="habit-ws-scene-tabs" role="tablist" aria-label="'+esc(c('scene'))+'"><span class="habit-ws-scene-label">'+esc(c('scene'))+'</span>'+model.items.map(function(item){
      var selected=item.id===model.item.id;
      return '<button type="button" role="tab" aria-selected="'+(selected?'true':'false')+'" class="habit-ws-scene-tab'+(selected?' is-active is-selected':'')+'" data-habit-item="'+esc(item.id)+'">'+esc(itemLabel(item))+'</button>';
    }).join('')+'</div><span class="habit-ws-source is-'+esc(d.source.id)+'">'+esc(d.source.label)+'</span></div>';
  }
  function channelIconSvg(ch){
    if(ch==='voice') return '<svg class="habit-ws-channel-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>';
    if(ch==='camera') return '<svg class="habit-ws-channel-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>';
    if(ch==='softPad') return '<svg class="habit-ws-channel-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h.01M12 7h.01M16 7h.01M8 11h.01M12 11h.01M16 11h.01M8 15h8"/></svg>';
    return '<svg class="habit-ws-channel-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8"/></svg>';
  }
  function channelTabsHtml(model){
    var sum=model.inherit||{total:0};
    return '<div class="habit-ws-ch-tabs" role="tablist">'+QUICK_CHANNELS.map(function(ch){
      var badge=ch==='all'?(sum.total||0):((model.channels[ch]&&model.channels[ch].count)||0);
      var selected=ch===model.channel;
      var label=ch==='all'?(lang()==='en'?'All':'全部'):c('channels')[ch];
      return '<button type="button" role="tab" aria-selected="'+(selected?'true':'false')+'" class="habit-ws-ch-tab'+(selected?' is-active':'')+'" data-habit-channel="'+ch+'">'+esc(label)+'<span class="habit-ws-ch-badge">'+esc(String(badge))+'</span></button>';
    }).join('')+'</div>';
  }
  function ruleSummaryForModel(model){
    var rows=model.ruleRows||[];
    var overrides=rows.filter(function(row){ return row.priority==='overridden'; });
    var inherited=rows.filter(function(row){ return row.priority==='inherited'; });
    if(model.channel==='all') return model.inherit||{overrideCount:overrides.length,inheritedCount:inherited.length};
    return {overrideCount:overrides.length,inheritedCount:inherited.length};
  }
  function pageIndicatorHtml(model){
    var sum=ruleSummaryForModel(model);
    var label=model.channel==='all'?t('habitWsPageAll','全部通道'):c('channels')[model.channel];
    var summaryKey=model.channel==='all'?'habitWsRulesSummary':'habitWsRulesSummaryChannel';
    var summaryFb=model.channel==='all'?'{ov} 项覆盖 · {in} 项继承':'{ov} 项覆盖 · {in} 项继承（当前通道）';
    return '<div class="habit-ws-page-bar" role="status"><span class="habit-ws-page-label">'+esc(label)+'</span><span class="habit-ws-page-stats">'+esc(fmt(t(summaryKey,summaryFb),{ov:sum.overrideCount,in:sum.inheritedCount}))+'</span></div>';
  }
  function quickToolbarHtml(model){
    return '<div class="habit-ws-quick-toolbar">'+channelTabsHtml(model)+pageIndicatorHtml(model)+'</div>';
  }
  function ruleRowHtml(row){
    var open=ui().habitWorkspaceRuleOpen===row.id;
    var d=row.detail||{};
    var s=shared();
    var emoji=s&&s.cardEmoji?s.cardEmoji(row.channel):'';
    var tagCls=row.priority==='overridden'?'is-overridden':'is-inherited';
    var tagLabel=row.priority==='overridden'?(lang()==='en'?'Override':'覆盖'):(lang()==='en'?'Inherited':'继承');
    var ovCls=row.priority==='overridden'?' is-overridden':'';
    var peekCard={channel:row.channel,itemId:row.itemId,mapping:row.mapping,detail:d};
    var humanWhen=s&&s.humanizeWhen?s.humanizeWhen(peekCard,d):(d.when||'');
    var rawWhen=String(d.when||'');
    var proWhen=rawWhen&&humanWhen&&rawWhen!==humanWhen?rawWhen:'';
    var peekTrigger=t('habitWsPeekTrigger','怎么触发');
    var peekAction=t('habitWsPeekAction','做什么');
    var peekStatus=t('habitWsPeekStatus','开了吗');
    var peekMeta=esc(row.meta)+(d.source&&d.source.label?(' · <span class="habit-ws-peek-src is-'+esc(d.source.id)+'">'+esc(d.source.label)+'</span>'):'');
    var peekBlock=open?('<div class="habit-ws-rule-peek"><dl><div><dt>'+esc(peekTrigger)+'</dt><dd>'+esc(humanWhen||c('none'))+'</dd></div><div><dt>'+esc(peekAction)+'</dt><dd>'+esc(d.what||c('none'))+'</dd></div><div><dt>'+esc(peekStatus)+'</dt><dd><span class="habit-ws-status '+(d.enabled?'is-on':'is-off')+'"><i></i>'+esc(d.enabled?c('enabled'):c('disabled'))+'</span></dd></div></dl><p class="habit-ws-rule-peek-meta">'+peekMeta+'</p>'+(proWhen?'<p class="habit-ws-rule-peek-pro">'+esc(proWhen)+'</p>':'')+'</div>'):'';
    return '<article class="habit-ws-rule'+ovCls+(open?' is-open':'')+'" data-rule-id="'+esc(row.id)+'" data-channel="'+esc(row.channel)+'"><div class="habit-ws-rule-row" data-habit-rule-toggle="'+esc(row.id)+'"><span class="habit-ws-rule-accent" aria-hidden="true"></span><span class="habit-ws-rule-icon" aria-hidden="true">'+emoji+'</span><div class="habit-ws-rule-copy"><div class="habit-ws-rule-txt">'+esc(row.txt)+'</div></div><div class="habit-ws-rule-actions"><span class="habit-ws-rule-tag '+tagCls+'">'+esc(tagLabel)+'</span><button type="button" class="habit-ws-rule-edit" data-habit-edit data-channel="'+esc(row.channel)+'" data-focus="'+esc(row.focus)+'" onclick="event.stopPropagation()">'+esc(c('change'))+'</button></div></div>'+peekBlock+'</article>';
  }
  function rulesListHtml(model){
    var rows=model.ruleRows||[];
    var overrides=rows.filter(function(row){ return row.priority==='overridden'; });
    var inherited=rows.filter(function(row){ return row.priority==='inherited'; });
    var inhOpen=!!ui().habitWorkspaceInheritedOpen;
    var html='<div class="habit-ws-rules-head"><h4>'+esc(t('habitWsRulesTitle','规则清单'))+'</h4><button type="button" class="habit-ws-rules-fine" data-habit-fine>'+esc(t('habitWsAdvancedFine','查看完整参数'))+'</button></div>';
    if(!rows.length){
      html+='<div class="habit-ws-rules-empty">'+esc(t('habitWsRulesEmpty','当前通道没有可展示的规则'))+'</div>';
      return html;
    }
    html+=overrides.map(ruleRowHtml).join('');
    if(inherited.length){
      var folderLbl=inhOpen?('\u25BE '+fmt(t('habitWsRulesCollapse','收起 {n} 条沿用通用设置'),{n:inherited.length})):('\u25B8 '+fmt(t('habitWsRulesExpand','还有 {n} 条沿用通用设置'),{n:inherited.length}));
      html+='<div class="habit-ws-rules-folder habit-ws-rules-collapse'+(inhOpen?' is-open':'')+'"><button type="button" class="habit-ws-rules-collapse-btn" data-habit-inherited-toggle>'+esc(folderLbl)+'</button><div class="habit-ws-rules-collapse-body">'+inherited.map(ruleRowHtml).join('')+'</div></div>';
    }
    return html;
  }
  function modeHtml(){
    return '';
  }
  function snapApi(){ return global.OneToneHabitChannelSnapshot; }
  /** One subtitle line: no repeat of title; prefer key flow + counts. */
  function locatorSubline(m,snap,appLabel,habitTitle){
    var parts=[];
    var title=String(habitTitle||'');
    var app=String(appLabel||'').trim();
    var isUniversal=!String(m&&m.appTargetId||'').trim()
      ||(diff().isGlobalBaselineMapping&&diff().isGlobalBaselineMapping(m,cfg(),global.OneToneMappingCore));
    if(isUniversal){
      parts.push(lang()==='en'?'Fallback for other apps':'其它应用无专用时走这套');
    }else if(app&&title.indexOf(app)<0){
      parts.push((lang()==='en'?'For ':'适用于 ')+app);
    }
    var keySub=snapApi()&&snapApi().listSubtitle?snapApi().listSubtitle(m,snap,lang()):'';
    if(keySub&&keySub!=='已关闭'&&keySub!=='Off'&&keySub!=='未设置键位'&&keySub!=='Keys not set'){
      parts.push(keySub);
    }else if(keySub==='未设置键位'||keySub==='Keys not set'){
      parts.push(keySub);
    }
    if(snap){
      parts.push(lang()==='en'
        ?(snap.configuredActionCount+' actions')
        :(snap.configuredActionCount+' 个动作'));
    }
    if(snap&&snap.hasAttention) parts.push(lang()==='en'?'Needs setup':'有待补');
    return parts.join(' · ');
  }
  function locatorDetailHtml(model){
    var m=model&&model.mapping;
    if(!m) return '<div class="habit-ws-empty"><strong>'+esc(c('noHabit'))+'</strong></div>';
    var api=snapApi();
    var snap=api&&api.make?api.make(m,cfg(),lang()):null;
    var appLabel=shared()&&shared().appName?shared().appName(m):(m.appTargetId||'');
    var habitTitle=shared()&&shared().sceneName?shared().sceneName(m):(m.group||m.label||m.id||'—');
    var isActive=String(cfg().activeSceneId||'')===String(m.id);
    var renaming=String(ui().habitHubRenameId||'')===String(m.id);
    var siblings=[];
    if(api&&api.habitLocatorGroups&&api.scopeIdForMapping){
      var scope=api.scopeIdForMapping(m,cfg());
      var group=(api.habitLocatorGroups(model.mappings,cfg(),lang())||[]).find(function(g){ return g.scope===scope; });
      siblings=group&&group.schemes?group.schemes:[];
    }
    var kpi='';
    var stats=global.OneToneHabitActionStats;
    if(stats&&stats.headKpiHtml) kpi=stats.headKpiHtml(m.id);

    var nameHtml=renaming
      ?('<span class="habit-locator-rename-wrap">'
        +'<input type="text" class="habit-locator-rename-input" data-habit-rename-input="'+esc(m.id)+'" value="'+esc(m.group||m.label||'')+'" maxlength="48" />'
        +'<button type="button" class="btn-ghost" data-habit-rename-save="'+esc(m.id)+'">'+esc(t('habitHubRenameSave','保存'))+'</button>'
        +'<button type="button" class="btn-ghost" data-habit-rename-cancel>'+esc(t('habitScenarioCancel','取消'))+'</button>'
        +'</span>')
      :('<h2 class="habit-locator-name" data-habit-rename="'+esc(m.id)+'" title="'+esc(t('habitHubActRename','重命名'))+'">'+esc(habitTitle)+'</h2>');

    var useTip=t('habitChannelStripHint','编辑不会立即切换正在使用；点「设为正在使用」后，按键 / 语音 / 摄像头 / Soft Pad 才按这套执行。');
    var activeTip=t('habitLocatorActiveTip','按键、语音、摄像头、Soft Pad 当前按这套习惯执行。浏览左侧其它习惯只是编辑，不会自动改这里。');
    // Active = green dot only (no "正在使用" text). Enable toggle lives beside sidebar delete.
    var liveDot=isActive
      ?('<span class="habit-locator-live-dot" role="status" aria-label="'+esc(t('habitActiveLabel','正在使用'))+'" title="'+esc(activeTip)+'"></span>')
      :'';
    var useBtn=!isActive
      ?('<button type="button" class="btn-ghost habit-locator-use-btn" data-habit-scenario-use="'+esc(m.id)+'" title="'+esc(useTip)+'">'+esc(t('homeWbHabitBarUse','设为正在使用'))+'</button>')
      :'';
    var fgId=ui().habitWorkspaceFgIdentity;
    var fgHit=String(ui().habitWorkspaceFgHitId||'');
    var fgName=fgDisplayName(fgId);
    var fgAligned=fgHit&&fgHit===String(m.id);
    // Compact FG strip: no second「正在编辑」title (hero h2 already shows habit).
    var truthBar='';
    if(fgId){
      var fgHint=fgHit
        ?(fgAligned?'':t('habitWsFgOther','点对准前台回到此应用'))
        :t('habitWsFgMissing','此前台尚无习惯');
      truthBar='<div class="habit-ws-truth'+(fgAligned?' is-aligned':'')+'" role="status">'
        +'<span class="habit-ws-truth-app">'+(fgAligned?'✓ ':'')
        +esc(t('habitWsFgLabel','前台'))+' · '+esc(fgName)+'</span>'
        +(fgHint?'<span class="habit-ws-truth-hint">'+esc(fgHint)+'</span>':'')
        +(!fgAligned
          ?('<button type="button" class="btn-ghost habit-ws-align-fg" data-habit-align-fg'
            +' title="'+esc(t('habitWsAlignFgTip','只切换编辑选中，不会改正在使用'))+'">'
            +esc(t('habitWsAlignFg','对准前台'))+'</button>')
          :'')
        +'</div>';
    }

    var sub=locatorSubline(m,snap,appLabel,habitTitle);

    var chips=siblings.length>1
      ?('<div class="habit-locator-chips" role="tablist">'
        +siblings.map(function(s){
          var on=s.id===m.id;
          var chipName=shared()&&shared().sceneName?shared().sceneName(s):(s.group||s.label||s.id);
          return '<button type="button" class="habit-locator-chip'+(on?' on':'')+'" data-habit-mapping="'+esc(s.id)+'" role="tab" aria-selected="'+(on?'true':'false')+'">'+esc(chipName)+'</button>';
        }).join('')
        +'</div>')
      :'';

    var scenes=(api&&api.SCENES)||[];
    var boards=scenes.map(function(scene){
      var ch=snap&&snap.channels?snap.channels[scene.id]:{tone:'idle',statusLabel:'',blurb:'',actions:[]};
      var title=lang()==='en'?scene.titleEn:scene.titleZh;
      var editLbl=lang()==='en'?scene.editEn:scene.editZh;
      var acts=(ch.actions&&ch.actions.length)
        ?ch.actions.map(function(a){
          return '<button type="button" class="habit-locator-act'+(a.muted?' muted':'')+'" data-nav-scene="'+esc(scene.id)+'" data-nav-action="'+esc(a.id)+'">'
            +'<span class="habit-locator-act-title">'+esc(a.title)+'</span>'
            +(a.key?'<span class="habit-locator-act-key">'+esc(a.key)+'</span>':'')
            +'</button>';
        }).join('')
        :'<div class="habit-locator-empty">'+(lang()==='en'?'No actions':'暂无动作')+'</div>';
      return '<section class="habit-locator-board" data-ch="'+esc(scene.id)+'" data-tone="'+esc(ch.tone||'idle')+'">'
        +'<header class="habit-locator-board-hd"><div><b>'+esc(title)+'</b><div class="habit-locator-blurb">'+esc(ch.blurb||'')+'</div></div>'
        +'<span class="habit-locator-tone '+(ch.tone||'idle')+'">'+esc(ch.statusLabel||'')+'</span></header>'
        +'<div class="habit-locator-board-body">'+acts+'</div>'
        +'<footer class="habit-locator-board-ft"><button type="button" class="habit-locator-edit" data-nav-scene="'+esc(scene.id)+'" data-nav-action="">'+esc(editLbl)+'</button></footer>'
        +'</section>';
    }).join('');

    return '<main class="habit-ws-main habit-locator-main">'
      +'<header class="habit-locator-hero">'
      +'<div class="habit-locator-hdr">'
      +'<div class="habit-locator-hdr-left">'
      +(shared()&&shared().appIconHtml?shared().appIconHtml(m):'')
      +'<div class="habit-locator-hdr-copy">'
      +'<div class="habit-locator-title-row">'+nameHtml+liveDot+'</div>'
      +(sub?'<p class="habit-locator-sub">'+esc(sub)+'</p>':'')
      +'</div></div>'
      +(useBtn?'<div class="habit-locator-hdr-right">'+useBtn+'</div>':'')
      +'</div>'
      +truthBar
      +kpi
      +'</header>'
      +chips
      +'<div id="habitCommandLinkMount" class="hcl-mount" data-mapping="'+esc(m.id)+'"></div>'
      +'<details class="habit-keep-fold">'
      +'<summary>'+(lang()==='en'?'Channel capabilities (KEEP)':'各通道底层能力（KEEP）')+'</summary>'
      +'<p class="habit-keep-fold-note">'+(lang()==='en'
        ?'Recording, wake, pad layout and thresholds stay on channel pages. Command matching is above.'
        :'录键、唤醒、Pad 布局与阈值仍在各通道页；命令匹配见上方中枢。')+'</p>'
      +'<div class="habit-locator-boards">'+boards+'</div>'
      +'</details>'
      +'</main>';
  }
  function advancedFieldCount(groups){
    groups=groups||{};
    var n=0;
    SECTIONS.forEach(function(section){ n+=arr(groups[section]).length; });
    return n;
  }
  function advancedPanelHtml(model){
    var open=!!ui().habitWorkspaceAdvancedOpen;
    var groups=model.groups||{};
    var count=advancedFieldCount(groups);
    var d=quickDetail(model.mapping,model.channel,defaultItem(model.channel));
    var path=fmt(c('rulePath'),{app:appName(model.mapping),scene:sceneName(model.mapping),trigger:d.when,action:d.what});
    var pathHtml=path.split(' \u2192 ').map(function(part,i){ return '<span><small>0'+(i+1)+'</small>'+esc(part)+'</span>'; }).join('<b aria-hidden="true">\u2192</b>');
    var groupsHtml=SECTIONS.map(function(section){
      var expanded=section===ui().habitProgramSection;
      var rows=groups[section]||[];
      return '<section class="habit-ws-group'+(expanded?' is-open':'')+'"><button type="button" class="habit-ws-group-head" data-habit-section="'+section+'" aria-expanded="'+(expanded?'true':'false')+'"><span><b>'+String(SECTIONS.indexOf(section)+1).padStart(2,'0')+'</b>'+esc(c(section))+'</span><small>'+rows.length+' '+(lang()==='en'?'items':'项')+'</small><i aria-hidden="true">\u2304</i></button>'+(expanded?'<div class="habit-ws-rows"><div class="habit-ws-row-head"><span></span><span>'+esc(c('current'))+'</span><span>'+esc(c('source'))+'</span><span></span></div>'+rows.map(function(row){ return '<div class="habit-ws-row"><strong>'+esc(row.label)+'</strong><span>'+esc(row.value)+'</span><span class="habit-ws-source is-'+esc(row.source.id)+'">'+esc(row.source.label)+'</span><button type="button" data-habit-edit data-channel="'+esc(row.channel)+'" data-focus="'+esc(row.focus)+'">'+esc(c('edit'))+'</button></div>'; }).join('')+'</div>':'')+'</section>';
    }).join('');
    var body=open?('<div class="habit-ws-advanced-body"><div class="habit-ws-rule-path" aria-label="'+esc(c('summary'))+'">'+pathHtml+'</div><p class="habit-ws-device-note">\u2139 '+esc(c('deviceGlobal'))+'</p><div class="habit-ws-groups">'+groupsHtml+'</div><div class="habit-ws-advanced-json"><p>'+esc(t('habitWsExportJsonHint','导出当前场景 stored JSON，供备份或 Agent 读取'))+'</p><div class="habit-ws-advanced-json-actions"><button type="button" data-habit-copy-json>'+esc(t('habitWsCopyJson','复制 JSON'))+'</button><button type="button" class="is-primary" data-habit-export-json>'+esc(t('habitWsExportJson','下载 JSON'))+'</button></div></div></div>'):'';
    return '<section class="habit-ws-advanced'+(open?' is-open':'')+'"><button type="button" class="habit-ws-advanced-toggle" data-habit-advanced-toggle aria-expanded="'+(open?'true':'false')+'"><span class="habit-ws-advanced-title">'+esc(t('habitWsAdvancedTitle','完整参数'))+'</span><span class="habit-ws-advanced-sub">'+esc(fmt(t('habitWsAdvancedCount','{n} 项跨通道字段'),{n:count}))+'</span><i class="habit-ws-advanced-chev" aria-hidden="true">\u2304</i></button>'+body+'</section>';
  }
  function quickHtml(model){
    var s=shared();
    var viz=s&&s.channelVizHtml?s.channelVizHtml(model.channel,model.mapping):'';
    var chain=s&&s.inheritChainHtml?s.inheritChainHtml(model.mapping):'';
    return '<div class="habit-ws-current-head"><div><span>'+esc(c('currentApp'))+'</span><h4>'+esc(appName(model.mapping))+'</h4><p>'+esc(sceneName(model.mapping))+'</p></div><span class="habit-ws-live '+(model.mapping.id===cfg().activeSceneId?'is-active':'')+'">'+esc(model.mapping.id===cfg().activeSceneId?c('activeHabit'):c('notActive'))+'</span></div>'+chain+quickToolbarHtml(model)+'<section class="habit-ws-viz" aria-label="'+esc(t('habitWsVizLabel','输入通道预览'))+'">'+viz+'</section><section class="habit-ws-rules">'+rulesListHtml(model)+'</section>'+advancedPanelHtml(model);
  }
  function captureWorkspaceScroll(){
    var root=document.getElementById('habitWorkspace');
    var main=root&&root.querySelector?root.querySelector('.habit-locator-main, .habit-ws-main'):null;
    if(!main) main=document.querySelector('#habitWorkspace .habit-locator-main,#habitWorkspace .habit-ws-main');
    if(main) ui().habitWorkspaceScrollTop=main.scrollTop||0;
    var active=document.activeElement;
    if(active&&active.matches&&active.matches('[data-habit-mapping],[data-habit-scope],[data-nav-scene]')){
      if(active.hasAttribute('data-habit-mapping')) ui().habitWorkspaceFocusSelector='[data-habit-mapping="'+active.getAttribute('data-habit-mapping')+'"]';
      else if(active.hasAttribute('data-habit-scope')) ui().habitWorkspaceFocusSelector='[data-habit-scope="'+active.getAttribute('data-habit-scope')+'"]';
      else if(active.hasAttribute('data-nav-scene')) ui().habitWorkspaceFocusSelector='[data-nav-scene="'+active.getAttribute('data-nav-scene')+'"]';
    }
  }
  function restoreWorkspaceScroll(host){
    setTimeout(function(){
      var main=host&&host.querySelector('.habit-locator-main, .habit-ws-main');
      if(main&&Number.isFinite(Number(ui().habitWorkspaceScrollTop))) main.scrollTop=Number(ui().habitWorkspaceScrollTop)||0;
      var sel=String(ui().habitWorkspaceFocusSelector||'').trim();
      if(sel){
        var focus=host&&host.querySelector(sel);
        if(focus) focus.focus();
      }
    },0);
  }
  function persistBaselineIfCreated(created){
    if(!created) return;
    var persist=global.OneToneConfigPersist;
    if(persist&&persist.saveAsync) persist.saveAsync({source:'ensureBaseline'});
    else if(persist&&persist.save) persist.save();
  }

  function render(opts){
    opts=opts||{};
    var host=ensureShell();
    if(!host) return;
    var diffApi=diff();
    if(diffApi&&diffApi.ensureGlobalBaselineMapping){
      persistBaselineIfCreated(diffApi.ensureGlobalBaselineMapping(cfg(),global.OneToneMappingCore).created);
    }
    bindEvents(host);
    bindUsageLive();
    captureWorkspaceScroll();
    ui().habitExperienceMode='locator';
    if(ui().habitHubCreating){
      var hub=global.OneToneHabitHub;
      var createHtml=hub&&hub.inlineCreateHtml?hub.inlineCreateHtml():'';
      host.innerHTML='<div class="habit-ws-create">'+createHtml+'</div>';
      restoreWorkspaceScroll(host);
      return;
    }
    var model=buildWorkspaceModel();
    if(model.empty){
      host.innerHTML='<div class="habit-ws-empty"><strong>'+esc(c('noHabit'))+'</strong><p>'+esc(c('noHabitDesc'))+'</p><button type="button" data-habit-add>'+esc(c('addApp'))+'</button></div>';
      restoreWorkspaceScroll(host);
      return;
    }
    var body='<div class="habit-ws-layout habit-locator">'+appListHtml(model)+locatorDetailHtml(model)+'</div>';
    host.innerHTML=body;
    restoreWorkspaceScroll(host);
    try{
      var hcl=global.OneToneHabitCommandLink;
      if(hcl&&typeof hcl.mountInto==='function'){
        var mount=document.getElementById('habitCommandLinkMount');
        if(mount) hcl.mountInto(mount,model.mapping);
      }
    }catch(_){}
    maybeAutoAlignForeground(opts);
    if(!opts.skipStatsFetch){
      var api=global.OneToneHabitActionStats;
      if(api&&api.fetch&&!(api.isFresh&&api.isFresh(168))){
        api.fetch({hours:168}).then(function(){
          render({skipStatsFetch:true,skipFgAlign:true});
        }).catch(function(){});
      }
    }
  }

  function bindUsageLive(){
    if(global.__otHabitUsageLiveBound) return;
    global.__otHabitUsageLiveBound=true;
    var onEvent=function(entry){
      var api=global.OneToneHabitActionStats;
      if(api&&api.invalidate) api.invalidate();
      clearTimeout(global.__otHabitUsageLiveT);
      global.__otHabitUsageLiveT=setTimeout(function(){
        if(!api||!api.fetch){ render({skipStatsFetch:true}); return; }
        api.fetch({hours:168,force:true}).then(function(){
          render({skipStatsFetch:true});
        }).catch(function(){ render({skipStatsFetch:true}); });
      },400);
    };
    if(global.chrome&&global.chrome.webview&&global.chrome.webview.addEventListener){
      global.chrome.webview.addEventListener('message',function(e){
        var msg=e&&e.data;
        if(!msg||msg.type!=='mvp_action_history_event') return;
        onEvent(msg.entry);
      });
    }
  }
  function mappingJsonText(mapping){
    var s=shared();
    var payload=s&&s.exportMappingJson?s.exportMappingJson(mapping):{mapping:mapping};
    return JSON.stringify(payload,null,2);
  }
  function downloadMappingJson(mapping){
    var id=String(mapping&&mapping.id||'habit');
    var blob=new Blob([mappingJsonText(mapping)],{type:'application/json;charset=utf-8'});
    var a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download='onetone-habit-'+id.replace(/[^\w.-]+/g,'-')+'.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); },0);
  }
  function copyMappingJson(mapping){
    var text=mappingJsonText(mapping);
    if(global.navigator&&global.navigator.clipboard&&global.navigator.clipboard.writeText){
      return global.navigator.clipboard.writeText(text).then(function(){
        if(global.OneToneAppToast) global.OneToneAppToast.show(t('habitWsCopyJsonOk','已复制 JSON'),'scheme');
      });
    }
    if(global.OneToneAppToast) global.OneToneAppToast.show(t('habitWsCopyJsonFail','无法访问剪贴板'),'scheme');
    return Promise.resolve();
  }
  function switchMode(){
    ui().habitExperienceMode='locator';
    if(prefs()) prefs().setMode('locator');
    render();
  }
  function openEditor(channel,focus,actionId){
    var m=normalizeSelection();
    if(!m) return;
    var api=snapApi();
    var editorCh=api&&api.editorChannelId?api.editorChannelId(channel):channel;
    if(editorCh==='cam') editorCh='camera';
    else if(editorCh==='pad') editorCh='softPad';
    var scrollHost=document.getElementById('settingsPanelWrap');
    var ctx={
      mappingId:m.id,
      channel:editorCh,
      itemId:ui().habitWorkspaceItemId||'',
      mode:'locator',
      sectionId:ui().habitProgramSection,
      focusId:focus,
      scrollTop:scrollHost?scrollHost.scrollTop:0
    };
    if(global.OneToneActionNav&&global.OneToneActionNav.openChannelEditor){
      global.OneToneActionNav.openChannelEditor({
        mappingId:m.id,
        channel:editorCh,
        actionId:actionId||null,
        focusId:focus,
        returnContext:ctx
      });
    }
  }
  function openBoardNav(boardId,actionId){
    var api=snapApi();
    var focus=api&&api.focusIdForAction?api.focusIdForAction(boardId,actionId):'';
    openEditor(boardId,focus,actionId);
  }
  function selectScope(scope){
    var api=snapApi();
    if(!api||!api.habitLocatorGroups) return;
    var groups=api.habitLocatorGroups(mappings(),cfg(),lang());
    var group=groups.find(function(g){ return g.scope===scope; });
    if(!group||!group.schemes.length) return;
    var pick=api.pickSchemeInGroup(group.schemes,cfg().activeSceneId,state().selectedMappingId);
    if(pick){
      state().selectedMappingId=pick.id;
      ui().habitWorkspaceManualPick=true;
      ui().habitWorkspaceFgReady=true;
    }
    render({skipFgAlign:true});
  }
  function bindEvents(host){
    if(host.__habitWorkspaceBound) return;
    host.__habitWorkspaceBound=true;
    host.addEventListener('click',function(event){
      // Hub owns enable / scenario-use / rename / delete — do not stop those.
      var hubOwned=event.target.closest&&event.target.closest('[data-habit-enable],[data-habit-scenario-use],[data-habit-del],[data-habit-del-confirm],[data-habit-del-cancel],[data-habit-rename],[data-habit-rename-save],[data-habit-rename-cancel],[data-habit-rename-input],[data-habit-batch-toggle],[data-habit-select],[data-habit-batch-del],[data-habit-batch-del-confirm],[data-habit-batch-del-cancel],[data-habit-select-all],[data-habit-clear-sel]');
      if(hubOwned) return;

      var target=event.target.closest&&event.target.closest('[data-nav-scene],[data-habit-scope],button,[data-habit-mapping],[data-habit-align-fg],[data-habit-usage-peek],[data-habit-usage-export],[data-habit-usage-export-all],[data-habit-usage-rank],[data-habit-add]');
      if(!target) return;
      if(target.hasAttribute('data-nav-scene')){
        event.stopPropagation();
        openBoardNav(target.getAttribute('data-nav-scene'),target.getAttribute('data-nav-action')||'');
        return;
      }
      if(target.hasAttribute('data-habit-scope')){
        event.stopPropagation();
        selectScope(target.getAttribute('data-habit-scope'));
        return;
      }
      if(target.hasAttribute('data-habit-usage-rank')){
        event.stopPropagation();
        state().selectedMappingId=target.getAttribute('data-habit-usage-rank');
        ui().habitWorkspaceManualPick=true;
        ui().habitWorkspaceFgReady=true;
        render({skipStatsFetch:true,skipFgAlign:true});
        return;
      }
      if(target.hasAttribute('data-habit-usage-export-all')){
        event.stopPropagation();
        var apiAll=global.OneToneHabitActionStats;
        if(apiAll&&apiAll.exportAllHabitsDoc) apiAll.exportAllHabitsDoc({}).catch(function(){});
        return;
      }
      if(target.hasAttribute('data-habit-usage-export')){
        event.stopPropagation();
        var exportId=target.getAttribute('data-habit-usage-export');
        var apiOne=global.OneToneHabitActionStats;
        if(apiOne&&apiOne.exportHabitDoc) apiOne.exportHabitDoc(exportId,{}).catch(function(){});
        return;
      }
      if(target.hasAttribute('data-habit-usage-peek')){
        event.stopPropagation();
        var peekId=target.getAttribute('data-habit-usage-peek');
        if(global.OneToneHabitUsageSheet&&global.OneToneHabitUsageSheet.open){
          global.OneToneHabitUsageSheet.open(peekId);
        }
        return;
      }
      if(target.hasAttribute('data-habit-align-fg')){
        event.stopPropagation();
        alignToForeground({force:true,skipStatsFetch:true});
        return;
      }
      if(target.hasAttribute('data-habit-mapping')){
        event.stopPropagation();
        if(ui().habitHubBatchMode||(Array.isArray(ui().habitHubSelectedIds)&&ui().habitHubSelectedIds.length)){
          return;
        }
        state().selectedMappingId=target.getAttribute('data-habit-mapping');
        ui().habitWorkspaceManualPick=true;
        ui().habitWorkspaceFgReady=true;
        render({skipFgAlign:true});
        return;
      }
      if(target.hasAttribute('data-habit-add')){
        var hub=global.OneToneHabitHub;
        if(hub&&hub.startInlineCreate) hub.startInlineCreate();
        else{
          var btn=document.getElementById('btnHabitHubHeadNew');
          if(btn) btn.click();
        }
        return;
      }
    });
    host.addEventListener('input',function(event){
      if(event.target&&event.target.hasAttribute('data-habit-search')){
        ui().habitWorkspaceSearch=event.target.value;
        var start=event.target.selectionStart;
        render();
        var next=host.querySelector('[data-habit-search]');
        if(next){ next.focus(); try{ next.setSelectionRange(start,start); }catch(_){} }
      }
    });
  }
  function restoreReturnContext(context){
    if(!context||!context.mappingId) return;
    state().selectedMappingId=context.mappingId;
    ui().habitWorkspaceManualPick=true;
    ui().habitWorkspaceFgReady=true;
    ui().habitExperienceMode='locator';
    var ch=String(context.channel||'');
    if(ch==='cam') ch='camera';
    if(ch==='pad') ch='softPad';
    if(QUICK_CHANNELS.indexOf(ch)>=0||CHANNELS.indexOf(ch)>=0) ui().habitWorkspaceChannel=ch;
    ui().habitWorkspaceItemId=context.itemId||defaultItem(ui().habitWorkspaceChannel);
    if(SECTIONS.indexOf(context.sectionId)>=0) ui().habitProgramSection=context.sectionId;
    render({skipFgAlign:true});
    setTimeout(function(){
      var scrollHost=document.getElementById('settingsPanelWrap');
      if(scrollHost&&Number.isFinite(Number(context.scrollTop))) scrollHost.scrollTop=Number(context.scrollTop)||0;
    },0);
  }

  global.OneToneHabitWorkspace={
    render:render,
    buildWorkspaceModel:buildWorkspaceModel,
    switchMode:switchMode,
    restoreReturnContext:restoreReturnContext,
    defaultItem:defaultItem,
    alignToForeground:alignToForeground
  };
})((typeof window!=='undefined')?window:globalThis);
