(function(global){
  'use strict';

  var CHANNELS=['key','voice','camera','softPad'];
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
  var CHANNEL_DIM_MAP={key:'key',voice:'voice',camera:'cam',softPad:'softpad'};
  var ITEM_DIM_MAP={
    'key-main':'key','key-finish':'key',
    'voice-wake':'voice','voice-end':'voice','voice-cancel':'voice','voice-send':'voice','voice-engine':'voice',
    'softpad-layout':'softpad','softpad-display':'softpad','softpad-status':'softpad'
  };
  var ITEM_SCENE_MAP={
    'key-main':'begin','voice-wake':'begin','softpad-layout':'begin','softpad-display':'begin','softpad-status':'begin',
    'key-finish':'end','voice-end':'end','voice-cancel':'end','voice-send':'end',
    'camera-away':'general','camera-return':'general','camera-shake':'general','camera-blink':'general',
    'camera-palm':'general','camera-ok':'general','camera-fist':'general','camera-wave':'general'
  };
  CAMERA_ITEMS.forEach(function(item){
    if(!ITEM_SCENE_MAP[item.id]) ITEM_SCENE_MAP[item.id]='general';
    if(!ITEM_DIM_MAP[item.id]) ITEM_DIM_MAP[item.id]='cam';
  });

  var COPY_KEYS={
    search:'habitWsSearch',universal:'habitWsUniversal',enabled:'habitWsEnabled',disabled:'habitWsDisabled',
    addApp:'habitWsAddApp',inherited:'habitWsInherited',global:'habitWsGlobal',overrides:'habitWsOverrides',
    none:'habitWsNone',on:'habitWsOn',off:'habitWsOff',foreground:'habitWsForeground',anytime:'habitWsAnytime',
    storyIn:'habitStoryIn',storyPress:'habitStoryPress',storyThen:'habitStoryThen',storyFinish:'habitStoryFinish'
  };

  function state(){ return global.OneToneState&&global.OneToneState.state||{}; }
  function ui(){ return global.OneToneState&&global.OneToneState.ui||{}; }
  function cfg(){ return state().config||{}; }
  function diff(){ return global.OneToneHabitOverrideDiff||{}; }
  function lang(){
    var value=global.OneToneI18n&&global.OneToneI18n.getLang?global.OneToneI18n.getLang():document.documentElement.lang;
    return String(value||'zh').toLowerCase().indexOf('en')===0?'en':'zh';
  }
  function t(key,fb){
    try{
      var v=global.OneToneI18n&&global.OneToneI18n.t?global.OneToneI18n.t(key):key;
      if(v&&v!==key) return v;
    }catch(_){}
    return fb!=null?fb:key;
  }
  function c(key){ return t(COPY_KEYS[key]||key, key); }
  function esc(value){ return String(value==null?'':value).replace(/[&<>'"]/g,function(ch){ return {'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]; }); }
  function fmt(text,values){
    return String(text||'').replace(/\{(\w+)\}/g,function(_,key){ return values&&values[key]!=null?String(values[key]):''; });
  }
  function arr(value){ return Array.isArray(value)?value:[]; }
  function pad2(n){ return n<10?'0'+n:String(n); }
  var MIDDOT='\u00B7';

  function formatRelativeTime(ts){
    if(!ts) return '';
    var delta=Date.now()-Number(ts);
    if(delta<60000) return t('habitHubUpdatedJustNow','刚刚更新');
    if(delta<3600000) return t('habitHubUpdatedMinutes','{n} 分钟前更新').replace('{n}',String(Math.floor(delta/60000)));
    if(delta<86400000) return t('habitHubUpdatedHours','{n} 小时前更新').replace('{n}',String(Math.floor(delta/3600000)));
    var d=new Date(ts);
    var today=new Date();
    if(d.toDateString()===today.toDateString()) return t('habitHubUpdatedToday','今天 {time} 更新').replace('{time}',pad2(d.getHours())+':'+pad2(d.getMinutes()));
    if(delta<604800000){
      var days=Math.floor(delta/86400000);
      return lang()==='en'?(days+' day'+(days>1?'s':'')+' ago'):(days+' 天前');
    }
    return (d.getMonth()+1)+'/'+d.getDate();
  }

  function chipHtml(type,label,attrs){
    attrs=attrs||{};
    var extra='';
    Object.keys(attrs).forEach(function(k){
      if(k==='class') return;
      extra+=' '+k+'="'+esc(String(attrs[k]))+'"';
    });
    var cls='chip '+String(type||'').trim();
    if(attrs.class) cls+=' '+attrs.class;
    return '<span class="'+esc(cls)+'"'+extra+'>'+label+'</span>';
  }

  function resolveHabitView(card){
    card=card||{};
    var mapping=card.mapping||{};
    var channel=String(card.channel||'').trim();
    var itemId=String(card.itemId||'').trim();
    var dim=String(card.mappingDim||card.dim||mapping.dim||'').trim()
      ||ITEM_DIM_MAP[itemId]
      ||CHANNEL_DIM_MAP[channel]
      ||'key';
    var scene=String(card.mappingScene||card.scene||mapping.scene||'').trim()
      ||ITEM_SCENE_MAP[itemId]
      ||'begin';
    if(dim==='softPad') dim='softpad';
    return {dim:dim,scene:scene};
  }

  function appName(m){
    if(!m) return '\u2014';
    var id=String(m.appTargetId||'').trim();
    if(!id) return c('universal');
    var rules=global.OneToneAppBehaviorRules;
    return rules&&rules.appDisplayName?String(rules.appDisplayName(id)||id):id;
  }
  function sceneName(m){
    var hp=global.OneToneHabitProfile;
    return hp&&hp.habitDisplayName?hp.habitDisplayName(m):(String(m&&m.group||m&&m.label||m&&m.id||'\u2014'));
  }
  function appIconHtml(m,opts){
    opts=opts||{};
    var iconClass=opts.iconClass||'habit-ws-app-icon';
    var appId=String(m&&m.appTargetId||'').trim();
    var name=appName(m);
    var presets=global.OneToneAppTargetPresets;
    if(appId&&presets&&presets.presetById){
      var preset=presets.presetById(appId);
      if(preset&&preset.icon){
        return '<img class="'+esc(iconClass)+' habit-ws-app-icon--img" src="'+esc(preset.icon)+'" alt="" decoding="async" />';
      }
    }
    var rulesApi=global.OneToneAppBehaviorRules;
    var customs=rulesApi&&rulesApi.customRulesForMapping?rulesApi.customRulesForMapping(m):[];
    var rule=customs&&customs[0];
    if(rule){
      var url=String(rule.iconDataUrl||'').trim();
      if(!url&&rulesApi.ruleIconDataUrl) url=String(rulesApi.ruleIconDataUrl(rule)||'').trim();
      if(url){
        return '<img class="'+esc(iconClass)+' habit-ws-app-icon--img" src="'+esc(url)+'" alt="" decoding="async" />';
      }
    }
    var letter=!appId?'\u221E':(String(name||'').trim()[0]||'?').toUpperCase();
    return '<span class="'+esc(iconClass)+'" aria-hidden="true">'+esc(letter)+'</span>';
  }

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
  function itemLabel(item){ return item?(lang()==='en'?item.en:item.zh):'\u2014'; }

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


  function friendlyKey(key){
    key=String(key||'').trim();
    if(!key) return '\u2014';
    if(global.OneToneKeyLabels&&global.OneToneKeyLabels.friendlyKeyName){
      return global.OneToneKeyLabels.friendlyKeyName(key,global.OneToneI18n&&global.OneToneI18n.getLang?global.OneToneI18n.getLang():'zh')||key;
    }
    return key;
  }

  function cardEmoji(channel){
    if(channel==='voice') return '\uD83C\uDF99';
    if(channel==='camera') return '\uD83D\uDCF7';
    if(channel==='softPad') return '\u2318';
    return '\u2328';
  }

  function storyHtml(card,detail){
    detail=detail||{};
    var m=card.mapping||{};
    var app=appName(m);
    var appChip=chipHtml('app-tag',esc(app),{ 'data-chip':'app' });
    var when=esc(detail.when||'');
    var what=esc(detail.what||'');
    var keyPart='';
    if(card.channel==='key'){
      var k=effectiveKey(m);
      keyPart=chipHtml('key',esc(friendlyKey(k.triggerKey)),{ 'data-chip':'key' });
    }else if(card.channel==='voice'&&card.itemId==='voice-wake'){
      keyPart=chipHtml('trigger',when,{ 'data-chip':'trigger' });
    }else if(card.channel==='camera'){
      keyPart=chipHtml('key','\uD83D\uDC4B '+when,{ 'data-chip':'key' });
    }else{
      keyPart=chipHtml('key',when,{ 'data-chip':'key' });
    }
    var actionChip=chipHtml('action','\uD83C\uDF99 '+what,{ 'data-chip':'action' });
    if(card.channel==='key'&&card.itemId==='key-finish'){
      actionChip=chipHtml('action','\u23F9 '+what,{ 'data-chip':'action' });
    }
    return esc(c('storyIn'))+' '+appChip+' '+esc(c('storyPress'))+' '+keyPart+esc(c('storyThen'))+actionChip+esc(c('storyFinish'));
  }

  function buildNoviceCards(mappings){
    mappings=arr(mappings).filter(function(m){ return m&&m.id; });
    var cards=[];
    mappings.forEach(function(m){
      CHANNELS.forEach(function(channel){
        quickItems(channel).forEach(function(item){
          var detail=quickDetail(m,channel,item.id);
          var view=resolveHabitView({
            mapping:m,channel:channel,itemId:item.id,
            mappingDim:m.dim,mappingScene:m.scene
          });
          cards.push({
            id:m.id+'::'+channel+'::'+item.id,
            mappingId:m.id,
            mapping:m,
            channel:channel,
            itemId:item.id,
            item:item,
            detail:detail,
            dim:view.dim,
            scene:view.scene,
            title:sceneName(m)+MIDDOT+' '+itemLabel(item),
            emoji:cardEmoji(channel),
            paused:!detail.enabled,
            lastMod:formatRelativeTime(m.updatedAt||m.lastUsedAt),
            demo:arr(m.demo)
          });
        });
      });
    });
    return cards;
  }

  function wsSelectedIds(){
    if(!Array.isArray(ui().habitHubSelectedIds)) ui().habitHubSelectedIds=[];
    return ui().habitHubSelectedIds;
  }
  function wsBatchMode(){
    return !!ui().habitHubBatchMode||wsSelectedIds().length>0;
  }
  function wsIsSelected(id){
    id=String(id||'').trim();
    return id&&wsSelectedIds().indexOf(id)>=0;
  }
  function wsSelectionBar(totalCount){
    var n=wsSelectedIds().length;
    if(!n) return '';
    var html='<div class="habit-hub-selection-bar habit-ws-selection-bar" role="status">';
    html+='<span class="habit-hub-selection-count">'+esc(fmt(t('habitHubSelectedCount','已选 {n} 个'),{n:n}))+'</span>';
    if(ui().habitHubBatchConfirm){
      html+='<span class="habit-hub-selection-ask">'+esc(fmt(t('habitHubBatchDeleteConfirm','确认删除选中的 {n} 个场景？'),{n:n}))+'</span>';
      html+='<button type="button" class="habit-hub-act is-cta is-danger" data-habit-batch-del-confirm>'+esc(t('habitHubBatchDeleteDo','确认删除'))+'</button>';
      html+='<button type="button" class="habit-hub-act is-cta" data-habit-batch-del-cancel>'+esc(t('habitScenarioCancel','取消'))+'</button>';
    }else{
      html+='<button type="button" class="habit-hub-act is-cta is-danger" data-habit-batch-del>'+esc(t('habitHubBatchDelete','批量删除'))+'</button>';
      if(totalCount>n){
        html+='<button type="button" class="habit-hub-act is-cta" data-habit-select-all>'+esc(t('habitHubSelectAll','全选'))+'</button>';
      }
      html+='<button type="button" class="habit-hub-act is-cta" data-habit-clear-sel>'+esc(t('habitHubClearSelection','取消选择'))+'</button>';
    }
    html+='</div>';
    return html;
  }

  function appListHtml(model,opts){
    opts=opts||{};
    var variant=opts.variant||'ws';
    var asideClass=variant==='novice'?'habit-novice-apps habit-ws-apps':'habit-ws-apps';
    var query=String(opts.searchQuery!=null?opts.searchQuery:ui().habitWorkspaceSearch||'').trim().toLowerCase();
    var list=arr(model&&model.mappings).filter(function(m){
      return !query||(appName(m)+' '+sceneName(m)).toLowerCase().indexOf(query)>=0;
    });
    var baseline=diff().findGlobalBaselineMapping?diff().findGlobalBaselineMapping(cfg(),global.OneToneMappingCore):null;
    var baselineId=baseline&&baseline.id?String(baseline.id):'';
    if(baselineId){
      list=list.slice().sort(function(a,b){
        var ab=String(a&&a.id||'')===baselineId?0:1;
        var bb=String(b&&b.id||'')===baselineId?0:1;
        return ab-bb;
      });
    }
    var selectedId=model&&model.mapping?model.mapping.id:null;
    var batchOn=wsBatchMode();
    var batchBtn='<button type="button" class="habit-ws-batch-toggle'+(batchOn?' is-active':'')+'" data-habit-batch-toggle aria-pressed="'+(batchOn?'true':'false')+'">'+esc(batchOn?t('habitHubBatchDone','完成批量'):t('habitHubBatchManage','批量管理'))+'</button>';
    var listHtml=list.map(function(m){
      var selected=m.id===selectedId;
      var checked=wsIsSelected(m.id);
      var checkHtml='';
      if(batchOn){
        checkHtml='<label class="habit-ws-app-check"><input type="checkbox" data-habit-select="'+esc(m.id)+'"'+(checked?' checked':'')+' /><span class="sr-only">'+esc(t('habitHubSelectScenario','选择此场景'))+'</span></label>';
      }
      var stateHtml=batchOn?'':('<span class="habit-ws-app-state '+(m.enabled===false?'is-off':'')+'">'+esc(m.enabled===false?c('disabled'):c('enabled'))+'</span>');
      var rowCls='habit-ws-app'+(selected&&!batchOn?' is-selected':'')+(checked?' is-batch-selected':'')+(batchOn?' is-batch-mode':'');
      var inner=appIconHtml(m)+'<span class="habit-ws-app-copy"><strong>'+esc(appName(m))+'</strong><small>'+esc(sceneName(m))+'</small></span>'+stateHtml;
      if(batchOn){
        return '<div class="habit-ws-app-row is-batch-mode">'+checkHtml+'<button type="button" class="'+rowCls+'" data-habit-mapping="'+esc(m.id)+'" role="option" aria-selected="'+(selected&&!batchOn?'true':'false')+'">'+inner+'</button></div>';
      }
      return '<button type="button" class="'+rowCls+'" data-habit-mapping="'+esc(m.id)+'" role="option" aria-selected="'+(selected?'true':'false')+'">'+inner+'</button>';
    }).join('');
    return '<aside class="'+esc(asideClass)+'"><div class="habit-ws-sidebar-head"><label class="habit-ws-search"><span aria-hidden="true">\u2315</span><input type="search" data-habit-search value="'+esc(opts.searchQuery!=null?opts.searchQuery:ui().habitWorkspaceSearch||'')+'" placeholder="'+esc(c('search'))+'" aria-label="'+esc(c('search'))+'"></label>'+batchBtn+'</div>'+wsSelectionBar(list.length)+'<div class="habit-ws-app-list" role="listbox">'+listHtml+'</div><button type="button" class="habit-ws-add" data-habit-add>'+esc(c('addApp'))+'</button></aside>';
  }

  function deleteMapping(id){
    var ids=[String(id||'').trim()].filter(Boolean);
    if(!ids.length) return;
    var config=state().config||{};
    var diff=global.OneToneHabitOverrideDiff;
    var core=global.OneToneMappingCore;
    if(diff&&diff.isGlobalBaselineMapping&&core){
      var blocked=ids.some(function(x){
        var m=core.byId?core.byId(x):null;
        return !!(m&&diff.isGlobalBaselineMapping(m,config,core));
      });
      if(blocked){
        if(global.OneToneAppToast) global.OneToneAppToast.show(t('habitBaselineDeleteBlocked','通用习惯不能删除，请使用「重置 baseline」'),'warn');
        return;
      }
    }
    if(!Array.isArray(config.mappings)) return;
    if(!Array.isArray(config.trash)) config.trash=[];
    var remove={};
    ids.forEach(function(x){ remove[x]=true; });
    var kept=[];
    config.mappings.forEach(function(m){
      if(!m||!remove[m.id]){ kept.push(m); return; }
      var removed=Object.assign({},m);
      removed.enabled=false;
      config.trash.unshift(removed);
    });
    config.mappings=kept;
    if(remove[String(state().selectedMappingId||'')]){
      state().selectedMappingId=config.mappings[0]&&config.mappings[0].id||null;
    }
    if(remove[String(config.activeSceneId||'')]){
      config.activeSceneId=config.mappings[0]&&config.mappings[0].id||'';
    }
    config.mappings.forEach(function(m,i){ if(m) m.order=i; });
    ui().habitHubConfirmDelId='';
    ui().habitHubSelectedIds=[];
    var hub=global.OneToneHabitHub;
    if(hub&&hub.scheduleHubPaint) hub.scheduleHubPaint();
    else if(global.OneToneHabitWorkspace&&global.OneToneHabitWorkspace.render) global.OneToneHabitWorkspace.render();
    var saveAsync=global.OneToneConfigPersist&&global.OneToneConfigPersist.saveAsync;
    var save=global.OneToneConfigPersist&&global.OneToneConfigPersist.save;
    var done=function(){
      if(global.OneToneMappingTrashMenu&&global.OneToneMappingTrashMenu.renderTrashList){
        global.OneToneMappingTrashMenu.renderTrashList();
      }
      if(hub&&hub.scheduleHubPaint) hub.scheduleHubPaint();
      else if(global.OneToneHabitWorkspace&&global.OneToneHabitWorkspace.render) global.OneToneHabitWorkspace.render();
      if(global.OneToneAppToast) global.OneToneAppToast.show(t('movedToTrash','已移入回收站'),'scheme');
    };
    if(saveAsync) saveAsync({source:'mapping'}).then(done).catch(done);
    else{
      if(save) save();
      done();
    }
  }

  function resetBaselineMapping(){
    var config=state().config||{};
    var diff=global.OneToneHabitOverrideDiff;
    var core=global.OneToneMappingCore;
    if(!diff||!diff.findGlobalBaselineMapping||!core) return false;
    var baseline=diff.findGlobalBaselineMapping(config,core);
    if(!baseline) return false;
    baseline.triggerKey='';
    baseline.targetKey='';
    baseline.triggerMode='tap';
    baseline.triggerSource=null;
    baseline.sourceKey='';
    baseline.sourceTime='';
    baseline.switchKeys=[];
    baseline.voiceOverride=null;
    baseline.cameraOverride=null;
    baseline.voiceCommands=null;
    baseline.acousticVoiceCommands=null;
    baseline.appBehaviorRules=[];
    baseline.agentBindings=null;
    baseline.agentTemplateId='';
    baseline.agentProviderId='';
    baseline.codexMicroPad=null;
    baseline.updatedAt=Date.now();
    if(global.OneToneAppToast) global.OneToneAppToast.show(t('habitBaselineResetDone','已重置通用习惯'),'scheme');
    var hub=global.OneToneHabitHub;
    if(hub&&hub.scheduleHubPaint) hub.scheduleHubPaint();
    var saveAsync=global.OneToneConfigPersist&&global.OneToneConfigPersist.saveAsync;
    var save=global.OneToneConfigPersist&&global.OneToneConfigPersist.save;
    if(saveAsync) saveAsync({source:'resetBaseline'});
    else if(save) save();
    return true;
  }

  global.OneToneHabitShared={
    CHANNELS:CHANNELS,
    CAMERA_ITEMS:CAMERA_ITEMS,
    ITEM_SCENE_MAP:ITEM_SCENE_MAP,
    ITEM_DIM_MAP:ITEM_DIM_MAP,
    CHANNEL_DIM_MAP:CHANNEL_DIM_MAP,
    resolveHabitView:resolveHabitView,
    formatRelativeTime:formatRelativeTime,
    chipHtml:chipHtml,
    appName:appName,
    sceneName:sceneName,
    appIconHtml:appIconHtml,
    quickItems:quickItems,
    itemLabel:itemLabel,
    quickDetail:quickDetail,
    buildNoviceCards:buildNoviceCards,
    storyHtml:storyHtml,
    appListHtml:appListHtml,
    deleteMapping:deleteMapping,
    resetBaselineMapping:resetBaselineMapping,
    friendlyKey:friendlyKey
  };
})((typeof window!=='undefined')?window:globalThis);
