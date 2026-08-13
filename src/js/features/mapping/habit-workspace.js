(function(global){
  'use strict';

  var CHANNELS=['key','voice','camera','softPad'];
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
  function diff(){ return global.OneToneHabitOverrideDiff||{}; }
  function lang(){
    var value=global.OneToneI18n&&global.OneToneI18n.getLang?global.OneToneI18n.getLang():document.documentElement.lang;
    return String(value||'zh').toLowerCase().indexOf('en')===0?'en':'zh';
  }
  function c(key){ return COPY[lang()][key]; }
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
  function baseline(){ return diff().findGlobalBaselineMapping?diff().findGlobalBaselineMapping(cfg(),global.OneToneMappingCore):mappings()[0]||null; }

  function normalizeSelection(){
    var list=mappings();
    var selected=byId(state().selectedMappingId);
    if(!selected){
      selected=list.find(isApp)||baseline()||list[0]||null;
      state().selectedMappingId=selected?selected.id:null;
    }
    if(CHANNELS.indexOf(ui().habitWorkspaceChannel)<0) ui().habitWorkspaceChannel='key';
    if(SECTIONS.indexOf(ui().habitProgramSection)<0) ui().habitProgramSection='scope';
    if(!ui().habitWorkspaceItemId) ui().habitWorkspaceItemId=defaultItem(ui().habitWorkspaceChannel);
    return selected;
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
    var items=quickItems(channel);
    var item=items.find(function(x){ return x.id===ui().habitWorkspaceItemId; });
    if(!item){ item=items[0]; ui().habitWorkspaceItemId=item.id; }
    var detail=quickDetail(m,channel,item.id);
    var q={};
    CHANNELS.forEach(function(ch){
      var first=quickItems(ch)[0];
      var d=quickDetail(m,ch,first.id);
      q[ch]={enabled:d.enabled,count:d.count||0,source:d.source};
    });
    return {empty:false,mapping:m,mappings:mappings(),channel:channel,items:items,item:item,detail:detail,channels:q,groups:programmerGroups(m),mode:ui().habitExperienceMode||prefs()&&prefs().getMode()||'quick'};
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
    if(oldToolbar) oldToolbar.hidden=true;
    if(oldBody) oldBody.hidden=true;
    return host;
  }
  function appListHtml(model){
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
      return '<button type="button" role="tab" aria-selected="'+(selected?'true':'false')+'" class="habit-ws-scene-tab'+(selected?' is-selected':'')+'" data-habit-item="'+esc(item.id)+'">'+esc(itemLabel(item))+'</button>';
    }).join('')+'</div><span class="habit-ws-source is-'+esc(d.source.id)+'">'+esc(d.source.label)+'</span></div>';
  }
  function channelIconSvg(ch){
    if(ch==='voice') return '<svg class="habit-ws-channel-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>';
    if(ch==='camera') return '<svg class="habit-ws-channel-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>';
    if(ch==='softPad') return '<svg class="habit-ws-channel-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h.01M12 7h.01M16 7h.01M8 11h.01M12 11h.01M16 11h.01M8 15h8"/></svg>';
    return '<svg class="habit-ws-channel-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8"/></svg>';
  }
  function channelTabsHtml(model){
    return '<div class="pref-segmented is-wide habit-ws-channels" role="tablist">'+CHANNELS.map(function(ch){
      var meta=model.channels[ch],selected=ch===model.channel;
      return '<button type="button" role="tab" aria-selected="'+(selected?'true':'false')+'" class="pref-segmented-btn habit-ws-channel'+(selected?' is-active':'')+'" data-habit-channel="'+ch+'">'+channelIconSvg(ch)+'<span class="habit-ws-channel-copy"><span>'+esc(c('channels')[ch])+'</span><small><i class="'+(meta.enabled?'is-on':'is-off')+'"></i>'+esc(meta.enabled?c('enabled'):c('disabled'))+(meta.count?' · '+esc(String(meta.count)): '')+'</small></span></button>';
    }).join('')+'</div>';
  }
  function modeHtml(mode){
    return '<div class="habit-ws-modebar"><div class="pref-segmented habit-ws-modes" role="tablist" aria-label="Habit view"><button type="button" role="tab" aria-selected="'+(mode==='quick'?'true':'false')+'" class="pref-segmented-btn'+(mode==='quick'?' is-active':'')+'" data-habit-mode="quick">'+esc(c('quick'))+' <em>'+esc(c('recommended'))+'</em></button><button type="button" role="tab" aria-selected="'+(mode==='programmer'?'true':'false')+'" class="pref-segmented-btn'+(mode==='programmer'?' is-active':'')+'" data-habit-mode="programmer">'+esc(c('programmer'))+'</button></div>'+(mode==='programmer'?'<button type="button" class="habit-ws-back-quick" data-habit-mode="quick">← '+esc(c('backQuick'))+'</button>':'')+'</div>';
  }
  function introHtml(){
    if(!ui().habitProgrammerIntroOpen) return '';
    return '<div class="habit-ws-intro" role="dialog" aria-modal="true" aria-labelledby="habitWsIntroTitle"><div><strong id="habitWsIntroTitle">'+esc(c('introTitle'))+'</strong><p>'+esc(c('introBody'))+'</p></div><div class="habit-ws-intro-actions"><button type="button" data-habit-intro-cancel>'+esc(c('cancel'))+'</button><button type="button" class="is-primary" data-habit-intro-continue>'+esc(c('continue'))+'</button></div></div>';
  }
  function quickHtml(model){
    var d=model.detail;
    return '<div class="habit-ws-current-head"><div><span>'+esc(c('currentApp'))+'</span><h4>'+esc(appName(model.mapping))+'</h4><p>'+esc(sceneName(model.mapping))+'</p></div><span class="habit-ws-live '+(model.mapping.id===cfg().activeSceneId?'is-active':'')+'">'+esc(model.mapping.id===cfg().activeSceneId?c('activeHabit'):c('notActive'))+'</span></div>'+channelTabsHtml(model)+sceneTabsHtml(model)+'<section class="habit-ws-answer" aria-labelledby="habitWsAnswerTitle"><div class="habit-ws-answer-title"><span>'+esc(c('channels')[model.channel])+'</span><h4 id="habitWsAnswerTitle">'+esc(itemLabel(model.item))+'</h4></div><dl><div><dt><b>1</b>'+esc(c('when'))+'</dt><dd>'+esc(d.when)+'</dd></div><div><dt><b>2</b>'+esc(c('what'))+'</dt><dd>'+esc(d.what)+'</dd></div><div><dt><b>3</b>'+esc(c('status'))+'</dt><dd><span class="habit-ws-status '+(d.enabled?'is-on':'is-off')+'"><i></i>'+esc(d.enabled?c('enabled'):c('disabled'))+'</span></dd></div></dl><div class="habit-ws-answer-actions"><button type="button" class="habit-ws-fine" data-habit-fine>'+esc(d.count?fmt(c('fine'),{n:d.count}):c('fineZero'))+' →</button><button type="button" class="habit-ws-change" data-habit-edit data-channel="'+esc(model.channel)+'" data-focus="'+esc(d.focus)+'">'+esc(c('change'))+'</button></div></section>';
  }
  function programHtml(model){
    var d=quickDetail(model.mapping,model.channel,defaultItem(model.channel));
    var path=fmt(c('rulePath'),{app:appName(model.mapping),scene:sceneName(model.mapping),trigger:d.when,action:d.what});
    return '<div class="habit-ws-program-head"><div><span>'+esc(c('summary'))+'</span><h4>'+esc(sceneName(model.mapping))+'</h4></div><span class="habit-ws-check '+(model.mapping.enabled===false?'is-off':'')+'">'+esc(model.mapping.enabled===false?c('checkOff'):c('checkOk'))+'</span></div><div class="habit-ws-rule-path" aria-label="'+esc(c('summary'))+'">'+path.split(' → ').map(function(part,i){ return '<span><small>0'+(i+1)+'</small>'+esc(part)+'</span>'; }).join('<b aria-hidden="true">→</b>')+'</div><p class="habit-ws-device-note">ⓘ '+esc(c('deviceGlobal'))+'</p><div class="habit-ws-groups">'+SECTIONS.map(function(section){
      var expanded=section===ui().habitProgramSection;
      var rows=model.groups[section]||[];
      return '<section class="habit-ws-group'+(expanded?' is-open':'')+'"><button type="button" class="habit-ws-group-head" data-habit-section="'+section+'" aria-expanded="'+(expanded?'true':'false')+'"><span><b>'+String(SECTIONS.indexOf(section)+1).padStart(2,'0')+'</b>'+esc(c(section))+'</span><small>'+rows.length+' '+(lang()==='en'?'items':'项')+'</small><i aria-hidden="true">⌄</i></button>'+(expanded?'<div class="habit-ws-rows"><div class="habit-ws-row-head"><span></span><span>'+esc(c('current'))+'</span><span>'+esc(c('source'))+'</span><span></span></div>'+rows.map(function(row){ return '<div class="habit-ws-row"><strong>'+esc(row.label)+'</strong><span>'+esc(row.value)+'</span><span class="habit-ws-source is-'+esc(row.source.id)+'">'+esc(row.source.label)+'</span><button type="button" data-habit-edit data-channel="'+esc(row.channel)+'" data-focus="'+esc(row.focus)+'">'+esc(c('edit'))+'</button></div>'; }).join('')+'</div>':'')+'</section>';
    }).join('')+'</div>';
  }
  function render(){
    var host=ensureShell();
    if(!host) return;
    bindEvents(host);
    if(!ui().habitExperienceMode) ui().habitExperienceMode=prefs()?prefs().getMode():'quick';
    var model=buildWorkspaceModel();
    if(model.empty){
      host.innerHTML=modeHtml(ui().habitExperienceMode)+introHtml()+'<div class="habit-ws-empty"><strong>'+esc(c('noHabit'))+'</strong><p>'+esc(c('noHabitDesc'))+'</p><button type="button" data-habit-add>'+esc(c('addApp'))+'</button></div>';
      return;
    }
    host.innerHTML=modeHtml(model.mode)+introHtml()+'<div class="habit-ws-layout">'+appListHtml(model)+'<main class="habit-ws-main">'+(model.mode==='programmer'?programHtml(model):quickHtml(model))+'</main></div>';
  }
  function switchMode(mode,force){
    mode=mode==='programmer'?'programmer':'quick';
    if(mode==='programmer'&&!force&&prefs()&&!prefs().hasSeenProgrammerIntro()){
      ui().habitProgrammerIntroOpen=true;
      render();
      setTimeout(function(){ var btn=document.querySelector('[data-habit-intro-continue]'); if(btn) btn.focus(); },0);
      return;
    }
    ui().habitProgrammerIntroOpen=false;
    ui().habitExperienceMode=mode;
    if(prefs()) prefs().setMode(mode);
    render();
  }
  function openEditor(channel,focus){
    var m=normalizeSelection();
    if(!m) return;
    var scrollHost=document.getElementById('settingsPanelWrap');
    var ctx={mappingId:m.id,channel:ui().habitWorkspaceChannel,itemId:ui().habitWorkspaceItemId,mode:ui().habitExperienceMode,sectionId:ui().habitProgramSection,focusId:focus,scrollTop:scrollHost?scrollHost.scrollTop:0};
    if(global.OneToneActionNav&&global.OneToneActionNav.openChannelEditor){
      global.OneToneActionNav.openChannelEditor({mappingId:m.id,channel:channel,focusId:focus,returnContext:ctx});
    }
  }
  function bindEvents(host){
    if(host.__habitWorkspaceBound) return;
    host.__habitWorkspaceBound=true;
    host.addEventListener('click',function(event){
      var target=event.target.closest&&event.target.closest('button,[data-habit-item]');
      if(!target) return;
      if(target.hasAttribute('data-habit-mode')){ switchMode(target.getAttribute('data-habit-mode')); return; }
      if(target.hasAttribute('data-habit-intro-cancel')){ ui().habitProgrammerIntroOpen=false; render(); return; }
      if(target.hasAttribute('data-habit-intro-continue')){ if(prefs()) prefs().markProgrammerIntroSeen(); switchMode('programmer',true); return; }
      if(target.hasAttribute('data-habit-mapping')){ event.stopPropagation(); state().selectedMappingId=target.getAttribute('data-habit-mapping'); render(); return; }
      if(target.hasAttribute('data-habit-channel')){ event.stopPropagation(); ui().habitWorkspaceChannel=target.getAttribute('data-habit-channel'); ui().habitWorkspaceItemId=defaultItem(ui().habitWorkspaceChannel); render(); return; }
      if(target.hasAttribute('data-habit-item')){ event.stopPropagation(); ui().habitWorkspaceItemId=target.getAttribute('data-habit-item'); render(); return; }
      if(target.hasAttribute('data-habit-section')){ ui().habitProgramSection=target.getAttribute('data-habit-section'); render(); return; }
      if(target.hasAttribute('data-habit-edit')){ openEditor(target.getAttribute('data-channel'),target.getAttribute('data-focus')); return; }
      if(target.hasAttribute('data-habit-fine')){ switchMode('programmer'); return; }
      if(target.hasAttribute('data-habit-add')){ var btn=document.getElementById('btnHabitHubHeadNew'); if(btn) btn.click(); }
    });
    host.addEventListener('keydown',function(event){
      var modeButton=event.target.closest&&event.target.closest('[data-habit-mode]');
      if(!modeButton||(event.key!=='ArrowLeft'&&event.key!=='ArrowRight')) return;
      event.preventDefault();
      var next=modeButton.parentElement&&modeButton.parentElement.querySelector(event.key==='ArrowRight'?'[data-habit-mode="programmer"]':'[data-habit-mode="quick"]');
      if(next){ next.focus(); next.click(); }
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
    document.addEventListener('keydown',function(event){
      if(event.key==='Escape'&&ui().habitProgrammerIntroOpen){ ui().habitProgrammerIntroOpen=false; render(); }
    });
  }
  function restoreReturnContext(context){
    if(!context||!context.mappingId) return;
    state().selectedMappingId=context.mappingId;
    ui().habitExperienceMode=context.mode==='programmer'?'programmer':'quick';
    ui().habitWorkspaceChannel=CHANNELS.indexOf(context.channel)>=0?context.channel:'key';
    ui().habitWorkspaceItemId=context.itemId||defaultItem(ui().habitWorkspaceChannel);
    ui().habitProgramSection=SECTIONS.indexOf(context.sectionId)>=0?context.sectionId:'scope';
    render();
    setTimeout(function(){
      var scrollHost=document.getElementById('settingsPanelWrap');
      if(scrollHost&&Number.isFinite(Number(context.scrollTop))) scrollHost.scrollTop=Number(context.scrollTop)||0;
      var focus=document.querySelector('[data-habit-channel="'+ui().habitWorkspaceChannel+'"]');
      if(focus) focus.focus();
    },0);
  }

  global.OneToneHabitWorkspace={render:render,buildWorkspaceModel:buildWorkspaceModel,switchMode:switchMode,restoreReturnContext:restoreReturnContext,defaultItem:defaultItem};
})((typeof window!=='undefined')?window:globalThis);
