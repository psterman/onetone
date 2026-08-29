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


  function keyCapShortLabel(key){
    key=String(key||'').trim();
    if(!key) return '\u2014';
    if(/^F\d{1,2}$/i.test(key)) return key.toUpperCase();
    var hidR=key.match(/^HID_R(\d{2})_/i);
    if(hidR) return 'R'+hidR[1];
    if(/^HID_/i.test(key)){
      var tail=key.replace(/^HID_/i,'').replace(/_/g,' ').trim();
      return tail.length>6?tail.slice(0,6):tail;
    }
    if(key.length<=5) return key;
    var friendly=friendlyKey(key);
    if(friendly.length<=6) return friendly;
    if(/^HID[\s\u952e]/i.test(friendly)){
      var m=friendly.match(/R\d{2}/i);
      if(m) return m[0].toUpperCase();
    }
    return friendly.slice(0,6);
  }

  function keyChannelVizHtml(mapping){
    var k=effectiveKey(mapping);
    var full=esc(friendlyKey(k.triggerKey));
    var tapLbl=esc(t('habitWsKeyTap','短按'));
    var holdLbl=esc(t('habitWsKeyHold','长按'));
    var tapAct=esc(t('habitWsKeyTapAction','开始输入'));
    var holdAct=esc(t('habitWsKeyHoldAction','切换引擎'));
    return '<div class="habit-ws-key-viz"><div class="habit-ws-key-cap" title="'+full+'"><span class="habit-ws-key-cap-label">'+full+'</span></div><ul class="habit-ws-key-modes"><li><i aria-hidden="true"></i><span>'+tapLbl+' \u2192 '+tapAct+'</span></li><li><i aria-hidden="true"></i><span>'+holdLbl+' \u2192 '+holdAct+'</span></li></ul></div><p class="habit-ws-key-viz-hint">'+esc(t('habitWsKeyVizHint','短按开始输入 · 长按切换引擎'))+'</p>';
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

  function channelLabel(ch){
    ch=String(ch||'').trim();
    if(ch==='softPad') return 'Soft Pad';
    if(ch==='camera') return lang()==='en'?'Camera':'摄像头';
    if(ch==='voice') return lang()==='en'?'Voice':'语音';
    return lang()==='en'?'Keys':'按键';
  }

  function channelKeyCardStats(rows){
    rows=arr(rows);
    var ov=rows.filter(function(r){ return r.priority==='overridden'; }).length;
    if(ov) return fmt(t('habitWsKeyCardStatsOv','{n} 条 · {ov} 覆盖'),{n:rows.length,ov:ov});
    return fmt(t('habitWsKeyCardStatsIn','{n} 条 · 继承'),{n:rows.length});
  }

  function channelOverviewSummary(mapping,channel){
    mapping=mapping||{};
    channel=String(channel||'').trim();
    if(channel==='key'){
      var ek=effectiveKey(mapping);
      var kn=friendlyKey(ek.triggerKey);
      return {
        line1:(lang()==='en'?kn+' tap / hold':kn+' 短按 / 长按'),
        line2:t('habitWsKeyCardDesc2','硬件启动键')
      };
    }
    if(channel==='voice'){
      var v=effectiveVoice(mapping);
      var phraseN=arr(v.wakePhrases).length;
      return {
        line1:phraseN?fmt(t('habitWsVoiceCardLine1','{n} 种说法任一命中'),{n:phraseN}):t('habitWsVoiceCardLine1Empty','未配置唤醒词'),
        line2:valueText(v.engine)+(v.modelPreset?' · '+v.modelPreset:'')
      };
    }
    if(channel==='camera'){
      var names=CAMERA_ITEMS.filter(function(item){
        var cv=effectiveCamera(mapping,item);
        return cv.enabled||cv.source==='overridden';
      }).slice(0,3).map(function(item){ return itemLabel(item); });
      return {
        line1:names.length?names.join(' / '):t('habitWsNone','未设置'),
        line2:t('habitWsCameraCardDesc2','眼神和口型触发')
      };
    }
    var pad=mapping.codexMicroPad&&typeof mapping.codexMicroPad==='object'?mapping.codexMicroPad:{};
    var keys=arr(pad.keys);
    return {
      line1:(pad.layoutProfile||'custom')+(lang()==='en'?' tray':' 托盘'),
      line2:fmt(t('habitWsPadCardLine2','{n} 个可自定义键'),{n:keys.length})
    };
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

  function humanizeTriggerMode(mode){
    mode=String(mode||'').trim().toLowerCase();
    if(mode==='hold') return lang()==='en'?'long press':'长按';
    if(mode==='tap') return lang()==='en'?'short press':'短按';
    return '';
  }

  function humanizeWhen(card,detail){
    detail=detail||{};
    card=card||{};
    var m=card.mapping||{};
    var raw=String(detail.when||'').trim();
    if(card.channel==='key'&&card.itemId==='key-main'){
      var k=effectiveKey(m);
      var key=friendlyKey(k.triggerKey);
      var mode=humanizeTriggerMode(k.triggerMode);
      if(lang()==='en') return mode?('Press '+key+' ('+mode+')'):('Press '+key);
      return mode?('按 '+key+'（'+mode+'）'):('按 '+key);
    }
    if(card.channel==='key'&&card.itemId==='key-finish'){
      return lang()==='en'?'After input completes':'输入完成后';
    }
    if(card.channel==='voice'){
      var sample=raw.split(' / ')[0]||raw;
      if(sample&&sample!==c('none')){
        return lang()==='en'?('Say "'+sample+'"'):('说「'+sample+'」');
      }
    }
    if(card.channel==='camera') return itemLabel(card.item)||raw;
    return raw.replace(/\s*·\s*(tap|hold|\d+ms)/gi,'').trim()||raw||c('none');
  }

  function humanizeWhat(card,detail){
    detail=detail||{};
    card=card||{};
    var what=String(detail.what||'').trim();
    if(card.channel==='key'&&card.itemId==='key-main'){
      var k=effectiveKey(card.mapping||{});
      var target=friendlyKey(k.targetKey);
      return lang()==='en'?('Start input to '+target):('开始输入到 '+target);
    }
    return what||c('none');
  }

  function noviceFinishText(card,detail){
    detail=detail||{};
    card=card||{};
    if(card.channel==='key'&&card.itemId==='key-finish') return String(detail.what||'').trim()||'\u2014';
    if(card.channel==='voice'&&(card.itemId==='voice-end'||card.itemId==='voice-cancel'||card.itemId==='voice-send')){
      return String(detail.what||'').trim()||'\u2014';
    }
    if(card.channel==='key'&&card.itemId==='key-main'){
      var k=effectiveKey(card.mapping||{});
      var parts=[];
      if(k.autoEnterEnabled) parts.push(lang()==='en'?'Send automatically':'自动发送');
      else parts.push(lang()==='en'?'Keep text for review':'保留文字等待确认');
      if(k.cancelEnabled) parts.push(lang()==='en'?'Cancel anytime':'可随时取消');
      return parts.length?parts.join(lang()==='en'?', ':'，'):'\u2014';
    }
    return '\u2014';
  }

  function noviceDetailFields(card){
    card=card||{};
    var detail=card.detail||{};
    var enabled=detail.enabled!==false;
    var rawWhen=String(detail.when||'');
    var proParts=[];
    if(rawWhen.indexOf('\u00b7')>=0||rawWhen.indexOf('·')>=0) proParts.push(rawWhen);
    if(detail.source&&detail.source.label) proParts.push(detail.source.label);
    return {
      trigger:humanizeWhen(card,detail),
      action:humanizeWhat(card,detail),
      finish:noviceFinishText(card,detail),
      enabled:enabled?(lang()==='en'?'On':'已开启'):(lang()==='en'?'Off':'已关闭'),
      lastMod:card.lastMod||'',
      proMeta:proParts.join(' \u00b7 ')
    };
  }

  function storyLineHtml(card,detail){
    detail=detail||{};
    card=card||{};
    var trigger=humanizeWhen(card,detail);
    var action=humanizeWhat(card,detail);
    var finish=noviceFinishText(card,detail);
    if(finish&&finish!=='\u2014') return trigger+' \u2192 '+action+' \u2192 '+finish;
    return trigger+' \u2192 '+action;
  }

  function noviceDimToChannel(dim){
    dim=String(dim||'').trim();
    if(dim==='voice') return 'voice';
    if(dim==='cam') return 'camera';
    if(dim==='softpad') return 'softPad';
    return 'key';
  }

  function channelToNoviceDim(channel){
    channel=String(channel||'').trim();
    if(channel==='voice') return 'voice';
    if(channel==='camera') return 'cam';
    if(channel==='softPad') return 'softpad';
    return 'key';
  }

  function noviceDimLabel(dim){
    dim=String(dim||'key').trim();
    if(dim==='voice') return lang()==='en'?'Voice':'语音';
    if(dim==='cam') return lang()==='en'?'Camera':'摄像头';
    if(dim==='softpad') return 'Soft Pad';
    return lang()==='en'?'Keys':'按键';
  }

  function noviceDimGlanceHtml(dim,mapping){
    mapping=mapping||{};
    var channel=noviceDimToChannel(dim);
    var sum=channelOverviewSummary(mapping,channel);
    var line=sum.line1+(sum.line2?(' \u00b7 '+sum.line2):'');
    return '<div class="habit-novice-dim-glance" role="note"><span class="habit-novice-dim-glance-lbl">'+esc(fmt(t('habitNoviceDimGlanceLbl','当前在看：{dim}'),{dim:noviceDimLabel(dim)}))+'</span><span class="habit-novice-dim-glance-val">'+esc(line)+'</span></div>';
  }

  function ruleRowText(card){
    card=card||{};
    var detail=card.detail||{};
    var m=card.mapping||{};
    var what=String(detail.what||'').trim()||c('none');
    if(card.channel==='key'&&card.itemId==='key-main'){
      var k=effectiveKey(m);
      var keyName=friendlyKey(k.triggerKey);
      return lang()==='en'?('Press '+keyName+' → '+what):('按 '+keyName+' → '+what);
    }
    if(card.channel==='key'&&card.itemId==='key-finish'){
      return lang()==='en'?('After input → '+what):('输入完成后 → '+what);
    }
    if(card.channel==='voice'&&card.itemId==='voice-wake'){
      var when=String(detail.when||'').trim();
      var sample=when.split(' / ')[0]||when;
      return lang()==='en'?('Say "'+sample+'" → '+what):('说「'+sample+'」→ '+what);
    }
    if(card.channel==='camera'){
      var ci=cameraItem(card.itemId);
      var label=itemLabel(ci);
      return label+' → '+what;
    }
    if(card.channel==='softPad'){
      return itemLabel(card.item)+' → '+what;
    }
    return String(detail.when||'')+' → '+what;
  }

  function ruleRowMeta(card){
    card=card||{};
    var detail=card.detail||{};
    var src=detail.source&&detail.source.id==='overridden'?'overridden':'inherited';
    if(src==='overridden'){
      return lang()==='en'?'Custom for this scenario':'本场景单独设置';
    }
    return lang()==='en'?'From universal settings':'来自通用设置';
  }

  function buildRuleRows(mapping,opts){
    opts=opts||{};
    if(!mapping||!mapping.id) return [];
    var channel=String(opts.channel||'all').trim();
    var rows=buildNoviceCards([mapping]).map(function(card){
      var detail=card.detail||{};
      var priority=detail.source&&detail.source.id==='overridden'?'overridden':'inherited';
      return {
        id:card.id,
        channel:card.channel,
        itemId:card.itemId,
        mapping:card.mapping,
        scene:card.scene,
        priority:priority,
        txt:ruleRowText(card),
        meta:ruleRowMeta(card),
        enabled:detail.enabled!==false,
        focus:detail.focus||'',
        detail:detail
      };
    });
    if(channel&&channel!=='all') rows=rows.filter(function(row){ return row.channel===channel; });
    rows.sort(function(a,b){
      if(a.priority===b.priority) return 0;
      return a.priority==='overridden'?-1:1;
    });
    return rows;
  }

  function inheritSummary(mapping){
    var rows=buildRuleRows(mapping,{channel:'all'});
    var overrideCount=0,inheritedCount=0;
    rows.forEach(function(row){
      if(row.priority==='overridden') overrideCount++;
      else inheritedCount++;
    });
    return {overrideCount:overrideCount,inheritedCount:inheritedCount,total:rows.length};
  }

  function channelVizHtml(channel,mapping){
    channel=String(channel||'all').trim();
    mapping=mapping||{};
    if(channel==='all'){
      var title='<h3 class="habit-ws-viz-title">'+esc(t('habitWsVizOverviewTitle','输入通道总览'))+'</h3>';
      var hint='<p class="habit-ws-viz-hint">'+esc(t('habitWsVizOverviewHint','点卡片跳到对应通道；下方规则清单会同步过滤'))+'</p>';
      var cards=CHANNELS.map(function(ch){
        var rows=buildRuleRows(mapping,{channel:ch});
        var sum=channelOverviewSummary(mapping,ch);
        var stats=channelKeyCardStats(rows);
        return '<button type="button" class="habit-ws-key-card" data-habit-channel="'+ch+'" data-channel="'+ch+'"><div class="habit-ws-key-card-head"><span class="habit-ws-key-card-icon" aria-hidden="true">'+cardEmoji(ch)+'</span><b>'+esc(channelLabel(ch))+'</b><i>'+esc(stats)+'</i></div><div class="habit-ws-key-card-desc">'+esc(sum.line1)+'<br>'+esc(sum.line2)+'</div></button>';
      }).join('');
      return title+hint+'<div class="habit-ws-key-grid">'+cards+'</div>';
    }
    if(channel==='key'){
      var k=effectiveKey(mapping);
      return '<div class="habit-ws-viz-key">'+keyChannelVizHtml(mapping)+'</div>';
    }
    if(channel==='voice'){
      var v=effectiveVoice(mapping);
      var phrases=arr(v.wakePhrases).slice(0,4);
      return '<div class="habit-ws-viz-voice"><div class="habit-ws-viz-chips">'+phrases.map(function(p){ return '<span class="habit-ws-viz-chip">'+esc(p)+'</span>'; }).join('')+(arr(v.wakePhrases).length>4?'<span class="habit-ws-viz-chip is-more">+'+(arr(v.wakePhrases).length-4)+'</span>':'')+'</div></div>';
    }
    if(channel==='camera'){
      var lines=CAMERA_ITEMS.filter(function(item){
        var cv=effectiveCamera(mapping,item);
        return cv.enabled||cv.source==='overridden';
      }).slice(0,4).map(function(item){
        var cv=effectiveCamera(mapping,item);
        return '<span>'+esc(itemLabel(item))+' → '+esc(valueText(cv.action))+'</span>';
      });
      return '<div class="habit-ws-viz-camera">'+lines.join('')+'</div>';
    }
    var pad=mapping.codexMicroPad&&typeof mapping.codexMicroPad==='object'?mapping.codexMicroPad:{};
    var keys=arr(pad.keys);
    return '<div class="habit-ws-viz-pad"><p>'+esc((pad.layoutProfile||'custom')+' · '+keys.length+(lang()==='en'?' keys':' 个键位'))+'</p></div>';
  }

  function inheritHintHtml(mapping){
    var sum=inheritSummary(mapping);
    if(!sum.overrideCount){
      return '<div class="habit-novice-inherit-hint is-universal"><span>'+esc(t('habitNoviceInheritAll','完全沿用通用设置'))+'</span></div>';
    }
    return '<div class="habit-novice-inherit-hint"><span>'+esc(fmt(t('habitNoviceInheritPartial','沿用通用设置 · 本场景单独改了 {n} 项'),{n:sum.overrideCount}))+'</span><button type="button" class="habit-novice-inherit-link" data-habit-inherit-peek>'+esc(t('habitNoviceInheritPeek','看改了什么 →'))+'</button></div>';
  }

  function inheritChainHtml(mapping){
    mapping=mapping||{};
    var d=diff();
    var baseline=d.findGlobalBaselineMapping?d.findGlobalBaselineMapping(cfg(),global.OneToneMappingCore):null;
    if(!baseline||!mapping.id||baseline.id===mapping.id) return '';
    if(d.isAppScenarioMapping&&!d.isAppScenarioMapping(mapping)) return '';
    var baseSum=inheritSummary(baseline);
    var sum=inheritSummary(mapping);
    var baseNode='<div class="habit-ws-inherit-node"><div class="t">'+esc(sceneName(baseline))+'</div><div class="s">'+esc(fmt(t('habitWsInheritBaselineRules','{n} 条规则 · 全局默认'),{n:baseSum.total}))+'</div></div>';
    var link='<div class="habit-ws-inherit-link" aria-hidden="true"><svg width="64" height="12" viewBox="0 0 64 12" fill="none"><path d="M0 6h54" stroke="currentColor"/><path d="M50 2l5 4-5 4" stroke="currentColor" fill="none"/></svg><span>'+esc(t('habitWsInheritLink','继承'))+'</span></div>';
    var curSub=esc(fmt(t('habitWsInheritInheritedCount','{n} 条继承'),{n:sum.inheritedCount}));
    if(sum.overrideCount) curSub+=' · <b class="habit-ws-inherit-ov">'+esc(fmt(t('habitWsInheritOverrideCount','{n} 项被覆盖'),{n:sum.overrideCount}))+'</b>';
    var curNode='<div class="habit-ws-inherit-node is-current"><div class="t">'+esc(sceneName(mapping))+'</div><div class="s">'+curSub+'</div></div>';
    return '<div class="habit-ws-inherit-chain" role="group" aria-label="'+esc(t('habitWsInheritChainLabel','继承关系'))+'">'+baseNode+link+curNode+'</div>';
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
            title:itemLabel(item),
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
    return '<aside class="'+esc(asideClass)+'"><div class="habit-ws-sidebar-head"><label class="habit-ws-search"><span aria-hidden="true">\u2315</span><input type="search" data-habit-search value="'+esc(opts.searchQuery!=null?opts.searchQuery:ui().habitWorkspaceSearch||'')+'" placeholder="'+esc(c('search'))+'" aria-label="'+esc(c('search'))+'"></label>'+batchBtn+'</div>'+wsSelectionBar(list.length)+usageOverviewHtml()+'<div class="habit-ws-app-list" role="listbox">'+listHtml+'</div><button type="button" class="habit-ws-add" data-habit-add>'+esc(c('addApp'))+'</button></aside>';
  }

  function usageOverviewHtml(){
    var api=global.OneToneHabitActionStats;
    if(!api||!api.overviewHtml) return '';
    return api.overviewHtml(5);
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

  function exportMappingJson(mapping){
    mapping=mapping&&typeof mapping==='object'?mapping:{};
    return {
      version:1,
      kind:'onetone-habit-mapping',
      exportedAt:new Date().toISOString(),
      mapping:mapping
    };
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
    buildRuleRows:buildRuleRows,
    inheritSummary:inheritSummary,
    channelVizHtml:channelVizHtml,
    channelLabel:channelLabel,
    cardEmoji:cardEmoji,
    inheritHintHtml:inheritHintHtml,
    inheritChainHtml:inheritChainHtml,
    noviceDimGlanceHtml:noviceDimGlanceHtml,
    noviceDimToChannel:noviceDimToChannel,
    channelToNoviceDim:channelToNoviceDim,
    ruleRowText:ruleRowText,
    storyHtml:storyHtml,
    storyLineHtml:storyLineHtml,
    humanizeWhen:humanizeWhen,
    humanizeWhat:humanizeWhat,
    noviceDetailFields:noviceDetailFields,
    noviceFinishText:noviceFinishText,
    appListHtml:appListHtml,
    deleteMapping:deleteMapping,
    resetBaselineMapping:resetBaselineMapping,
    friendlyKey:friendlyKey,
    exportMappingJson:exportMappingJson
  };
})((typeof window!=='undefined')?window:globalThis);
