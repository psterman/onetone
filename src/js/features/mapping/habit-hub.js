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

  function renderMappingAppIcon(m,extraClass){
    var appId=primaryAppId(m);
    var rulesApi=global.OneToneAppBehaviorRules;
    var customs=rulesApi&&rulesApi.customRulesForMapping?rulesApi.customRulesForMapping(m):[];
    var rule=customs&&customs[0];
    // Prefer extracted/custom app icons over preset letter fallbacks.
    if(rule){
      var name=rulesApi.ruleDisplayName?rulesApi.ruleDisplayName(rule):(rule.displayName||'App');
      var cls='habit-app-badge'+(extraClass?' '+extraClass:'');
      var url=String(rule.iconDataUrl||'').trim();
      if(!url&&rulesApi.ruleIconDataUrl) url=String(rulesApi.ruleIconDataUrl(rule)||'').trim();
      if(url){
        return '<span class="'+cls+' has-icon" title="'+esc(name)+'">'
          +'<img class="habit-app-badge-icon" src="'+esc(url)+'" alt="" decoding="async" />'
          +'</span>';
      }
      if(rulesApi.backfillRuleIconPath) rulesApi.backfillRuleIconPath(rule);
      var path='';
      if(rulesApi.resolveRuleIconPath) path=String(rulesApi.resolveRuleIconPath(rule)||'').trim();
      if(!path&&rule.match) path=String(rule.match.fullPath||rule.match.full_path||'').trim();
      var fb=String(name||'App').slice(0,2).toUpperCase();
      return '<span class="'+cls+' habit-app-badge-fallback" title="'+esc(name)+'"'
        +' data-rule-id="'+esc(rule.ruleId||'')+'"'
        +' data-habit-mapping="'+esc(m&&m.id||'')+'"'
        +(path?' data-rule-icon-path="'+esc(path)+'"':'')
        +'>'+esc(fb)+'</span>';
    }
    if(appId&&appId!=='custom') return renderAppIconBadge(appId,extraClass);
    return renderAppIconBadge(appId||'custom',extraClass);
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
    if(sort==='manual'){
      out.sort(function(a,b){ return (a.mapping.order||0)-(b.mapping.order||0); });
      return out;
    }
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
      return (am.order||0)-(bm.order||0);
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

  function actIcon(paths,size){
    size=size||16;
    return '<svg viewBox="0 0 24 24" width="'+size+'" height="'+size+'" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+paths+'</svg>';
  }

  var ACT_ICON={
    keys:'<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8"/>',
    voice:'<path d="M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><path d="M12 18v3"/>',
    copy:'<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    rename:'<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    del:'<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>',
    up:'<path d="m18 15-6-6-6 6"/>',
    down:'<path d="m6 9 6 6 6-6"/>'
  };

  function ctaActBtn(attr,label,iconPath,opts){
    opts=opts||{};
    var tip=opts.tip||label;
    var cls='habit-hub-act is-cta'+(opts.primary?' is-primary':'');
    return '<button type="button" class="'+cls+'" '+attr
      +' data-tip="'+esc(tip)+'" aria-label="'+esc(tip)+'">'
      +actIcon(iconPath)+'<span>'+esc(label)+'</span></button>';
  }

  function iconActBtn(attr,label,iconPath,opts){
    opts=opts||{};
    var cls='habit-hub-act is-icon'+(opts.danger?' is-danger':'')+(opts.disabled?' is-disabled':'');
    return '<button type="button" class="'+cls+'" '+attr
      +(opts.disabled?' disabled aria-disabled="true"':'')
      +' data-tip="'+esc(label)+'" aria-label="'+esc(label)+'">'
      +actIcon(iconPath,18)+'<span class="sr-only">'+esc(label)+'</span></button>';
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
    var keysTip=t('habitHubChannelKeysHoverTip');
    var voiceTip=t('habitHubChannelVoiceHoverTip');
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
    html+='<div class="habit-hub-channel habit-hub-spring" data-habit-channel="keys" tabindex="0" role="button" aria-label="'+esc(t('habitHubGlobalKeysLbl')+'。'+keysTip)+'">';
    html+='<div class="habit-hub-channel-end is-input">'
      +channelKeycap(keyChannel.trigger,'')
      +'<span class="habit-hub-channel-copy"><span>'+esc(t('habitHubChannelKeysInput'))+'</span><strong>'+esc(keyChannel.trigger)+'</strong></span></div>';
    html+='<div class="habit-hub-channel-rail" aria-hidden="true"><svg viewBox="0 0 220 28" preserveAspectRatio="none"><path class="habit-hub-rail-base" d="M8 14H212"/><path class="habit-hub-data-flow" d="M8 14H212"/></svg></div>';
    html+='<div class="habit-hub-channel-end is-output"><span class="habit-hub-channel-copy"><span>'+esc(t('habitHubChannelKeysOutput'))+'</span><strong>'+esc(keyChannel.target)+'</strong></span>'
      +channelKeycap(keyChannel.target,'is-output')+'</div>';
    html+=ctaActBtn('data-habit-global-keys',t('habitHubGlobalOpenKeys'),ACT_ICON.keys,{primary:true,tip:t('habitHubKeysCtaTip')});
    html+='<span class="habit-hub-channel-hover-tip">'+esc(keysTip)+'</span>';
    html+='</div>';
    html+='<div class="habit-hub-channel habit-hub-spring" data-habit-channel="voice" tabindex="0" role="button" aria-label="'+esc(t('habitHubGlobalVoiceLbl')+'。'+voiceTip)+'">';
    html+='<div class="habit-hub-channel-end is-input">'
      +channelKeycap('MIC','is-mic')
      +'<span class="habit-hub-channel-copy"><span>'+esc(t('habitHubChannelVoiceInput'))+'</span><strong>'+esc(voiceChannel.engine)+'</strong><em>'+esc(voiceChannel.wake)+'</em></span></div>';
    html+='<div class="habit-hub-channel-rail is-voice" aria-hidden="true"><span class="habit-hub-voice-bar"></span><span class="habit-hub-voice-bar"></span><span class="habit-hub-voice-bar"></span><span class="habit-hub-voice-bar"></span><span class="habit-hub-voice-bar"></span></div>';
    html+='<div class="habit-hub-channel-end is-output"><span class="habit-hub-channel-copy"><span>'+esc(t('habitHubChannelVoiceOutput'))+'</span><strong>'+esc(voiceChannel.status)+'</strong></span></div>';
    html+=ctaActBtn('data-habit-global-voice',t('habitHubGlobalOpenVoice'),ACT_ICON.voice,{primary:true,tip:t('habitHubVoiceCtaTip')});
    html+='<span class="habit-hub-channel-hover-tip">'+esc(voiceTip)+'</span>';
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
      +'<p class="habit-hub-guide-lead">'+esc(t('habitHubGuideLead'))+'</p>'
      +'<ol class="habit-hub-guide-steps">'
      +'<li class="habit-hub-guide-step '+step1+'"><span class="habit-hub-guide-num" aria-hidden="true">1</span><span class="habit-hub-guide-text">'+esc(t('habitHubGuideStep1'))+'</span></li>'
      +'<li class="habit-hub-guide-step '+step2+'"><span class="habit-hub-guide-num" aria-hidden="true">2</span><span class="habit-hub-guide-text">'+esc(t('habitHubGuideStep2'))+'</span></li>'
      +'<li class="habit-hub-guide-step '+step3+'"><span class="habit-hub-guide-num" aria-hidden="true">3</span><span class="habit-hub-guide-text">'+esc(t('habitHubGuideStep3'))+'</span></li>'
      +'</ol>'
      +'<div class="habit-hub-guide-detail">'
      +'<p><strong>'+esc(t('habitHubGuideDiffTitle'))+'</strong> '+esc(t('habitHubGuideDiffBody'))+'</p>'
      +'<p><strong>'+esc(t('habitHubGuideWhenTitle'))+'</strong> '+esc(t('habitHubGuideWhenBody'))+'</p>'
      +'<p><strong>'+esc(t('habitHubGuideBenefitTitle'))+'</strong> '+esc(t('habitHubGuideBenefitBody'))+'</p>'
      +'</div>';
  }

  function baselineId(){
    var m=globalBaselineMapping();
    return m&&m.id?m.id:'';
  }

  function renderSection(title,innerHtml,opts){
    opts=opts||{};
    if(!innerHtml&&!opts.toolbarHtml&&!opts.actionsHtml&&!opts.allowEmpty) return '';
    var extra=opts.extraClass?' habit-hub-section--'+opts.extraClass:'';
    var html='<section class="habit-hub-section'+extra+'" aria-label="'+esc(title)+'">'
      +'<div class="habit-hub-section-head">'
      +'<div class="habit-hub-section-head-text">'
      +'<h4 class="habit-hub-section-title">'+esc(title)+'</h4>';
    if(opts.desc) html+='<p class="habit-hub-section-desc">'+esc(opts.desc)+'</p>';
    html+='</div>';
    if(opts.actionsHtml||opts.toolbarHtml){
      html+='<div class="habit-hub-section-tools">';
      if(opts.actionsHtml) html+=opts.actionsHtml;
      if(opts.toolbarHtml) html+=opts.toolbarHtml;
      html+='</div>';
    }
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

  function renderSelectionBar(totalCount){
    var n=selectedIds().length;
    if(!n) return '';
    var html='<div class="habit-hub-selection-bar" role="status">';
    html+='<span class="habit-hub-selection-count">'+esc(t('habitHubSelectedCount').replace('{n}',String(n)))+'</span>';
    if(ui().habitHubBatchConfirm){
      html+='<span class="habit-hub-selection-ask">'+esc(t('habitHubBatchDeleteConfirm').replace('{n}',String(n)))+'</span>';
      html+='<button type="button" class="habit-hub-act is-cta is-danger" data-habit-batch-del-confirm>'+esc(t('habitHubBatchDeleteDo'))+'</button>';
      html+='<button type="button" class="habit-hub-act is-cta" data-habit-batch-del-cancel>'+esc(t('habitScenarioCancel'))+'</button>';
    }else{
      html+='<button type="button" class="habit-hub-act is-cta is-danger" data-habit-batch-del>'+esc(t('habitHubBatchDelete'))+'</button>';
      if(totalCount>n){
        html+='<button type="button" class="habit-hub-act is-cta" data-habit-select-all>'+esc(t('habitHubSelectAll'))+'</button>';
      }
      html+='<button type="button" class="habit-hub-act is-cta" data-habit-clear-sel>'+esc(t('habitHubClearSelection'))+'</button>';
    }
    html+='</div>';
    return html;
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
    var appScenario=!legacy&&isAppScenario(m);
    var renaming=appScenario&&String(ui().habitHubRenameId||'')===m.id;
    var confirmingDel=appScenario&&String(ui().habitHubConfirmDelId||'')===m.id;
    var selected=appScenario&&isSelected(m.id);
    var html='<article class="habit-hub-card habit-hub-card--'+esc(type)
      +(horizontal?' habit-hub-card--horizontal':'')
      +(legacy?' habit-hub-card--legacy':'')
      +(isActive?' is-active-scene':'')
      +(selected?' is-selected':'')
      +(renaming?' is-renaming':'')
      +(confirmingDel?' is-confirm-del':'')
      +'" data-habit-card="'+esc(m.id)+'" role="listitem">';
    if(appScenario){
      html+='<label class="habit-hub-card-check" title="'+esc(t('habitHubSelectScenario'))+'">'
        +'<input type="checkbox" data-habit-select="'+esc(m.id)+'"'+(selected?' checked':'')+' />'
        +'<span class="sr-only">'+esc(t('habitHubSelectScenario'))+'</span></label>';
    }
    if(legacy||renaming){
      html+='<div class="habit-hub-card-open habit-hub-card-open--static">';
    }else{
      html+='<button type="button" class="habit-hub-card-open" data-habit-open="'+esc(m.id)+'">';
    }
    if(appId) html+=renderMappingAppIcon(m,'habit-hub-card-icon habit-hub-card-app-main');
    else html+='<span class="habit-hub-card-icon habit-hub-card-icon--'+esc(type)+'">'+TYPE_ICON[type]+'</span>';
    html+='<span class="habit-hub-card-body">';
    html+='<span class="habit-hub-card-title-row">';
    if(renaming){
      html+='<span class="habit-hub-rename-wrap">'
        +'<input type="text" class="habit-hub-rename-input" data-habit-rename-input="'+esc(m.id)+'" value="'+esc(habitName(m))+'" maxlength="48" aria-label="'+esc(t('habitHubRenamePrompt'))+'" />'
        +'<button type="button" class="habit-hub-act is-cta is-primary" data-habit-rename-save="'+esc(m.id)+'">'+esc(t('habitHubRenameSave'))+'</button>'
        +'<button type="button" class="habit-hub-act is-cta" data-habit-rename-cancel>'+esc(t('habitScenarioCancel'))+'</button>'
        +'</span>';
    }else{
      html+='<span class="habit-hub-card-name">'+esc(habitName(m))+'</span>';
      html+='<span class="habit-hub-card-type">'+esc(typeLabel(type))+'</span>';
      if(isActive) html+='<span class="habit-hub-card-active">'+esc(t('habitHubActiveBadge'))+'</span>';
      var activation=primaryActivationPhrase(m,cfg);
      if(activation) html+='<span class="habit-hub-card-wake" title="'+esc(t('habitHubDescWakePhrase'))+'">'+esc(activation)+'</span>';
    }
    html+='</span>';
    if(!renaming){
      if(!isAppScenario(m)){
        html+='<span class="habit-hub-card-desc">'+esc(habitDescription(m,type,cfg,profile))+'</span>';
      }
      var meta=habitMetaLine(m,profile);
      if(meta) html+='<span class="habit-hub-card-meta">'+esc(meta)+'</span>';
    }
    html+='</span>';
    if(legacy||renaming) html+='</div>'; else html+='</button>';
    html+='<div class="habit-hub-card-actions">';
    if(confirmingDel){
      html+='<div class="habit-hub-inline-confirm" role="group" aria-label="'+esc(t('habitHubDeleteConfirm'))+'">'
        +'<span class="habit-hub-inline-confirm-text">'+esc(t('habitHubDeleteConfirm'))+'</span>'
        +'<button type="button" class="habit-hub-act is-cta is-danger" data-habit-del-confirm="'+esc(m.id)+'">'+esc(t('habitHubDeleteDo'))+'</button>'
        +'<button type="button" class="habit-hub-act is-cta" data-habit-del-cancel>'+esc(t('habitScenarioCancel'))+'</button>'
        +'</div>';
    }else if(!renaming){
      if(appScenario){
        var enOn=!!m.enabled;
        html+='<button type="button" class="toggle-switch habit-hub-enable-toggle'+(enOn?' is-on':'')+'" data-habit-enable="'+esc(m.id)+'" role="switch" aria-checked="'+(enOn?'true':'false')+'" title="'+esc(t('habitScenarioEnableLbl'))+'" data-tip="'+esc(t('habitScenarioEnableLbl'))+'" aria-label="'+esc(t('habitScenarioEnableLbl'))+'"></button>';
        html+=ctaActBtn('data-habit-scenario-keys="'+esc(m.id)+'"',t('habitHubGlobalOpenKeys'),ACT_ICON.keys,{primary:true,tip:t('habitHubKeysCtaTip')});
        html+=ctaActBtn('data-habit-scenario-voice="'+esc(m.id)+'"',t('habitHubGlobalOpenVoice'),ACT_ICON.voice,{primary:true,tip:t('habitHubVoiceCtaTip')});
        html+='<span class="habit-hub-act-sep" aria-hidden="true"></span>';
        html+=iconActBtn('data-habit-move="up" data-habit-id="'+esc(m.id)+'"',t('habitHubActMoveUp'),ACT_ICON.up,{disabled:!opts.canMoveUp});
        html+=iconActBtn('data-habit-move="down" data-habit-id="'+esc(m.id)+'"',t('habitHubActMoveDown'),ACT_ICON.down,{disabled:!opts.canMoveDown});
      }
      if(legacy){
        html+='<button type="button" class="habit-hub-act is-primary is-cta" data-habit-migrate="'+esc(m.id)+'" title="'+esc(t('habitHubLegacyMigrate'))+'" data-tip="'+esc(t('habitHubLegacyMigrate'))+'">'+esc(t('habitHubLegacyMigrate'))+'</button>';
      }
      html+=iconActBtn('data-habit-dup="'+esc(m.id)+'"',t('habitHubActCopy'),ACT_ICON.copy);
      html+=iconActBtn('data-habit-rename="'+esc(m.id)+'"',t('habitHubActRename'),ACT_ICON.rename);
      html+=iconActBtn('data-habit-del="'+esc(m.id)+'"',t('habitHubActDelete'),ACT_ICON.del,{danger:true});
    }
    html+='</div></article>';
    return html;
  }

  function renderLabels(){
    var map={
      settingsPanelHabitsDesc:'settingsPanelHabitsDesc',
      habitHubAutoHint:'habitHubAutoHint',
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
      if(opts[0]) opts[0].textContent=t('habitHubSortManual');
      if(opts[1]) opts[1].textContent=t('habitHubSortRecent');
      if(opts[2]) opts[2].textContent=t('habitHubSortName');
      if(opts[3]) opts[3].textContent=t('habitHubSortType');
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
    if(sort) sort.value=ui().habitHubSort||'manual';
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
      var appInner=filtered.map(function(it,idx){
        return renderCard(it,{
          horizontal:true,
          canMoveUp:idx>0,
          canMoveDown:idx<filtered.length-1
        });
      }).join('');
      pruneSelection(filtered.map(function(it){ return it&&it.mapping&&it.mapping.id; }).filter(Boolean));
      if(ui().habitHubCreating){
        appInner=renderInlineCreatePicker()+(appInner||'');
      }else if(!appInner){
        appInner=renderAppSectionEmpty();
      }else{
        appInner=renderSelectionBar(filtered.length)+appInner;
      }
      html+=renderSection(t('habitHubSectionApp'),appInner,{
        desc:t('habitHubSectionAppDesc'),
        actionsHtml:'<button type="button" class="habit-hub-filter-like is-primary habit-hub-section-new" data-habit-hub-new>'+esc(t('habitHubNew'))+'</button>',
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
    hydrateHubAppIcons();
    focusRenameInput();
  }

  function focusRenameInput(){
    var id=String(ui().habitHubRenameId||'').trim();
    if(!id) return;
    var input=document.querySelector('[data-habit-rename-input="'+id+'"]');
    if(!input) return;
    input.focus();
    if(input.select) input.select();
  }

  function hydrateHubAppIcons(){
    var list=$('habitHubList');
    var rulesApi=global.OneToneAppBehaviorRules;
    if(!list||!rulesApi) return;
    var cfg=state().config||{};
    (Array.isArray(cfg.mappings)?cfg.mappings:[]).forEach(function(m){
      if(m&&isAppScenario(m)&&rulesApi.prefetchMappingRuleIcons){
        rulesApi.prefetchMappingRuleIcons(m);
      }
    });
    if(rulesApi.hydrateCustomRuleChipIcons) rulesApi.hydrateCustomRuleChipIcons(list);
    if(rulesApi.scheduleHydrateCustomRuleIcons) rulesApi.scheduleHydrateCustomRuleIcons();
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
    if(m&&isAppScenario(m)&&global.OneToneHabitScenarioContextBanner){
      var voice=opts.layer==='advanced'||opts.voiceTab||opts.openVoice;
      if(voice) global.OneToneHabitScenarioContextBanner.openScenarioVoiceEdit(m.id,{returnToHub:true});
      else global.OneToneHabitScenarioContextBanner.openScenarioKeysEdit(m.id,{returnToHub:true});
      return;
    }
    if(m){
      var api=diff();
      var isBaseline=api&&api.isGlobalBaselineMapping&&api.isGlobalBaselineMapping(m,state().config||{},core());
      if(isBaseline&&global.OneToneHabitScenarioContextBanner){
        var voiceLegacy=opts.layer==='advanced'||opts.voiceTab;
        if(voiceLegacy) global.OneToneHabitScenarioContextBanner.openGlobalVoice({fromHub:true});
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

  function selectedIds(){
    if(!Array.isArray(ui().habitHubSelectedIds)) ui().habitHubSelectedIds=[];
    return ui().habitHubSelectedIds;
  }

  function isSelected(id){
    id=String(id||'').trim();
    return id&&selectedIds().indexOf(id)>=0;
  }

  function toggleSelected(id){
    id=String(id||'').trim();
    if(!id) return;
    var list=selectedIds();
    var idx=list.indexOf(id);
    if(idx>=0) list.splice(idx,1);
    else list.push(id);
    ui().habitHubBatchConfirm=false;
  }

  function clearSelection(){
    ui().habitHubSelectedIds=[];
    ui().habitHubBatchConfirm=false;
  }

  function pruneSelection(validIds){
    var allow={};
    (validIds||[]).forEach(function(id){ allow[String(id)]=true; });
    ui().habitHubSelectedIds=selectedIds().filter(function(id){ return allow[id]; });
    if(!ui().habitHubSelectedIds.length) ui().habitHubBatchConfirm=false;
  }

  function persistHub(){
    if(hooks().save) hooks().save();
    else if(global.OneToneConfigPersist&&global.OneToneConfigPersist.save) global.OneToneConfigPersist.save();
  }

  function deleteHabits(ids){
    ids=(Array.isArray(ids)?ids:[]).map(function(id){ return String(id||'').trim(); }).filter(Boolean);
    if(!ids.length) return;
    var cfg=state().config||{};
    if(!Array.isArray(cfg.mappings)) return;
    if(!Array.isArray(cfg.trash)) cfg.trash=[];
    var remove={};
    ids.forEach(function(id){ remove[id]=true; });
    var kept=[];
    cfg.mappings.forEach(function(m){
      if(!m||!remove[m.id]){ kept.push(m); return; }
      var removed=Object.assign({},m);
      removed.enabled=false;
      cfg.trash.unshift(removed);
    });
    cfg.mappings=kept;
    if(remove[String(state().selectedMappingId||'')]){
      state().selectedMappingId=cfg.mappings[0]&&cfg.mappings[0].id||null;
    }
    if(remove[String(cfg.activeSceneId||'')]){
      cfg.activeSceneId=cfg.mappings[0]&&cfg.mappings[0].id||'';
    }
    cfg.mappings.forEach(function(m,i){ if(m) m.order=i; });
    ui().habitHubConfirmDelId='';
    clearSelection();
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

  function deleteHabit(id){
    deleteHabits([id]);
  }

  function commitRename(id,name){
    id=String(id||'').trim();
    name=String(name||'').trim();
    if(!id||!name) return false;
    var m=core()&&core().byId?core().byId(id):null;
    if(!m) return false;
    if(hp()&&hp().isReservedHabitName&&hp().isReservedHabitName(name)){
      if(global.OneToneAppToast) global.OneToneAppToast.show(t('habitHubRenameReserved'),'scheme');
      return false;
    }
    m.group=name;
    touchUpdated(m);
    ui().habitHubRenameId='';
    persistHub();
    render();
    return true;
  }

  function reorderAppScenario(id,dir){
    id=String(id||'').trim();
    dir=dir==='up'?'up':'down';
    if(!id) return;
    var cfg=state().config||{};
    if(!Array.isArray(cfg.mappings)) return;
    // Visual list order (what the user sees). Persist by swapping in cfg.mappings —
    // save payload uses array index as order, so in-memory .order alone is wiped on save/reload.
    var visual=sortItems(filterItems(collectHabits())).map(function(it){ return it&&it.mapping; }).filter(Boolean);
    var idx=-1;
    for(var i=0;i<visual.length;i++){
      if(visual[i].id===id){ idx=i; break; }
    }
    if(idx<0) return;
    var swap=dir==='up'?idx-1:idx+1;
    if(swap<0||swap>=visual.length) return;
    var aId=visual[idx].id;
    var bId=visual[swap].id;
    var ai=-1,bi=-1;
    for(var j=0;j<cfg.mappings.length;j++){
      if(!cfg.mappings[j]) continue;
      if(cfg.mappings[j].id===aId) ai=j;
      if(cfg.mappings[j].id===bId) bi=j;
    }
    if(ai<0||bi<0||ai===bi) return;
    var tmp=cfg.mappings[ai];
    cfg.mappings[ai]=cfg.mappings[bi];
    cfg.mappings[bi]=tmp;
    cfg.mappings.forEach(function(m,orderIdx){ if(m) m.order=orderIdx; });
    ui().habitHubSort='manual';
    touchUpdated(cfg.mappings[bi]);
    persistHub();
    render();
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

  function defaultScenarioName(appId){
    return t('habitWizardDefaultName').replace('{app}',appDisplayName(appId)||appId||'—');
  }

  function findAppScenarioByAppId(appId,exceptMappingId){
    appId=String(appId||'').trim();
    // All custom picks share appTargetId "custom"; uniqueness is by process identity, not this id.
    if(!appId||appId==='custom'||!core()) return null;
    exceptMappingId=String(exceptMappingId||'').trim();
    var cfg=state().config||{};
    var list=Array.isArray(cfg.mappings)?cfg.mappings:[];
    for(var i=0;i<list.length;i++){
      var m=list[i];
      if(!m||!isAppScenario(m)) continue;
      if(exceptMappingId&&m.id===exceptMappingId) continue;
      if(String(m.appTargetId||'')===appId) return m;
    }
    return null;
  }

  function findAppScenarioForIdentity(identity,exceptMappingId){
    if(!identity||!core()) return null;
    exceptMappingId=String(exceptMappingId||'').trim();
    var rulesApi=global.OneToneAppBehaviorRules;
    var cfg=state().config||{};
    var list=Array.isArray(cfg.mappings)?cfg.mappings:[];
    var presetId=String(identity.matchedPresetAppId||identity.matched_preset_app_id||'').trim();
    if(presetId&&presetId!=='custom'){
      var byPreset=findAppScenarioByAppId(presetId,exceptMappingId);
      if(byPreset) return byPreset;
    }
    for(var i=0;i<list.length;i++){
      var m=list[i];
      if(!m||!isAppScenario(m)) continue;
      if(exceptMappingId&&m.id===exceptMappingId) continue;
      if(rulesApi&&rulesApi.matchRuleForMapping&&rulesApi.matchRuleForMapping(m,identity)) return m;
      if(rulesApi&&rulesApi.customRulesForMapping){
        var customs=rulesApi.customRulesForMapping(m)||[];
        for(var j=0;j<customs.length;j++){
          if(rulesApi.ruleMatchesIdentity&&rulesApi.ruleMatchesIdentity(customs[j],identity)) return m;
        }
      }
    }
    return null;
  }

  function restoreBaselineSelection(prevSelected){
    var cfg=state().config||{};
    var api=diff();
    var baseline=api&&api.findGlobalBaselineMapping
      ?api.findGlobalBaselineMapping(cfg,core())
      :null;
    if(baseline&&baseline.id){
      state().selectedMappingId=baseline.id;
      ui().voiceEditSchemeId=baseline.id;
      return;
    }
    if(prevSelected&&core()&&core().byId&&core().byId(prevSelected)){
      state().selectedMappingId=prevSelected;
      return;
    }
    state().selectedMappingId=null;
  }

  function startInlineCreate(){
    ui().habitHubCreating=true;
    ui().habitView='hub';
    if(ui().habitHubFilter==='legacy') ui().habitHubFilter='all';
    if(global.OneToneSettingsDrawer) global.OneToneSettingsDrawer.setPanel('habits');
    applyShellVisibility();
    render();
  }

  function cancelInlineCreate(){
    ui().habitHubCreating=false;
    render();
  }

  /**
   * Create an app scenario as a sparse override. Does NOT mutate the global baseline
   * mapping or activeSceneId — only appends an app-scoped mapping.
   */
  function createAppScenario(appId,opts){
    opts=opts||{};
    appId=String(appId||'').trim();
    if(!appId||!core()) return null;
    core().ensureConfig&&core().ensureConfig();
    var cfg=state().config;
    // Preset apps: one scenario per app. Custom: unlimited (each pick binds its own process).
    if(appId!=='custom'){
      var existing=findAppScenarioByAppId(appId);
      if(existing&&!opts.migrateFrom){
        ui().habitHubCreating=false;
        if(global.OneToneAppToast) global.OneToneAppToast.show(t('habitHubAppScenarioExists'),'scheme');
        render();
        return existing;
      }
    }
    var prevSelected=String(state().selectedMappingId||'');
    var id=core().newMappingId?core().newMappingId():('m-'+Date.now()+'-'+Math.random().toString(36).slice(2,7));
    var m={
      id:id,
      label:'',
      group:defaultScenarioName(appId),
      triggerKey:'',
      targetKey:'',
      enabled:true,
      order:Array.isArray(cfg.mappings)?cfg.mappings.length:0,
      triggerMode:'tap',
      intervalMs:cfg.intervalMs||1200,
      enterDelayMs:cfg.enterDelayMs||5000,
      cancelEnabled:cfg.cancelEnabled!==false,
      autoEnterEnabled:cfg.autoEnterEnabled!==false,
      switchKeys:[],
      nativeKeyRestore:false,
      imePresetId:'',
      appTargetId:appId,
      appBehaviorRules:[],
      voiceOverride:null,
      updatedAt:Date.now(),
      lastUsedAt:0,
      useCount:0
    };
    if(core().ensureMappingExtras) core().ensureMappingExtras(m);
    var rules=global.OneToneAppBehaviorRules;
    // Do not create a blank "custom" primary rule before the user picks a real process.
    if(appId&&appId!=='custom'&&rules&&rules.ensurePrimaryAppRule){
      rules.ensurePrimaryAppRule(m,appId);
    }
    if(opts.migrateFrom&&core().byId){
      var src=core().byId(String(opts.migrateFrom||'').trim());
      if(src){
        ['triggerKey','targetKey','triggerMode','autoEnterEnabled','cancelEnabled','keyModeEnabled','voiceModeEnabled'].forEach(function(k){
          if(src[k]!==undefined) m[k]=src[k];
        });
        if(src.voiceOverride) m.voiceOverride=JSON.parse(JSON.stringify(src.voiceOverride));
      }
    }
    cfg.mappings=Array.isArray(cfg.mappings)?cfg.mappings:[];
    cfg.mappings.push(m);
    ui().habitHubCreating=false;
    touchUpdated(m);
    if(opts.deferPersist){
      // Keep selection on the draft so the app picker can bind identity/icon.
      state().selectedMappingId=m.id;
      return m;
    }
    // Keep global baseline selected so Keys/Voice "universal" context is not stolen.
    restoreBaselineSelection(prevSelected);
    var saveFn=global.OneToneConfigPersist&&global.OneToneConfigPersist.saveAsync;
    var done=function(){
      render();
      if(global.OneToneAppToast) global.OneToneAppToast.show(t('habitHubAppScenarioCreated'),'scheme');
    };
    if(saveFn) saveFn().then(done).catch(done);
    else{
      if(hooks().save) hooks().save();
      else if(global.OneToneConfigPersist&&global.OneToneConfigPersist.save) global.OneToneConfigPersist.save();
      done();
    }
    return m;
  }

  function renderInlineCreatePicker(){
    var presets=[];
    if(global.OneToneAppTargetPresets&&Array.isArray(global.OneToneAppTargetPresets.presets)){
      presets=global.OneToneAppTargetPresets.presets.slice();
    }
    var html='<div class="habit-hub-inline-create" id="habitHubInlineCreate">';
    html+='<div class="habit-hub-inline-create-head">';
    html+='<p class="habit-hub-inline-create-title">'+esc(t('habitHubInlineCreateTitle'))+'</p>';
    html+='<p class="habit-hub-inline-create-hint">'+esc(t('habitHubInlineCreateHint'))+'</p>';
    html+='</div>';
    html+='<div class="habit-hub-inline-create-grid" role="list">';
    presets.forEach(function(p){
      var id=String(p&&p.id||'').trim();
      if(!id) return;
      var name=appDisplayName(id);
      var icon=p.icon?'<img class="habit-wizard-app-icon" src="'+esc(p.icon)+'" alt="" decoding="async" />':'';
      var exists=!!findAppScenarioByAppId(id);
      html+='<button type="button" class="habit-wizard-app-card'+(exists?' is-exists':'')+'" data-habit-create-app="'+esc(id)+'" role="listitem"'
        +(exists?' title="'+esc(t('habitHubAppScenarioExists'))+'"':'')+'>'
        +icon+'<span class="habit-wizard-app-name">'+esc(name)+'</span></button>';
    });
    html+='<button type="button" class="habit-wizard-app-card habit-wizard-app-card--custom" data-habit-create-custom role="listitem">'
      +'<span class="habit-wizard-app-icon habit-wizard-app-icon--custom" aria-hidden="true">＋</span>'
      +'<span class="habit-wizard-app-name">'+esc(t('habitScenarioCustomApp'))+'</span></button>';
    html+='</div>';
    html+='<button type="button" class="habit-hub-act" data-habit-create-cancel>'+esc(t('habitScenarioCancel'))+'</button>';
    html+='</div>';
    return html;
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
      // Capture: move / delete intent must win over card-open bubbling.
      hub.addEventListener('click',function(e){
        var moveBtn=e.target.closest&&e.target.closest('[data-habit-move]');
        if(moveBtn){
          e.preventDefault();
          e.stopPropagation();
          if(e.stopImmediatePropagation) e.stopImmediatePropagation();
          if(moveBtn.classList.contains('is-disabled')||moveBtn.hasAttribute('disabled')) return;
          reorderAppScenario(moveBtn.getAttribute('data-habit-id')||'',moveBtn.getAttribute('data-habit-move')||'');
          return;
        }
        var delConfirm=e.target.closest&&e.target.closest('[data-habit-del-confirm]');
        if(delConfirm){
          e.preventDefault();
          e.stopPropagation();
          if(e.stopImmediatePropagation) e.stopImmediatePropagation();
          deleteHabits([delConfirm.getAttribute('data-habit-del-confirm')||'']);
          return;
        }
        var delBtn=e.target.closest&&e.target.closest('[data-habit-del]');
        if(delBtn){
          e.preventDefault();
          e.stopPropagation();
          if(e.stopImmediatePropagation) e.stopImmediatePropagation();
          ui().habitHubConfirmDelId=delBtn.getAttribute('data-habit-del')||'';
          ui().habitHubRenameId='';
          ui().habitHubBatchConfirm=false;
          render();
          return;
        }
      },true);
      hub.addEventListener('change',function(e){
        var sel=e.target.closest&&e.target.closest('[data-habit-select]');
        if(!sel) return;
        var sid=sel.getAttribute('data-habit-select')||'';
        var list=selectedIds();
        var idx=list.indexOf(sid);
        if(sel.checked){
          if(idx<0) list.push(sid);
        }else if(idx>=0){
          list.splice(idx,1);
        }
        ui().habitHubBatchConfirm=false;
        renderList();
      });
      hub.addEventListener('keydown',function(e){
        var renameInput=e.target.closest&&e.target.closest('[data-habit-rename-input]');
        if(!renameInput) return;
        if(e.key==='Enter'){
          e.preventDefault();
          commitRename(renameInput.getAttribute('data-habit-rename-input')||'',renameInput.value);
        }else if(e.key==='Escape'){
          e.preventDefault();
          ui().habitHubRenameId='';
          render();
        }
      });
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
        if(channel&&!(e.target.closest&&e.target.closest('.habit-hub-act'))){
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
        var hubNew=e.target.closest&&e.target.closest('[data-habit-hub-new],[data-habit-app-empty-new]');
        if(hubNew){
          e.preventDefault();
          startInlineCreate();
          return;
        }
        var createCancel=e.target.closest&&e.target.closest('[data-habit-create-cancel]');
        if(createCancel){
          e.preventDefault();
          cancelInlineCreate();
          return;
        }
        var createAppBtn=e.target.closest&&e.target.closest('[data-habit-create-app]');
        if(createAppBtn){
          e.preventDefault();
          var migrateFrom=String(ui().habitHubMigrateFrom||'').trim();
          ui().habitHubMigrateFrom='';
          createAppScenario(createAppBtn.getAttribute('data-habit-create-app')||'',migrateFrom?{migrateFrom:migrateFrom}:{});
          return;
        }
        var createCustom=e.target.closest&&e.target.closest('[data-habit-create-custom]');
        if(createCustom){
          e.preventDefault();
          var mCustom=createAppScenario('custom',{deferPersist:true});
          if(mCustom&&global.OneToneAppBehaviorRules&&global.OneToneAppBehaviorRules.openAppPicker){
            global.OneToneAppBehaviorRules.openAppPicker({mappingId:mCustom.id});
          }
          return;
        }
        var batchDel=e.target.closest&&e.target.closest('[data-habit-batch-del]');
        if(batchDel){
          e.preventDefault();
          if(!selectedIds().length) return;
          ui().habitHubBatchConfirm=true;
          ui().habitHubConfirmDelId='';
          renderList();
          return;
        }
        var batchDelConfirm=e.target.closest&&e.target.closest('[data-habit-batch-del-confirm]');
        if(batchDelConfirm){
          e.preventDefault();
          deleteHabits(selectedIds().slice());
          return;
        }
        var batchDelCancel=e.target.closest&&e.target.closest('[data-habit-batch-del-cancel]');
        if(batchDelCancel){
          e.preventDefault();
          ui().habitHubBatchConfirm=false;
          renderList();
          return;
        }
        var clearSel=e.target.closest&&e.target.closest('[data-habit-clear-sel]');
        if(clearSel){
          e.preventDefault();
          clearSelection();
          renderList();
          return;
        }
        var selectAll=e.target.closest&&e.target.closest('[data-habit-select-all]');
        if(selectAll){
          e.preventDefault();
          var all=sortItems(filterItems(collectHabits())).map(function(it){ return it&&it.mapping&&it.mapping.id; }).filter(Boolean);
          ui().habitHubSelectedIds=all.slice();
          ui().habitHubBatchConfirm=false;
          renderList();
          return;
        }
        var delCancel=e.target.closest&&e.target.closest('[data-habit-del-cancel]');
        if(delCancel){
          e.preventDefault();
          e.stopPropagation();
          ui().habitHubConfirmDelId='';
          render();
          return;
        }
        var renameSave=e.target.closest&&e.target.closest('[data-habit-rename-save]');
        if(renameSave){
          e.preventDefault();
          e.stopPropagation();
          var saveId=renameSave.getAttribute('data-habit-rename-save')||'';
          var input=document.querySelector('[data-habit-rename-input="'+saveId+'"]');
          commitRename(saveId,input?input.value:'');
          return;
        }
        var renameCancel=e.target.closest&&e.target.closest('[data-habit-rename-cancel]');
        if(renameCancel){
          e.preventDefault();
          e.stopPropagation();
          ui().habitHubRenameId='';
          render();
          return;
        }
        var actBtn=e.target.closest&&e.target.closest('.habit-hub-card-actions [data-habit-dup],.habit-hub-card-actions [data-habit-rename],.habit-hub-card-actions [data-habit-migrate],.habit-hub-card-actions [data-habit-scenario-keys],.habit-hub-card-actions [data-habit-scenario-voice],.habit-hub-card-actions [data-habit-enable]');
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
        var enableBtn=e.target.closest&&e.target.closest('[data-habit-enable]');
        if(enableBtn){
          e.preventDefault();
          e.stopPropagation();
          var enableId=enableBtn.getAttribute('data-habit-enable')||'';
          var enableM=core()&&core().byId?core().byId(enableId):null;
          if(enableM){
            enableM.enabled=!enableM.enabled;
            touchUpdated(enableM);
            persistHub();
            render();
          }
          return;
        }
        var scenarioKeysBtn=e.target.closest&&e.target.closest('[data-habit-scenario-keys]');
        if(scenarioKeysBtn){
          e.preventDefault();
          e.stopPropagation();
          var keysId=scenarioKeysBtn.getAttribute('data-habit-scenario-keys')||'';
          if(keysId&&global.OneToneHabitScenarioContextBanner){
            global.OneToneHabitScenarioContextBanner.openScenarioKeysEdit(keysId,{returnToHub:true});
          }
          return;
        }
        var scenarioVoiceBtn=e.target.closest&&e.target.closest('[data-habit-scenario-voice]');
        if(scenarioVoiceBtn){
          e.preventDefault();
          e.stopPropagation();
          var voiceId=scenarioVoiceBtn.getAttribute('data-habit-scenario-voice')||'';
          if(voiceId&&global.OneToneHabitScenarioContextBanner){
            global.OneToneHabitScenarioContextBanner.openScenarioVoiceEdit(voiceId,{returnToHub:true});
          }
          return;
        }
        var openBtn=e.target.closest&&e.target.closest('[data-habit-open]');
        if(openBtn){
          e.preventDefault();
          showDetail(openBtn.dataset.habitOpen);
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
          ui().habitHubRenameId=renameBtn.getAttribute('data-habit-rename')||'';
          ui().habitHubConfirmDelId='';
          render();
          return;
        }
        var migrateBtn=e.target.closest&&e.target.closest('[data-habit-migrate]');
        if(migrateBtn){
          e.preventDefault();
          e.stopPropagation();
          var mid=migrateBtn.getAttribute('data-habit-migrate')||'';
          if(mid){
            startInlineCreate();
            ui().habitHubMigrateFrom=mid;
          }
          return;
        }
      });
    }
    var sort=$('habitHubSort');
    if(sort) sort.addEventListener('change',function(){
      ui().habitHubSort=sort.value;
      renderList();
    });
    var emptyNew=$('btnHabitHubEmptyNew');
    if(emptyNew) emptyNew.addEventListener('click',function(e){
      e.preventDefault();
      startInlineCreate();
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
        if(e.target.closest&&e.target.closest('.habit-hub-act,[data-habit-rename-input]')) return;
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
    createAppScenario:createAppScenario,
    findAppScenarioByAppId:findAppScenarioByAppId,
    findAppScenarioForIdentity:findAppScenarioForIdentity,
    startInlineCreate:startInlineCreate,
    cancelInlineCreate:cancelInlineCreate,
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
