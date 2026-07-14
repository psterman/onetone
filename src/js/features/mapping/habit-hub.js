(function(global){
  'use strict';

  var $=function(id){ return global.OneToneDom.$(id); };
  var t=function(key){ return global.OneToneI18n.t(key); };
  function state(){ return global.OneToneState.state; }
  function ui(){ return global.OneToneState.ui; }
  function core(){ return global.OneToneMappingCore; }
  function flow(){ return global.OneToneSceneFlowSummary; }

  var TYPE_ORDER={combo:0,app:1,voice:2,keys:3};
  var TYPE_ICON={
    keys:'<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8"/></svg>',
    voice:'<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><line x1="12" y1="19" x2="12" y2="22"/></svg>',
    app:'<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>',
    combo:'<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M16 3h5v5"/><path d="M8 3H3v5"/><path d="M12 22v-8.3a4 4 0 0 0-1.172-2.828L4 7"/></svg>'
  };

  function esc(s){
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
  }

  function hooks(){
    return global.__vp_mapping_list_ui_hooks__||global.__vp_mapping_trash_menu_hooks__||{};
  }

  function hp(){
    return global.OneToneHabitProfile;
  }

  function habitName(m){
    if(hp()&&hp().habitDisplayName) return hp().habitDisplayName(m);
    if(!m) return '—';
    if((m.group||'').trim()) return m.group.trim();
    if(global.OneToneHomeScheme&&global.OneToneHomeScheme.shortName) return global.OneToneHomeScheme.shortName(m);
    if((m.label||'').trim()) return m.label.trim();
    return m.id||'—';
  }

  function hasKeyParts(m){
    if(hp()&&hp().hasKeyParts) return hp().hasKeyParts(m);
    if(!m||!core()) return false;
    var trig=core().editorTrigger?core().editorTrigger(m):String(m.triggerKey||'').trim();
    var tgt=core().editorTarget?core().editorTarget(m):String(m.targetKey||'').trim();
    return !!(trig||tgt);
  }

  function hasVoiceParts(m,cfg){
    if(hp()&&hp().hasVoiceParts) return hp().hasVoiceParts(m,cfg);
    return false;
  }

  function configuredAppIds(m){
    if(hp()&&hp().configuredAppIds) return hp().configuredAppIds(m);
    return [];
  }

  function hasAppParts(m){
    if(hp()&&hp().hasAppParts) return hp().hasAppParts(m);
    return configuredAppIds(m).length>0;
  }

  function classifyHabit(m,cfg){
    if(hp()&&hp().habitType) return hp().habitType(m,cfg);
    return 'keys';
  }

  function isLibraryHabit(m,cfg){
    if(!m) return false;
    if(hp()&&hp().isLibraryHabit) return hp().isLibraryHabit(m,cfg);
    return !!(core()&&core().isSaved&&core().isSaved(m));
  }

  function typeLabel(type){
    if(type==='voice') return t('habitHubTypeVoice');
    if(type==='app') return t('habitHubTypeApp');
    if(type==='combo') return t('habitHubTypeCombo');
    return t('habitHubTypeKeys');
  }

  function appDisplayName(appId){
    if(global.OneToneAppBehaviorRules&&global.OneToneAppBehaviorRules.appDisplayName){
      return global.OneToneAppBehaviorRules.appDisplayName(appId);
    }
    return appId||'—';
  }

  function appPreset(appId){
    var atp=global.OneToneAppTargetPresets;
    if(!atp||!atp.presetById) return null;
    return atp.presetById(appId);
  }

  function primaryAppId(m){
    var direct=String(m&&m.appTargetId||'').trim();
    if(direct) return direct;
    var ids=configuredAppIds(m);
    if(ids&&ids.length) return String(ids[0]||'').trim();
    return '';
  }

  function isAppScenario(m){
    if(diff()&&diff().isAppScenarioMapping) return diff().isAppScenarioMapping(m);
    return isAppScope(m)||hasAppParts(m);
  }

  function diff(){
    return global.OneToneHabitOverrideDiff;
  }

  function globalBaselineMapping(){
    var cfg=state().config||{};
    return diff()&&diff().findGlobalBaselineMapping?diff().findGlobalBaselineMapping(cfg,core()):null;
  }

  function isLegacyUnclassified(m,baselineId){
    if(!m||!baselineId) return false;
    if(isAppScenario(m)) return false;
    return m.id!==baselineId;
  }

  function isAppScope(m){
    return isAppScenario(m);
  }

  function isGlobalScope(m){
    return !isAppScope(m);
  }

  function renderAppIconBadge(appId, extraClass){
    appId=String(appId||'').trim();
    if(!appId) return '';
    var preset=appPreset(appId);
    var name=appDisplayName(appId);
    var cls='habit-app-badge'+(extraClass?' '+extraClass:'');
    if(preset&&preset.icon){
      return '<span class="'+cls+' has-icon" title="'+esc(name)+'">'
        +'<img class="habit-app-badge-icon" src="'+esc(preset.icon)+'" alt="" decoding="async" />'
        +'</span>';
    }
    var fallback=name.slice(0,2).toUpperCase();
    return '<span class="'+cls+'" title="'+esc(name)+'">'+esc(fallback)+'</span>';
  }

  function primaryActivationPhrase(m,cfg){
    if(!m) return '';
    var sc=global.OneToneSceneConfig;
    if(!sc) return '';
    var preset=sc.effectiveVoskModelPreset?sc.effectiveVoskModelPreset(cfg,m):'cn-light';
    var phrases=sc.appWakePhrasesForMapping
      ?sc.appWakePhrasesForMapping(m,{preset:preset})
      : (sc.summonPhrasesForMapping?sc.summonPhrasesForMapping(m,{preset:preset}):[]);
    return Array.isArray(phrases)&&phrases.length?String(phrases[0]||'').trim():'';
  }

  function habitDescription(m,type,cfg,profile){
    var activation=primaryActivationPhrase(m,cfg);
    if(type==='app'){
      var apps=configuredAppIds(m).map(appDisplayName);
      if(apps.length&&activation) return t('habitHubDescAppPrefix')+' · '+apps.join(' / ')+' · '+t('habitHubDescWakePhrase')+' · '+activation;
      if(apps.length) return t('habitHubDescAppPrefix')+' · '+apps.join(' / ');
      return t('habitHubDescApp');
    }
    if(type==='voice'){
      profile=profile||(hp()&&hp().project?hp().project(m,cfg):null);
      var end=profile&&profile.effectiveEndPhrases&&profile.effectiveEndPhrases.zh&&profile.effectiveEndPhrases.zh[0];
      var fin=flow&&flow.finishBehaviorTextSettings?flow.finishBehaviorTextSettings(m).text:'';
      var parts=[];
      if(activation) parts.push(t('habitHubDescWakePhrase')+' · '+activation);
      if(end) parts.push(t('habitHubDescEndPhrase')+' · '+end);
      if(fin) parts.push(fin);
      return parts.length?parts.join(' + '):t('habitHubDescVoice');
    }
    if(type==='combo'){
      var bits=[];
      if(hasKeyParts(m)) bits.push(t('habitHubDescKeysShort'));
      if(hasAppParts(m)) bits.push(t('habitHubDescAppShort'));
      if(hasVoiceParts(m,cfg)) bits.push(t('habitHubDescVoiceShort'));
      if(activation) bits.push(t('habitHubDescWakePhrase')+' · '+activation);
      return bits.join(' + ');
    }
    if(activation) return t('habitHubDescKeys')+' · '+t('habitHubDescWakePhrase')+' · '+activation;
    return t('habitHubDescKeys');
  }

  function formatRelativeTime(ts){
    if(!ts) return '';
    var diff=Date.now()-Number(ts);
    if(diff<60000) return t('habitHubUpdatedJustNow');
    if(diff<3600000) return t('habitHubUpdatedMinutes').replace('{n}',String(Math.floor(diff/60000)));
    if(diff<86400000) return t('habitHubUpdatedHours').replace('{n}',String(Math.floor(diff/3600000)));
    var d=new Date(ts);
    var today=new Date();
    if(d.toDateString()===today.toDateString()) return t('habitHubUpdatedToday').replace('{time}',pad2(d.getHours())+':'+pad2(d.getMinutes()));
    return (d.getMonth()+1)+'/'+d.getDate()+' '+pad2(d.getHours())+':'+pad2(d.getMinutes());
  }

  function pad2(n){ return n<10?'0'+n:String(n); }

  function habitMetaLine(m,profile){
    var parts=[];
    var ts=m.updatedAt||m.lastUsedAt;
    if(ts) parts.push(formatRelativeTime(ts)+(m.updatedAt?t('habitHubUpdatedSuffix'):''));
    if(m.useCount>0) parts.push(t('habitHubUseCount').replace('{n}',String(m.useCount)));
    var keyOn=profile?profile.keyEnabled:!!m.enabled;
    if(!parts.length&&keyOn) parts.push(t('habitHubMetaEnabled'));
    return parts.join(' · ');
  }

  function collectHabits(){
    if(!core()) return [];
    core().ensureConfig&&core().ensureConfig();
    var cfg=state().config||{};
    var items=[];
    core().sorted().forEach(function(m){
      if(!isLibraryHabit(m,cfg)) return;
      var profile=hp()&&hp().project?hp().project(m,cfg):null;
      var type=profile?profile.habitType:classifyHabit(m,cfg);
      items.push({mapping:m,profile:profile,type:type});
    });
    return items;
  }

  function filterItems(items){
    var f=normalizeHubFilter();
    var bid=baselineId();
    if(f==='legacy'){
      return items.filter(function(it){ return isLegacyUnclassified(it.mapping,bid); });
    }
    // 场景区只看应用场景；通用设置不进筛选列表
    var apps=items.filter(function(it){ return isAppScenario(it.mapping); });
    if(f==='recent'){
      var week=Date.now()-7*86400000;
      return apps.filter(function(it){
        var m=it.mapping;
        var active=it.profile?it.profile.isActive:(state().config&&state().config.activeSceneId===m.id);
        return (m.lastUsedAt&&m.lastUsedAt>=week)||active;
      });
    }
    return apps;
  }

  function usesScopeGrouping(){
    return true;
  }

  function sortItems(items){
    var sort=ui().habitHubSort||'recent';
    var cfg=state().config||{};
    var activeId=cfg.activeSceneId;
    var out=items.slice();
    if(sort==='name'){
      out.sort(function(a,b){ return habitName(a.mapping).localeCompare(habitName(b.mapping),'zh'); });
      return out;
    }
    if(sort==='type'){
      out.sort(function(a,b){
        var d=TYPE_ORDER[a.type]-TYPE_ORDER[b.type];
        if(d) return d;
        return habitName(a.mapping).localeCompare(habitName(b.mapping),'zh');
      });
      return out;
    }
    out.sort(function(a,b){
      var am=a.mapping,bm=b.mapping;
      if(activeId){
        if(am.id===activeId) return -1;
        if(bm.id===activeId) return 1;
      }
      var au=am.lastUsedAt||am.updatedAt||0;
      var bu=bm.lastUsedAt||bm.updatedAt||0;
      if(bu!==au) return bu-au;
      return (bm.order||0)-(am.order||0);
    });
    return out;
  }

  function applyViewMode(){
    var list=$('habitHubList');
    if(!list) return;
    var mode=ui().habitHubViewMode||'list';
    list.classList.toggle('is-list',mode==='list');
    list.classList.toggle('is-grid',mode==='grid');
    document.querySelectorAll('[data-habit-view]').forEach(function(btn){
      var on=btn.dataset.habitView===mode;
      btn.classList.toggle('is-active',on);
      btn.setAttribute('aria-pressed',on?'true':'false');
    });
  }

  function friendlyKey(key){
    key=String(key||'').trim();
    if(!key) return '—';
    if(global.OneToneKeyLabels&&global.OneToneKeyLabels.friendlyKeyName){
      return global.OneToneKeyLabels.friendlyKeyName(key,global.OneToneI18n.getLang())||key;
    }
    return key;
  }

  function engineLabel(mode){
    mode=String(mode||'').trim().toLowerCase();
    if(mode==='vosk') return 'Vosk';
    if(mode==='sapi') return t('voiceSummaryEngineSapi');
    if(mode==='kws') return t('voiceSummaryEngineKws');
    if(mode==='off'||!mode) return t('habitHubGlobalVoiceOff');
    return mode;
  }

  function globalKeysSummaryText(cfg){
    cfg=cfg||state().config||{};
    var diff=global.OneToneHabitOverrideDiff;
    var baseline=diff&&diff.getGlobalKeyBaseline?diff.getGlobalKeyBaseline(cfg,core()):null;
    if(!baseline) return '—';
    var trig=friendlyKey(baseline.triggerKey);
    var tgt=friendlyKey(baseline.targetKey);
    return t('habitHubGlobalKeysSummary').replace('{trigger}',trig).replace('{target}',tgt);
  }

  function globalVoiceSummaryText(cfg){
    cfg=cfg||state().config||{};
    var diff=global.OneToneHabitOverrideDiff;
    var baseline=diff&&diff.getGlobalVoiceBaseline?diff.getGlobalVoiceBaseline(cfg):null;
    if(!baseline) return t('habitHubGlobalVoiceOff');
    var eng=engineLabel(baseline.engine||'off');
    if(eng===t('habitHubGlobalVoiceOff')) return eng;
    var wakeCount=Array.isArray(baseline.wakePhrases)?baseline.wakePhrases.length:0;
    return t('habitHubGlobalVoiceSummary').replace('{engine}',eng).replace('{wakeCount}',String(wakeCount));
  }

  function globalKeyChannel(cfg){
    cfg=cfg||state().config||{};
    var diff=global.OneToneHabitOverrideDiff;
    var baseline=diff&&diff.getGlobalKeyBaseline?diff.getGlobalKeyBaseline(cfg,core()):null;
    return {
      trigger:friendlyKey(baseline&&baseline.triggerKey),
      target:friendlyKey(baseline&&baseline.targetKey)
    };
  }

  function globalVoiceChannel(cfg){
    cfg=cfg||state().config||{};
    var diff=global.OneToneHabitOverrideDiff;
    var baseline=diff&&diff.getGlobalVoiceBaseline?diff.getGlobalVoiceBaseline(cfg):null;
    var engine=baseline?engineLabel(baseline.engine||'off'):t('habitHubGlobalVoiceOff');
    var wakeCount=baseline&&Array.isArray(baseline.wakePhrases)?baseline.wakePhrases.length:0;
    return {
      engine:engine,
      wake:wakeCount?t('habitHubVoiceWakeCount').replace('{wakeCount}',String(wakeCount)):t('habitHubVoiceWakeNone'),
      status:engine===t('habitHubGlobalVoiceOff')?t('habitHubVoiceStatusOff'):t('habitHubVoiceStatusOn')
    };
  }

  function channelKeycap(label,iconClass){
    return '<span class="habit-hub-keycap '+esc(iconClass||'')+'">'
      +'<span class="habit-hub-keycap-face">'+esc(label||'—')+'</span>'
      +'</span>';
  }

  function normalizeHubFilter(){
    var f=ui().habitHubFilter||'all';
    if(f==='keys'||f==='voice'||f==='global'||f==='app'){
      ui().habitHubFilter='all';
      return 'all';
    }
    if(f!=='all'&&f!=='recent'&&f!=='legacy'){
      ui().habitHubFilter='all';
      return 'all';
    }
    return f;
  }

  function universalSetupState(cfg){
    cfg=cfg||state().config||{};
    var baseline=globalBaselineMapping();
    var trig=baseline?String(baseline.triggerKey||'').trim():'';
    var tgt=baseline?String(baseline.targetKey||'').trim():'';
    var keysReady=!!(trig||tgt);
    var wakeApi=global.OneToneVoiceWake;
    var mode=wakeApi&&wakeApi.currentMode?String(wakeApi.currentMode()||'off'):'off';
    var voiceReady=mode==='vosk'||mode==='sapi'||mode==='kws';
    return {
      keysReady:keysReady,
      voiceReady:voiceReady,
      ready:keysReady
    };
  }

  function renderGlobalDefaultCard(){
    var cfg=state().config||{};
    var keyChannel=globalKeyChannel(cfg);
    var voiceChannel=globalVoiceChannel(cfg);
    var setup=universalSetupState(cfg);
    var html='<article class="habit-hub-hero'+(setup.ready?' is-ready':' is-pending')+'" role="region" aria-label="'+esc(t('habitHubGlobalDefaultTitle'))+'">';
    if(ui().habitGuideMode){
      html+='<div class="habit-hub-guide-bubble" role="status">'
        +'<span>'+esc(t('habitHubGuideBubble'))+'</span>'
        +'<button type="button" class="habit-hub-guide-close" data-habit-guide-close aria-label="'+esc(t('habitHubGuideClose'))+'">×</button>'
        +'</div>';
    }
    html+='<div class="habit-hub-hero-head">';
    html+='<span class="habit-hub-hero-pulse" aria-hidden="true"><span></span></span>';
    html+='<div class="habit-hub-hero-head-text">';
    html+='<div class="habit-hub-hero-title-row">';
    html+='<h5 class="habit-hub-hero-title">'+esc(t('habitHubGlobalDefaultTitle'))+'</h5>';
    html+='</div>';
    html+='<p class="habit-hub-hero-desc">'+esc(t('habitHubGlobalDefaultDesc'))+'</p>';
    html+='</div>';
    html+='<span class="habit-hub-card-status '+(setup.ready?'is-ready':'is-pending')+'">'
      +esc(setup.ready?t('habitHubUniversalReady'):t('habitHubUniversalPending'))+'</span>';
    html+='</div>';
    html+='<div class="habit-hub-channels">';
    html+='<div class="habit-hub-channel habit-hub-spring" data-habit-channel="keys" tabindex="0" role="button">';
    html+='<div class="habit-hub-channel-end is-input">'
      +channelKeycap(keyChannel.trigger,'')
      +'<span class="habit-hub-channel-copy"><span>'+esc(t('habitHubChannelKeysInput'))+'</span><strong>'+esc(keyChannel.trigger)+'</strong></span></div>';
    html+='<div class="habit-hub-channel-rail" aria-hidden="true"><svg viewBox="0 0 220 28" preserveAspectRatio="none"><path class="habit-hub-rail-base" d="M8 14H212"/><path class="habit-hub-data-flow" d="M8 14H212"/></svg></div>';
    html+='<div class="habit-hub-channel-end is-output"><span class="habit-hub-channel-copy"><span>'+esc(t('habitHubChannelKeysOutput'))+'</span><strong>'+esc(keyChannel.target)+'</strong></span>'
      +channelKeycap(keyChannel.target,'is-output')+'</div>';
    html+='<button type="button" class="habit-hub-act is-primary" data-habit-global-keys>'+esc(t('habitHubGlobalOpenKeys'))+'</button>';
    html+='</div>';
    html+='<div class="habit-hub-channel habit-hub-spring" data-habit-channel="voice" tabindex="0" role="button">';
    html+='<div class="habit-hub-channel-end is-input">'
      +channelKeycap('MIC','is-mic')
      +'<span class="habit-hub-channel-copy"><span>'+esc(t('habitHubChannelVoiceInput'))+'</span><strong>'+esc(voiceChannel.engine)+'</strong><em>'+esc(voiceChannel.wake)+'</em></span></div>';
    html+='<div class="habit-hub-channel-rail is-voice" aria-hidden="true"><span class="habit-hub-voice-bar"></span><span class="habit-hub-voice-bar"></span><span class="habit-hub-voice-bar"></span><span class="habit-hub-voice-bar"></span><span class="habit-hub-voice-bar"></span></div>';
    html+='<div class="habit-hub-channel-end is-output"><span class="habit-hub-channel-copy"><span>'+esc(t('habitHubChannelVoiceOutput'))+'</span><strong>'+esc(voiceChannel.status)+'</strong></span></div>';
    html+='<button type="button" class="habit-hub-act" data-habit-global-voice>'+esc(t('habitHubGlobalOpenVoice'))+'</button>';
    html+='</div>';
    html+='</div></article>';
    return html;
  }

  function renderAppFilterBar(opts){
    opts=opts||{};
    var f=normalizeHubFilter();
    var showLegacy=!!opts.showLegacy;
    function tab(id,labelKey){
      var on=f===id;
      return '<button type="button" class="habit-hub-filter'+(on?' is-active':'')+'" data-habit-filter="'+id+'" role="tab" aria-selected="'+(on?'true':'false')+'">'
        +esc(t(labelKey))+'</button>';
    }
    var html='<div class="habit-hub-app-toolbar">';
    html+='<div class="habit-hub-filters" role="tablist" aria-label="'+esc(t('habitHubAppFilterAria'))+'">';
    html+=tab('all','habitHubFilterAllScenarios');
    html+=tab('recent','habitHubFilterRecent');
    if(showLegacy) html+=tab('legacy','habitHubFilterLegacy');
    html+='</div></div>';
    return html;
  }

  function renderAppSectionEmpty(){
    return '<div class="habit-hub-app-empty" role="status">'
      +'<span class="habit-hub-app-empty-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="14" rx="3"/><path d="M8 21h8M12 18v3"/></svg></span>'
      +'<p class="habit-hub-app-empty-title">'+esc(t('habitHubAppEmptyTitle'))+'</p>'
      +'<p class="habit-hub-app-empty-desc">'+esc(t('habitHubAppEmptyDesc'))+'</p>'
      +'<button type="button" class="habit-hub-new-btn is-primary" data-habit-app-empty-new>'+esc(t('habitHubAppNewCta'))+'</button>'
      +'</div>';
  }

  function renderGuideAside(setup,appCount){
    setup=setup||universalSetupState();
    appCount=appCount||0;
    var step1=setup.ready?'is-done':'is-current';
    var step2=setup.ready?(appCount>0?'is-done':'is-current'):'';
    var step3=setup.ready&&appCount>0?'is-current':'';
    return ''
      +'<ol class="habit-hub-guide-steps">'
      +'<li class="habit-hub-guide-step '+step1+'"><span class="habit-hub-guide-num" aria-hidden="true">1</span><span class="habit-hub-guide-text">'+esc(t('habitHubGuideStep1'))+'</span></li>'
      +'<li class="habit-hub-guide-step '+step2+'"><span class="habit-hub-guide-num" aria-hidden="true">2</span><span class="habit-hub-guide-text">'+esc(t('habitHubGuideStep2'))+'</span></li>'
      +'<li class="habit-hub-guide-step '+step3+'"><span class="habit-hub-guide-num" aria-hidden="true">3</span><span class="habit-hub-guide-text">'+esc(t('habitHubGuideStep3'))+'</span></li>'
      +'</ol>';
  }

  function baselineId(){
    var m=globalBaselineMapping();
    return m&&m.id?m.id:'';
  }

  function renderSection(title,innerHtml,opts){
    opts=opts||{};
    if(!innerHtml&&!opts.toolbarHtml&&!opts.allowEmpty) return '';
    var extra=opts.extraClass?' habit-hub-section--'+opts.extraClass:'';
    var html='<section class="habit-hub-section'+extra+'" aria-label="'+esc(title)+'">'
      +'<div class="habit-hub-section-head">'
      +'<div class="habit-hub-section-head-text">'
      +'<h4 class="habit-hub-section-title">'+esc(title)+'</h4>';
    if(opts.desc) html+='<p class="habit-hub-section-desc">'+esc(opts.desc)+'</p>';
    html+='</div>';
    if(opts.toolbarHtml) html+=opts.toolbarHtml;
    html+='</div>';
    html+='<div class="habit-hub-section-list habit-hub-section-list--cards">'+(innerHtml||'')+'</div></section>';
    return html;
  }

  function splitHubItems(items){
    var bid=baselineId();
    var app=[],legacy=[];
    items.forEach(function(it){
      if(isAppScenario(it.mapping)) app.push(it);
      else if(isLegacyUnclassified(it.mapping,bid)) legacy.push(it);
    });
    return {app:app,legacy:legacy};
  }

  function renderCard(it,opts){
    opts=opts||{};
    var m=it.mapping;
    var type=it.type;
    var profile=it.profile;
    var cfg=state().config||{};
    var isActive=profile?profile.isActive:!!(cfg.activeSceneId&&m.id===cfg.activeSceneId);
    var appId=primaryAppId(m);
    var legacy=!!opts.legacy;
    var horizontal=!!opts.horizontal;
    var html='<article class="habit-hub-card habit-hub-card--'+esc(type)
      +(horizontal?' habit-hub-card--horizontal':'')
      +(legacy?' habit-hub-card--legacy':'')
      +(isActive?' is-active-scene':'')+'" data-habit-card="'+esc(m.id)+'" role="listitem">';
    if(legacy){
      html+='<div class="habit-hub-card-open habit-hub-card-open--static">';
    }else{
      html+='<button type="button" class="habit-hub-card-open" data-habit-open="'+esc(m.id)+'">';
    }
    if(appId) html+=renderAppIconBadge(appId,'habit-hub-card-icon habit-hub-card-app-main');
    else html+='<span class="habit-hub-card-icon habit-hub-card-icon--'+esc(type)+'">'+TYPE_ICON[type]+'</span>';
    html+='<span class="habit-hub-card-body">';
    html+='<span class="habit-hub-card-title-row">';
    html+='<span class="habit-hub-card-name">'+esc(habitName(m))+'</span>';
    html+='<span class="habit-hub-card-type">'+esc(typeLabel(type))+'</span>';
    if(isActive) html+='<span class="habit-hub-card-active">'+esc(t('habitHubActiveBadge'))+'</span>';
    var activation=primaryActivationPhrase(m,cfg);
    if(activation) html+='<span class="habit-hub-card-wake" title="'+esc(t('habitHubDescWakePhrase'))+'">'+esc(activation)+'</span>';
    html+='</span>';
    html+='<span class="habit-hub-card-desc">'+esc(isAppScenario(m)?t('habitHubDescAppOnly'):habitDescription(m,type,cfg,profile))+'</span>';
    var meta=habitMetaLine(m,profile);
    if(meta) html+='<span class="habit-hub-card-meta">'+esc(meta)+'</span>';
    html+='</span>';
    if(legacy) html+='</div>'; else html+='</button>';
    html+='<div class="habit-hub-card-actions">';
    if(!legacy){
      html+='<button type="button" class="habit-hub-act is-primary is-icon" data-habit-switch="'+esc(m.id)+'" title="'+esc(t('habitHubActSwitch'))+'" aria-label="'+esc(t('habitHubActSwitch'))+'"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg><span class="sr-only">'+esc(t('habitHubActSwitch'))+'</span></button>';
    }
    if(legacy){
      html+='<button type="button" class="habit-hub-act is-primary" data-habit-migrate="'+esc(m.id)+'">'+esc(t('habitHubLegacyMigrate'))+'</button>';
    }
    html+='<button type="button" class="habit-hub-act is-icon" data-habit-dup="'+esc(m.id)+'" title="'+esc(t('habitHubActCopy'))+'" aria-label="'+esc(t('habitHubActCopy'))+'"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg><span class="sr-only">'+esc(t('habitHubActCopy'))+'</span></button>';
    html+='<button type="button" class="habit-hub-act is-icon" data-habit-rename="'+esc(m.id)+'" title="'+esc(t('habitHubActRename'))+'" aria-label="'+esc(t('habitHubActRename'))+'"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg><span class="sr-only">'+esc(t('habitHubActRename'))+'</span></button>';
    html+='<button type="button" class="habit-hub-act is-danger is-icon" data-habit-del="'+esc(m.id)+'" title="'+esc(t('habitHubActDelete'))+'" aria-label="'+esc(t('habitHubActDelete'))+'"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg><span class="sr-only">'+esc(t('habitHubActDelete'))+'</span></button>';
    if(!legacy){
      html+='<button type="button" class="habit-hub-act-menu" data-habit-menu="'+esc(m.id)+'" aria-label="'+esc(t('habitHubActMore'))+'">⋯</button>';
    }
    html+='</div></article>';
    return html;
  }

  function renderLabels(){
    var map={
      settingsPanelHabitsDesc:'settingsPanelHabitsDesc',
      habitHubAutoHint:'habitHubAutoHint',
      btnHabitHubNew:'habitHubNew',
      btnHabitHubSaveVoice:'habitHubSaveFromVoice',
      habitHubFilterAll:'habitHubFilterAll',
      habitHubSortLabel:'habitHubSortLabel',
      habitHubSortRecent:'habitHubSortRecent',
      habitHubSortName:'habitHubSortName',
      habitHubSortType:'habitHubSortType',
      habitHubEmptyTitle:'habitHubEmptyTitle',
      habitHubEmptyDesc:'habitHubEmptyDesc',
      btnHabitHubEmptyNew:'habitHubNew',
      btnHabitHubEmptySaveVoice:'habitHubSaveFromVoice',
      habitHubAsideTitle:'habitHubAsideTitle',
      habitHubAsideTip:'habitHubAsideTip',
      btnHabitHubGuideMode:'habitHubGuideMode',
      btnHabitHubHelp:'habitHubHelp',
      btnHabitHubBackLabel:'habitHubBack'
    };
    Object.keys(map).forEach(function(id){
      var el=$(id);
      if(el) el.textContent=t(map[id]);
    });
    var stepsHost=$('habitHubGuideSteps');
    if(stepsHost){
      var splitForGuide=splitHubItems(collectHabits());
      stepsHost.innerHTML=renderGuideAside(universalSetupState(),splitForGuide.app.length);
    }
    var sort=$('habitHubSort');
    if(sort){
      var opts=sort.querySelectorAll('option');
      if(opts[0]) opts[0].textContent=t('habitHubSortRecent');
      if(opts[1]) opts[1].textContent=t('habitHubSortName');
      if(opts[2]) opts[2].textContent=t('habitHubSortType');
    }
    var guideBtn=$('btnHabitHubGuideMode');
    if(guideBtn){
      var guideOn=!!ui().habitGuideMode;
      guideBtn.classList.toggle('is-active',guideOn);
      guideBtn.setAttribute('aria-pressed',guideOn?'true':'false');
    }
  }

  function renderFilters(){
    var f=normalizeHubFilter();
    document.querySelectorAll('[data-habit-filter]').forEach(function(btn){
      var on=btn.dataset.habitFilter===f;
      btn.classList.toggle('is-active',on);
      btn.setAttribute('aria-selected',on?'true':'false');
    });
    var sort=$('habitHubSort');
    if(sort) sort.value=ui().habitHubSort||'recent';
    applyViewMode();
  }

  function renderList(){
    var list=$('habitHubList');
    var empty=$('habitHubEmpty');
    if(!list) return;
    var filter=normalizeHubFilter();
    var allItems=collectHabits();
    var splitAll=splitHubItems(allItems);
    var hasLegacy=splitAll.legacy.length>0;
    var filtered=sortItems(filterItems(allItems));
    var html='';

    // Hero：通用设置始终置顶，不进场景筛选
    if(filter!=='legacy'){
      html+='<section class="habit-hub-section habit-hub-section--hero" aria-label="'+esc(t('habitHubSectionGlobal'))+'">'
        +'<div class="habit-hub-section-head"><div class="habit-hub-section-head-text">'
        +'<h4 class="habit-hub-section-title">'+esc(t('habitHubSectionGlobal'))+'</h4>'
        +'<p class="habit-hub-section-desc">'+esc(t('habitHubSectionGlobalDesc'))+'</p>'
        +'</div></div>'
        +'<div class="habit-hub-section-list">'+renderGlobalDefaultCard()+'</div></section>';
    }

    if(filter==='legacy'){
      var legacyOnly=sortItems(splitAll.legacy);
      var legacyInner=legacyOnly.map(function(it){ return renderCard(it,{legacy:true}); }).join('');
      if(!legacyInner){
        legacyInner='<p class="habit-hub-section-desc">'+esc(t('habitHubSectionLegacyDesc'))+'</p>';
      }
      html+=renderSection(t('habitHubSectionLegacy'),legacyInner,{
        desc:t('habitHubSectionLegacyDesc'),
        extraClass:'legacy',
        toolbarHtml:renderAppFilterBar({showLegacy:hasLegacy}),
        allowEmpty:true
      });
    }else{
      var appInner=filtered.map(function(it){ return renderCard(it,{horizontal:true}); }).join('');
      if(!appInner) appInner=renderAppSectionEmpty();
      html+=renderSection(t('habitHubSectionApp'),appInner,{
        desc:t('habitHubSectionAppDesc'),
        toolbarHtml:renderAppFilterBar({showLegacy:hasLegacy}),
        allowEmpty:true
      });
      if(filter==='all'&&hasLegacy){
        var legacyInnerAll=splitAll.legacy.map(function(it){ return renderCard(it,{legacy:true}); }).join('');
        html+=renderSection(t('habitHubSectionLegacy'),legacyInnerAll,{
          desc:t('habitHubSectionLegacyDesc'),
          extraClass:'legacy'
        });
      }
    }

    var hasContent=!!html.trim();
    if(empty) empty.hidden=hasContent;
    list.hidden=!hasContent;
    list.innerHTML=hasContent?html:'';
    applyViewMode();
  }

  function render(){
    renderLabels();
    renderList();
    renderFilters();
    applyShellVisibility();
  }

  function applyShellVisibility(){
    if((ui().habitView||'hub')==='wizard'&&global.OneToneHabitScenarioWizard){
      global.OneToneHabitScenarioWizard.applyShellVisibility();
      return;
    }
    var hub=$('habitHubView');
    var wizard=$('habitWizardView');
    var detail=$('habitDetailView');
    var isHub=(ui().habitView||'hub')==='hub';
    if(hub){
      hub.hidden=!isHub;
      hub.setAttribute('aria-hidden',isHub?'false':'true');
    }
    if(wizard){
      wizard.hidden=true;
      wizard.setAttribute('aria-hidden','true');
    }
    if(detail) detail.hidden=true;
    var appStrip=$('keysAppBindingStrip');
    if(appStrip) appStrip.hidden=true;
    var panel=$('settingsPanelHabits');
    if(panel) panel.classList.toggle('is-habit-hub',isHub);
    if(panel) panel.classList.toggle('is-habit-wizard',false);
    if(global.OneToneHabitLayerNav) global.OneToneHabitLayerNav.applyVisibility();
    if(global.OneToneSceneTabs) global.OneToneSceneTabs.applyVisibility();
  }

  function showHub(){
    ui().habitView='hub';
    if(global.OneToneSettingsDrawer){
      global.OneToneSettingsDrawer.setPanel('habits');
      return;
    }
    applyShellVisibility();
    render();
  }

  function showDetail(id,opts){
    opts=opts||{};
    if(id) state().selectedMappingId=id;
    var m=core()&&core().byId?core().byId(id||state().selectedMappingId):null;
    if(m&&isAppScenario(m)&&global.OneToneHabitScenarioWizard){
      global.OneToneHabitScenarioWizard.openEdit(m.id,opts);
      return;
    }
    if(m){
      var api=diff();
      var isBaseline=api&&api.isGlobalBaselineMapping&&api.isGlobalBaselineMapping(m,state().config||{},core());
      if(isBaseline&&global.OneToneHabitScenarioContextBanner){
        var voice=opts.layer==='advanced'||opts.voiceTab;
        if(voice) global.OneToneHabitScenarioContextBanner.openGlobalVoice({fromHub:true});
        else global.OneToneHabitScenarioContextBanner.openGlobalKeys({fromHub:true});
        return;
      }
      if(global.OneToneAppToast) global.OneToneAppToast.show(t('habitHubLegacyGlobalHint'),'scheme');
      showHub();
      return;
    }
    var h=hooks();
    if(h.syncEditorFromSelection) h.syncEditorFromSelection();
    else if(global.OneToneRender) global.OneToneRender.render();
  }

  function deleteHabit(id){
    id=String(id||'').trim();
    var cfg=state().config||{};
    if(!id||!Array.isArray(cfg.mappings)) return;
    var idx=cfg.mappings.findIndex(function(m){ return m&&m.id===id; });
    if(idx<0) return;
    var removed=Object.assign({},cfg.mappings.splice(idx,1)[0]);
    removed.enabled=false;
    if(!Array.isArray(cfg.trash)) cfg.trash=[];
    cfg.trash.unshift(removed);
    if(state().selectedMappingId===id){
      state().selectedMappingId=cfg.mappings[0]&&cfg.mappings[0].id||null;
    }
    if(String(cfg.activeSceneId||'')===id){
      cfg.activeSceneId=cfg.mappings[0]&&cfg.mappings[0].id||'';
    }
    cfg.mappings.forEach(function(m,i){ if(m) m.order=i; });
    var saveAsync=global.OneToneConfigPersist&&global.OneToneConfigPersist.saveAsync;
    var save=global.OneToneConfigPersist&&global.OneToneConfigPersist.save;
    var done=function(){
      if(global.OneToneMappingTrashMenu&&global.OneToneMappingTrashMenu.renderTrashList){
        global.OneToneMappingTrashMenu.renderTrashList();
      }
      render();
      if(global.OneToneAppToast) global.OneToneAppToast.show(t('movedToTrash'),'scheme');
    };
    if(saveAsync) saveAsync().then(done).catch(done);
    else{
      if(save) save();
      done();
    }
  }

  function touchUpdated(m){
    if(m) m.updatedAt=Date.now();
  }

  function currentVoiceOverride(){
    if(global.OneToneVoiceSchemeContext&&global.OneToneVoiceSchemeContext.snapshotFromGlobal){
      return global.OneToneVoiceSchemeContext.snapshotFromGlobal();
    }
    var cfg=state().config||{};
    var sc=global.OneToneSceneConfig;
    var end=sc&&sc.globalEndPhrases?sc.globalEndPhrases(cfg):{zh:[],en:[]};
    var wakeApi=global.OneToneVoiceWake;
    var mode=wakeApi&&wakeApi.currentMode?wakeApi.currentMode():'off';
    var vosk=cfg.voiceVosk||cfg.voice_vosk||{};
    var modelPreset=String(vosk.modelPreset||vosk.model_preset||'cn-light').trim()||'cn-light';
    var ov={
      targetKey:sc&&sc.globalVoiceTargetKey?sc.globalVoiceTargetKey(cfg):'RAlt',
      wakePhrases:sc&&sc.globalWakePhrases?sc.globalWakePhrases(cfg):[],
      endPhrases:{
        zh:Array.isArray(end.zh)?end.zh.slice():[],
        en:Array.isArray(end.en)?end.en.slice():[]
      }
    };
    if(mode==='vosk'||mode==='sapi'||mode==='kws') ov.engine=mode;
    if(mode==='vosk') ov.modelPreset=modelPreset;
    return ov;
  }

  function defaultVoiceHabitName(ov){
    var wake=ov&&Array.isArray(ov.wakePhrases)&&ov.wakePhrases.length?ov.wakePhrases[0]:'';
    return wake?t('habitHubVoiceDefaultName').replace('{phrase}',wake):t('habitHubVoiceDefaultNameFallback');
  }

  function contextMapping(){
    if(core()&&core().selected) return core().selected();
    var cfg=state().config||{};
    var id=String(state().selectedMappingId||cfg.activeSceneId||'').trim();
    if(!id||!core()||!core().byId) return null;
    return core().byId(id);
  }

  function primaryAppIdFromMapping(m){
    return m&&String(m.appTargetId||'').trim()?String(m.appTargetId).trim():'';
  }

  function cloneAppBehaviorRulesFrom(source){
    if(!source||!Array.isArray(source.appBehaviorRules)) return [];
    return source.appBehaviorRules.map(function(r){
      if(!r||!r.appId) return null;
      return {
        appId:r.appId,
        finishMode:r.finishMode||'confirm',
        note:r.note||'',
        summonPhrase:r.summonPhrase||undefined
      };
    }).filter(Boolean);
  }

  function createFromKeys(){
    var add=$('btnAddMapping');
    if(add) add.click();
  }

  function createFromVoice(opts){
    if(global.OneToneVoiceSchemePersist&&global.OneToneVoiceSchemePersist.saveVoiceScheme){
      return global.OneToneVoiceSchemePersist.saveVoiceScheme(Object.assign({},opts||{},{forceCreate:true}));
    }
    opts=opts||{};
    if(!core()) return Promise.resolve(null);
    core().ensureConfig&&core().ensureConfig();
    var cfg=state().config;
    var ov=currentVoiceOverride();
    var defaultName=defaultVoiceHabitName(ov);
    var modal=global.OneToneVoiceSchemeNameModal;
    var namePromise;
    if(opts.name!==undefined){
      namePromise=Promise.resolve(String(opts.name||'').trim()||defaultName);
    }else if(modal&&typeof modal.open==='function'){
      namePromise=modal.open(t('habitHubVoiceNamePrompt'),defaultName);
    }else if(typeof window.prompt==='function'){
      var prompted=window.prompt(t('habitHubVoiceNamePrompt'),defaultName);
      namePromise=Promise.resolve(prompted===null?null:(String(prompted||'').trim()||defaultName));
    }else{
      namePromise=Promise.resolve(defaultName);
    }
    return namePromise.then(function(name){
      if(name===null) return null;
      name=String(name||'').trim()||defaultName;
      var id=core().newMappingId?core().newMappingId():('m-'+Date.now()+'-'+Math.random().toString(36).slice(2,7));
      var m={
        id:id,
        label:'',
        group:name,
        triggerKey:'',
        targetKey:'',
        enabled:false,
        order:Array.isArray(cfg.mappings)?cfg.mappings.length:0,
        triggerMode:'tap',
        intervalMs:cfg.intervalMs||1200,
        enterDelayMs:cfg.enterDelayMs||5000,
        cancelEnabled:cfg.cancelEnabled!==false,
        autoEnterEnabled:cfg.autoEnterEnabled!==false,
        switchKeys:[],
        nativeKeyRestore:false,
        imePresetId:'',
        appTargetId:'',
        appBehaviorRules:[],
        voiceOverride:ov,
        updatedAt:Date.now(),
        lastUsedAt:0,
        useCount:0
      };
      if(core().ensureMappingExtras) core().ensureMappingExtras(m);
      cfg.mappings=Array.isArray(cfg.mappings)?cfg.mappings:[];
      cfg.mappings.push(m);
      state().selectedMappingId=id;
      if(hooks().save) hooks().save();
      render();
      if(global.OneToneAppBehaviorRules) global.OneToneAppBehaviorRules.render();
      if(global.OneToneAppToast) global.OneToneAppToast.show(t('habitHubVoiceSaved'),'scheme');
      return m;
    });
  }

  function bindEvents(){
    var hub=$('habitHubView');
    if(hub){
      hub.addEventListener('click',function(e){
        var delBtn=e.target.closest&&e.target.closest('[data-habit-del]');
        if(!delBtn) return;
        e.preventDefault();
        e.stopPropagation();
        if(e.stopImmediatePropagation) e.stopImmediatePropagation();
        deleteHabit(delBtn.getAttribute('data-habit-del')||'');
      },true);
      hub.addEventListener('click',function(e){
        var filterBtn=e.target.closest&&e.target.closest('[data-habit-filter]');
        if(filterBtn){
          e.preventDefault();
      ui().habitHubFilter=filterBtn.dataset.habitFilter;
          renderFilters();
          renderList();
          var stepsHost=$('habitHubGuideSteps');
          if(stepsHost){
            var splitForGuide=splitHubItems(collectHabits());
            stepsHost.innerHTML=renderGuideAside(universalSetupState(),splitForGuide.app.length);
          }
          return;
        }
        var globalKeysBtn=e.target.closest&&e.target.closest('[data-habit-global-keys]');
        if(globalKeysBtn){
          e.preventDefault();
          e.stopPropagation();
          if(global.OneToneHabitScenarioContextBanner) global.OneToneHabitScenarioContextBanner.openGlobalKeys({fromHub:true});
          else if(global.OneToneSettingsDrawer) global.OneToneSettingsDrawer.setPanel('keys');
          return;
        }
        var globalVoiceBtn=e.target.closest&&e.target.closest('[data-habit-global-voice]');
        if(globalVoiceBtn){
          e.preventDefault();
          e.stopPropagation();
          if(global.OneToneHabitScenarioContextBanner) global.OneToneHabitScenarioContextBanner.openGlobalVoice({fromHub:true});
          else if(global.OneToneSettingsDrawer) global.OneToneSettingsDrawer.setPanel('voiceWake');
          return;
        }
        var guideClose=e.target.closest&&e.target.closest('[data-habit-guide-close]');
        if(guideClose){
          e.preventDefault();
          e.stopPropagation();
          ui().habitGuideMode=false;
          render();
          return;
        }
        var channel=e.target.closest&&e.target.closest('[data-habit-channel]');
        if(channel){
          e.preventDefault();
          channel.classList.add('is-pressed');
          global.setTimeout(function(){ channel.classList.remove('is-pressed'); },120);
          if(channel.getAttribute('data-habit-channel')==='voice'){
            if(global.OneToneHabitScenarioContextBanner) global.OneToneHabitScenarioContextBanner.openGlobalVoice({fromHub:true});
            else if(global.OneToneSettingsDrawer) global.OneToneSettingsDrawer.setPanel('voiceWake');
          }else{
            if(global.OneToneHabitScenarioContextBanner) global.OneToneHabitScenarioContextBanner.openGlobalKeys({fromHub:true});
            else if(global.OneToneSettingsDrawer) global.OneToneSettingsDrawer.setPanel('keys');
          }
          return;
        }
        var appEmptyNew=e.target.closest&&e.target.closest('[data-habit-app-empty-new]');
        if(appEmptyNew){
          e.preventDefault();
          if(global.OneToneHabitScenarioWizard) global.OneToneHabitScenarioWizard.openNew();
          else createFromKeys();
          return;
        }
        var actBtn=e.target.closest&&e.target.closest('.habit-hub-card-actions [data-habit-del],.habit-hub-card-actions [data-habit-dup],.habit-hub-card-actions [data-habit-rename],.habit-hub-card-actions [data-habit-switch],.habit-hub-card-actions [data-habit-migrate],.habit-hub-card-actions [data-habit-menu]');
        if(actBtn){
          e.stopPropagation();
        }
        var viewBtn=e.target.closest&&e.target.closest('[data-habit-view]');
        if(viewBtn){
          e.preventDefault();
          ui().habitHubViewMode=viewBtn.dataset.habitView;
          applyViewMode();
          return;
        }
        var openBtn=e.target.closest&&e.target.closest('[data-habit-open]');
        if(openBtn){
          e.preventDefault();
          showDetail(openBtn.dataset.habitOpen);
          return;
        }
        var switchBtn=e.target.closest&&e.target.closest('[data-habit-switch]');
        if(switchBtn){
          e.preventDefault();
          e.stopPropagation();
          if(global.OneToneSceneActivate) global.OneToneSceneActivate.activateScene(switchBtn.dataset.habitSwitch);
          return;
        }
        var dupBtn=e.target.closest&&e.target.closest('[data-habit-dup]');
        if(dupBtn){
          e.preventDefault();
          e.stopPropagation();
          if(global.OneToneMappingTrashMenu) global.OneToneMappingTrashMenu.duplicate(dupBtn.dataset.habitDup);
          render();
          return;
        }
        var renameBtn=e.target.closest&&e.target.closest('[data-habit-rename]');
        if(renameBtn){
          e.preventDefault();
          e.stopPropagation();
          var id=renameBtn.dataset.habitRename;
          var m=core()&&core().byId?core().byId(id):null;
          if(!m) return;
          var next=prompt(t('habitHubRenamePrompt'),habitName(m));
          if(next===null) return;
          next=String(next).trim();
          if(!next) return;
          if(hp()&&hp().isReservedHabitName&&hp().isReservedHabitName(next)){
            if(global.OneToneAppToast) global.OneToneAppToast.show(t('habitHubRenameReserved'),'scheme');
            return;
          }
          m.group=next;
          touchUpdated(m);
          if(hooks().save) hooks().save();
          render();
          return;
        }
        var migrateBtn=e.target.closest&&e.target.closest('[data-habit-migrate]');
        if(migrateBtn){
          e.preventDefault();
          e.stopPropagation();
          var mid=migrateBtn.getAttribute('data-habit-migrate')||'';
          if(mid&&global.OneToneHabitScenarioWizard&&global.OneToneHabitScenarioWizard.openNew){
            global.OneToneHabitScenarioWizard.openNew({migrateFrom:mid});
          }
          return;
        }
        var menuBtn=e.target.closest&&e.target.closest('[data-habit-menu]');
        if(menuBtn){
          e.preventDefault();
          e.stopPropagation();
          showDetail(menuBtn.dataset.habitMenu,{layer:'advanced'});
          return;
        }
      });
    }
    var sort=$('habitHubSort');
    if(sort) sort.addEventListener('change',function(){
      ui().habitHubSort=sort.value;
      renderList();
    });
    var newBtn=$('btnHabitHubNew');
    if(newBtn) newBtn.addEventListener('click',function(e){
      e.preventDefault();
      if(global.OneToneHabitScenarioWizard) global.OneToneHabitScenarioWizard.openNew();
      else createFromKeys();
    });
    var emptyNew=$('btnHabitHubEmptyNew');
    if(emptyNew) emptyNew.addEventListener('click',function(e){
      e.preventDefault();
      if(global.OneToneHabitScenarioWizard) global.OneToneHabitScenarioWizard.openNew();
      else createFromKeys();
    });
    var back=$('btnHabitHubBack');
    if(back) back.addEventListener('click',function(e){
      e.preventDefault();
      showHub();
    });
    var help=$('btnHabitHubHelp');
    if(help) help.addEventListener('click',function(e){
      e.preventDefault();
      ui().habitGuideMode=true;
      render();
      if(global.OneToneAppToast) global.OneToneAppToast.show(t('habitHubHelpHint'),'scheme');
    });
    var guideMode=$('btnHabitHubGuideMode');
    if(guideMode) guideMode.addEventListener('click',function(e){
      e.preventDefault();
      ui().habitGuideMode=!ui().habitGuideMode;
      render();
    });
    if(hub){
      hub.addEventListener('mouseover',function(e){
        var channel=e.target.closest&&e.target.closest('[data-habit-channel]');
        if(channel) channel.classList.add('is-hover');
      });
      hub.addEventListener('mouseout',function(e){
        var channel=e.target.closest&&e.target.closest('[data-habit-channel]');
        if(channel&&(!e.relatedTarget||!channel.contains(e.relatedTarget))) channel.classList.remove('is-hover');
      });
      hub.addEventListener('keydown',function(e){
        var channel=e.target.closest&&e.target.closest('[data-habit-channel]');
        if(!channel||(e.key!=='Enter'&&e.key!==' ')) return;
        e.preventDefault();
        channel.click();
      });
    }
  }

  global.OneToneHabitHub={
    render:render,
    showHub:showHub,
    showDetail:showDetail,
    createFromKeys:createFromKeys,
    createFromVoice:createFromVoice,
    bindEvents:bindEvents,
    collectHabits:collectHabits,
    classifyHabit:classifyHabit,
    habitName:habitName,
    isAppScope:isAppScope,
    isAppScenario:isAppScenario,
    isGlobalScope:function(m){ return !isAppScenario(m); },
    touchUpdated:touchUpdated,
    snapshotVoiceOverride:currentVoiceOverride,
    defaultVoiceHabitName:defaultVoiceHabitName,
    deleteHabit:deleteHabit,
    applyShellVisibility:applyShellVisibility
  };
})((typeof window!=='undefined')?window:globalThis);
