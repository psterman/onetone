(function(global){
  'use strict';

  var $=function(id){ return global.OneToneDom.$(id); };
  var t=function(key, fb){
    try{
      var v=global.OneToneI18n&&global.OneToneI18n.t?global.OneToneI18n.t(key):key;
      if(v&&v!==key) return v;
    }catch(_){}
    return fb!=null?fb:key;
  };
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
    var rules=global.OneToneAppBehaviorRules;
    var items=[];
    core().sorted().forEach(function(m){
      if(!isLibraryHabit(m,cfg)) return;
      if(rules&&rules.isIncompleteCustomStub&&rules.isIncompleteCustomStub(m)) return;
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
    if(mode==='vosk') return t('voiceListeningStrategyAuto');
    if(mode==='sapi') return t('voiceRecognizeSourceSapi');
    if(mode==='kws') return t('voiceRecognizeSourceKws');
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
    camera:'<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
    softPad:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h.01M12 7h.01M16 7h.01M8 11h.01M12 11h.01M16 11h.01M8 15h8"/>',
    copy:'<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    rename:'<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    del:'<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>',
    up:'<path d="m18 15-6-6-6 6"/>',
    down:'<path d="m6 9 6 6 6-6"/>'
  };

  function channelGlyph(kind,title){
    var paths=ACT_ICON[kind]||ACT_ICON.keys;
    var tip=title?(' title="'+esc(title)+'"'):'';
    return '<span class="habit-hub-keycap is-glyph is-'+esc(kind)+'"'+tip+'>'
      +'<span class="habit-hub-keycap-face habit-hub-keycap-glyph" aria-hidden="true">'+actIcon(paths,20)+'</span>'
      +(title?'<span class="sr-only">'+esc(title)+'</span>':'')
      +'</span>';
  }

  var camWaveRaf=0;
  var camWaveStates=null;
  var HABIT_HUB_RAIL_W=120;
  var HABIT_HUB_RAIL_H=30;

  function habitHubFlowRail(){
    var w=HABIT_HUB_RAIL_W;
    var mid=Math.round(HABIT_HUB_RAIL_H/2);
    var end=w-4;
    return '<div class="habit-hub-channel-rail" aria-hidden="true"><svg viewBox="0 0 '+w+' '+HABIT_HUB_RAIL_H+'" preserveAspectRatio="none"><path class="habit-hub-rail-base" d="M4 '+mid+'H'+end+'"/><path class="habit-hub-data-flow" d="M4 '+mid+'H'+end+'"/></svg></div>';
  }

  function cameraSpectrumRail(){
    return '<div class="habit-hub-channel-rail is-camera" aria-hidden="true">'
      +'<canvas class="habit-hub-cam-canvas" width="'+HABIT_HUB_RAIL_W+'" height="'+HABIT_HUB_RAIL_H+'"></canvas>'
      +'</div>';
  }

  function softPadChannelRail(){
    return '<div class="habit-hub-channel-rail is-softpad" aria-hidden="true">'
      +'<span class="habit-hub-softpad-pad">'
      +'<i class="habit-hub-softpad-key"></i><i class="habit-hub-softpad-key"></i><i class="habit-hub-softpad-key"></i>'
      +'<i class="habit-hub-softpad-key"></i><i class="habit-hub-softpad-key"></i><i class="habit-hub-softpad-key"></i>'
      +'<i class="habit-hub-softpad-key"></i><i class="habit-hub-softpad-key"></i><i class="habit-hub-softpad-key"></i>'
      +'</span></div>';
  }

  function globalSoftPadChannel(){
    var hub=global.OneToneSoftPadHub;
    var entries=(hub&&hub.listSoftPadSchemes)?hub.listSoftPadSchemes():[];
    if(!entries.length){
      return {
        apps:t('habitHubSoftPadAppsNone','未配置'),
        status:t('habitHubSoftPadStatusNone','未配置'),
        ready:false
      };
    }
    var on=entries.filter(function(e){ return e&&e.padEnabled; });
    var titles=(on.length?on:entries).map(function(e){ return e.title; }).filter(Boolean);
    return {
      apps:titles.length?titles.join(' · '):t('habitHubSoftPadAppsNone','未配置'),
      status:on.length?t('habitHubSoftPadStatusOn','已启用'):t('habitHubSoftPadStatusOff','未启用'),
      ready:on.length>0
    };
  }

  function openHabitSoftPadPanel(mappingId){
    mappingId=String(mappingId||'').trim();
    if(mappingId&&global.OneToneState&&global.OneToneState.state){
      global.OneToneState.state.selectedMappingId=mappingId;
    }
    // Light hub: Soft Pad edits return to habits list, same as keys/voice/camera doors.
    ui().habitHubEditReturn=true;
    ui().habitScenarioReturnHub=true;
    if(global.OneToneSettingsDrawer&&global.OneToneSettingsDrawer.setPanel){
      global.OneToneSettingsDrawer.setPanel('softPad');
    }
  }

  /** Channel micro-status for light hub cards — status only, never inline editors. */
  function hubChannelMicroPillsHtml(m){
    var keysOn=!!(m&&String(m.triggerKey||'').trim());
    if(!keysOn&&hasKeyParts(m)) keysOn=true;
    var keysLbl=keysOn
      ?t('homeWbHabitChKeysOn','按键·已设')
      :t('homeWbHabitChKeysOff','按键·未设');
    var vo=m&&m.voiceOverride?m.voiceOverride:null;
    var voiceCustom=!!(vo&&(
      (Array.isArray(vo.wakePhrases)&&vo.wakePhrases.length)||
      String(vo.engine||'').trim()||
      String(vo.modelPreset||'').trim()
    ));
    var app=isAppScenario(m);
    var voiceLbl;
    if(!app){
      voiceLbl=t('homeWbHabitChVoiceBase','语音·通用');
    }else if(voiceCustom){
      voiceLbl=t('homeWbHabitChVoiceOn','语音·已设');
    }else{
      voiceLbl=t('homeWbHabitChVoiceInherit','语音·沿用通用');
    }
    var camOv=m&&m.cameraOverride;
    var camCustom=!!(camOv&&typeof camOv==='object'&&Object.keys(camOv).length);
    var camLbl;
    if(!app){
      camLbl=t('habitHubChCamBase','摄像头·通用');
    }else if(camCustom){
      camLbl=t('habitHubChCamOn','摄像头·已设');
    }else{
      camLbl=t('habitHubChCamInherit','摄像头·沿用通用');
    }
    var softHub=global.OneToneSoftPadHub;
    var padEligible=!!(softHub&&softHub.isSoftPadSchemeEligible&&softHub.isSoftPadSchemeEligible(m));
    var padOn=!!(m&&m.codexMicroPad&&m.codexMicroPad.enabled);
    var padLbl;
    if(!padEligible){
      padLbl=t('homeWbHabitChPadNa','Soft Pad·—');
    }else if(padOn){
      padLbl=t('homeWbHabitChPadOn','Soft Pad·开');
    }else{
      padLbl=t('homeWbHabitChPadOff','Soft Pad·关');
    }
    function pill(label){
      return '<span class="habit-hub-micro-pill">'+esc(label)+'</span>';
    }
    return '<span class="habit-hub-micro-pills" aria-hidden="true">'
      +pill(keysLbl)+pill(voiceLbl)+pill(camLbl)+pill(padLbl)
      +'</span>';
  }

  function hubPairLine(m){
    if(global.OneToneHomeScheme&&global.OneToneHomeScheme.pairLine){
      return global.OneToneHomeScheme.pairLine(m);
    }
    if(!m) return '—';
    var trig=String(m.triggerKey||'').trim()||'—';
    var tgt=String(m.targetKey||'').trim()||'—';
    return trig+' → '+tgt;
  }

  function camWaveTheme(){
    var dark=document.documentElement.getAttribute('data-theme')==='dark';
    if(dark){
      return {
        idle:'rgba(148,163,184,.35)',
        a:'#00F2FE',b:'#4FACFE',c:'#F59E0B'
      };
    }
    return {
      idle:'rgba(26,45,74,.22)',
      a:'#2a9cc4',b:'#5ec8e8',c:'#d97706'
    };
  }

  function drawCamSine(ctx,w,h,freq,color,opacity,amp,offset){
    ctx.beginPath();
    ctx.strokeStyle=color;
    ctx.globalAlpha=opacity;
    ctx.lineWidth=2;
    ctx.lineCap='round';
    ctx.lineJoin='round';
    var midY=h/2;
    for(var x=0;x<w;x++){
      var envelope=Math.sin((x/w)*Math.PI);
      var y=midY+Math.sin((x*0.03*freq)+offset)*amp*envelope;
      if(x===0) ctx.moveTo(x,y);
      else ctx.lineTo(x,y);
    }
    ctx.stroke();
    ctx.globalAlpha=1;
  }

  function paintCamWave(state){
    var canvas=state.canvas;
    if(!canvas||!canvas.isConnected) return;
    var ctx=canvas.getContext('2d');
    if(!ctx) return;
    // Fixed backing store — avoid getBoundingClientRect/resize thrash on every frame.
    var w=HABIT_HUB_RAIL_W,h=HABIT_HUB_RAIL_H;
    if(canvas.width!==w||canvas.height!==h){
      canvas.width=w;
      canvas.height=h;
    }
    ctx.clearRect(0,0,w,h);
    var theme=camWaveTheme();
    if(state.amp<=0.02){
      ctx.beginPath();
      ctx.moveTo(0,h/2);
      ctx.lineTo(w,h/2);
      ctx.strokeStyle=theme.idle;
      ctx.lineWidth=1.5;
      ctx.lineCap='round';
      ctx.stroke();
      return;
    }
    // Same layered recipe as Desktop/音频.html voice-canvas
    drawCamSine(ctx,w,h,1.1,theme.a,0.85,state.amp*14,state.offset);
    drawCamSine(ctx,w,h,1.6,theme.b,0.5,state.amp*10,state.offset*1.4);
    drawCamSine(ctx,w,h,0.7,theme.c,0.35,state.amp*6,state.offset*0.7);
  }

  function stopCameraWaveRails(){
    if(camWaveRaf){
      cancelAnimationFrame(camWaveRaf);
      camWaveRaf=0;
    }
    camWaveStates=null;
  }

  function tickCameraWaveRails(){
    camWaveRaf=0;
    if(!camWaveStates||!camWaveStates.length) return;
    var reduced=false;
    try{
      reduced=!!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }catch(_){}
    var anyAlive=false;
    for(var i=0;i<camWaveStates.length;i++){
      var s=camWaveStates[i];
      if(!s.canvas||!s.canvas.isConnected) continue;
      var channel=s.channel;
      var active=!!(channel&&(channel.matches(':hover')||channel.classList.contains('is-hover')||channel.classList.contains('is-pressed')));
      if(reduced){
        s.amp=active?0.55:0;
      }else if(active){
        s.amp=Math.min(1,s.amp+0.1);
      }else if(s.amp>0.02){
        s.amp=Math.max(0,s.amp-0.06);
      }else{
        s.amp=0;
      }
      if(s.amp>0&&!reduced){
        s.offset+=0.15;
        anyAlive=true;
      }
      paintCamWave(s);
      if(active&&!reduced) anyAlive=true;
    }
    if(anyAlive) camWaveRaf=requestAnimationFrame(tickCameraWaveRails);
  }

  function syncCameraWaveRails(root){
    stopCameraWaveRails();
    if(!root||!root.querySelectorAll) return;
    var nodes=root.querySelectorAll('.habit-hub-cam-canvas');
    if(!nodes.length) return;
    camWaveStates=[];
    for(var i=0;i<nodes.length;i++){
      var canvas=nodes[i];
      camWaveStates.push({
        canvas:canvas,
        channel:canvas.closest('[data-habit-channel="camera"]')||canvas.closest('[data-habit-channel]'),
        offset:0,
        amp:0
      });
      paintCamWave(camWaveStates[i]);
    }
  }

  function kickCameraWaveRails(){
    if(!camWaveStates||!camWaveStates.length) return;
    if(!camWaveRaf) camWaveRaf=requestAnimationFrame(tickCameraWaveRails);
  }

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

  function menuItemBtn(attr,label,opts){
    opts=opts||{};
    return '<button type="button" class="habit-hub-more-item'+(opts.danger?' is-danger':'')+'" '+attr+'>'+esc(label)+'</button>';
  }

  function isBatchSelectMode(){
    return !!ui().habitHubBatchMode||selectedIds().length>0;
  }

  function closeHubMenus(except){
    document.querySelectorAll('.habit-hub-menu[open]').forEach(function(d){
      if(except&&d===except) return;
      try{ d.removeAttribute('open'); }catch(_){}
    });
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
    var baseline=globalBaselineMapping();
    var baselineId=baseline&&baseline.id?String(baseline.id):'';
    var isActive=!!(baselineId&&cfg.activeSceneId===baselineId);
    var pairLine=(keyChannel.trigger||'—')+' → '+(keyChannel.target||'—');
    var html='<article class="habit-hub-hero habit-hub-hero--strip" role="region" data-habit-guide="universal" aria-label="'+esc(t('habitHubGlobalDefaultTitle'))+'">';
    html+=guideStructurePin(1,'habitHubGuidePinUniversal');
    html+='<div class="habit-hub-hero-head">';
    html+='<div class="habit-hub-hero-head-text">';
    html+='<div class="habit-hub-hero-title-row">';
    html+='<h5 class="habit-hub-hero-title">'+esc(t('habitHubGlobalDefaultTitle'))+'</h5>';
    html+='<span class="habit-hub-card-status '+(isActive?'is-ready':'')+'">'
      +esc(isActive?t('habitHubActiveBadge','正在使用'):t('habitHubUniversalIdle','未在使用'))+'</span>';
    html+='</div>';
    html+='<p class="habit-hub-hero-desc">'+esc(t('habitHubGlobalDefaultDesc'))+'</p>';
    html+='<p class="habit-hub-hero-pair">'+esc(pairLine)+'</p>';
    if(baseline) html+=hubChannelMicroPillsHtml(baseline);
    html+='</div>';
    html+='<div class="habit-hub-hero-actions">';
    if(baselineId&&!isActive){
      html+=ctaActBtn('data-habit-global-use="'+esc(baselineId)+'"',t('homeWbHabitBarUse'),ACT_ICON.keys,{primary:true,tip:t('homeWbHabitBarUse')});
    }
    html+='<details class="habit-hub-config-menu habit-hub-menu habit-hub-menu--global">';
    html+='<summary class="habit-hub-act is-cta" data-tip="'+esc(t('habitHubConfigMenu','改通用'))+'" aria-label="'+esc(t('habitHubConfigMenu','改通用'))+'">'
      +'<span>'+esc(t('habitHubConfigMenu','改通用'))+'</span></summary>';
    html+='<div class="habit-hub-more-menu-panel">';
    html+=menuItemBtn('data-habit-global-keys',t('habitHubGlobalOpenKeys','改按键'));
    html+=menuItemBtn('data-habit-global-voice',t('habitHubGlobalOpenVoice','配语音'));
    html+=menuItemBtn('data-habit-global-camera',t('habitHubGlobalOpenCamera','配摄像头'));
    html+='</div></details>';
    html+='</div></div></article>';
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
    var batchOn=isBatchSelectMode();
    var html='<div class="habit-hub-app-toolbar">';
    html+='<div class="habit-hub-filters" role="tablist" aria-label="'+esc(t('habitHubAppFilterAria'))+'">';
    html+=tab('all','habitHubFilterAllScenarios');
    html+=tab('recent','habitHubFilterRecent');
    if(showLegacy) html+=tab('legacy','habitHubFilterLegacy');
    html+='</div>';
    html+='<button type="button" class="habit-hub-filter-like'+(batchOn?' is-active':'')+'" data-habit-batch-toggle aria-pressed="'+(batchOn?'true':'false')+'">'
      +esc(batchOn?t('habitHubBatchDone','完成批量'):t('habitHubBatchManage','批量管理'))+'</button>';
    html+='</div>';
    return html;
  }

  function renderAppSectionEmpty(){
    return '<div class="habit-hub-app-empty" role="status">'
      +'<span class="habit-hub-app-empty-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="14" rx="3"/><path d="M8 21h8M12 18v3"/></svg></span>'
      +'<p class="habit-hub-app-empty-title">'+esc(t('habitHubAppEmptyTitle'))+'</p>'
      +'<p class="habit-hub-app-empty-desc">'+esc(t('habitHubAppEmptyDesc'))+'</p>'
      +'<div class="habit-hub-guide-anchor" data-habit-guide="new">'
      +guideStructurePin(3,'habitHubGuidePinNew')
      +'<button type="button" class="habit-hub-new-btn is-primary" data-habit-app-empty-new>'+esc(t('habitHubAppNewCta'))+'</button>'
      +'</div>'
      +'</div>';
  }

  function guideStructurePin(step, detailKey){
    if(!ui().habitGuideMode) return '';
    return ''
      +'<div class="habit-hub-guide-pin" data-habit-guide-pin="'+step+'">'
      +'<span class="habit-hub-guide-pin-num" aria-hidden="true">'+step+'</span>'
      +'<span class="habit-hub-guide-pin-callout">'
      +'<span class="habit-hub-guide-pin-label">'+esc(t(detailKey))+'</span>'
      +(step===1
        ?'<button type="button" class="habit-hub-guide-close" data-habit-guide-close aria-label="'+esc(t('habitHubGuideClose'))+'">×</button>'
        :'')
      +'</span>'
      +'</div>';
  }

  function syncGuideStructureClass(){
    var on=!!ui().habitGuideMode;
    var list=$('habitHubList');
    if(list) list.classList.toggle('is-guide-structure',on);
    var main=document.querySelector('.habit-hub-main');
    if(main) main.classList.toggle('is-guide-structure',on);
    var emptyNew=$('btnHabitHubEmptyNew');
    if(!emptyNew||typeof emptyNew.closest!=='function') return;
    emptyNew.setAttribute('data-habit-guide','new');
    var wrap=emptyNew.closest('.habit-hub-guide-anchor');
    if(on&&!wrap){
      if(!emptyNew.parentNode) return;
      wrap=document.createElement('div');
      wrap.className='habit-hub-guide-anchor';
      wrap.setAttribute('data-habit-guide','new');
      emptyNew.parentNode.insertBefore(wrap,emptyNew);
      wrap.appendChild(emptyNew);
    }
    if(wrap){
      var existing=wrap.querySelector('[data-habit-guide-pin="3"]');
      if(on&&!existing){
        wrap.insertAdjacentHTML('afterbegin',guideStructurePin(3,'habitHubGuidePinNew'));
      }else if(!on&&existing&&existing.parentNode){
        existing.parentNode.removeChild(existing);
      }
    }
  }

  function renderGuideAside(setup,appCount){
    if(!ui().habitGuideMode) return '';
    setup=setup||universalSetupState();
    appCount=appCount||0;
    var step1=setup.ready?'is-done':'is-current';
    var step2=setup.ready?(appCount>0?'is-done':'is-current'):'';
    var step3=setup.ready&&appCount>0?'is-current':'';
    return ''
      +'<ol class="habit-hub-guide-steps habit-hub-guide-steps--compact">'
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

  // P12: section shell without inner list content (for keyed card blocks in React island).
  function renderSectionShell(title,opts){
    opts=opts||{};
    if(!opts.toolbarHtml&&!opts.actionsHtml&&!opts.allowEmpty) return null;
    var headInner='<div class="habit-hub-section-head">'
      +'<div class="habit-hub-section-head-text">'
      +'<h4 class="habit-hub-section-title">'+esc(title)+'</h4>';
    if(opts.desc) headInner+='<p class="habit-hub-section-desc">'+esc(opts.desc)+'</p>';
    headInner+='</div>';
    if(opts.actionsHtml||opts.toolbarHtml){
      headInner+='<div class="habit-hub-section-tools">';
      if(opts.actionsHtml) headInner+=opts.actionsHtml;
      if(opts.toolbarHtml) headInner+=opts.toolbarHtml;
      headInner+='</div>';
    }
    headInner+='</div>';
    return {
      ariaLabel:title,
      extraClass:opts.extraClass||'',
      headInner:headInner
    };
  }

  function flattenModelToHtml(model){
    var html='';
    (model.blocks||[]).forEach(function(b){
      if(b.innerBlocks){
        var extra=b.extraClass?' habit-hub-section--'+b.extraClass:'';
        var guideAttr=b.dataHabitGuide?' data-habit-guide="'+esc(b.dataHabitGuide)+'"':'';
        html+='<section class="habit-hub-section'+extra+'"'+guideAttr+' aria-label="'+esc(b.ariaLabel||'')+'">';
        html+=b.headInner||'';
        html+='<div class="habit-hub-section-list habit-hub-section-list--cards">';
        b.innerBlocks.forEach(function(ib){ html+=ib.html||''; });
        html+='</div></section>';
      }else{
        html+=b.html||'';
      }
    });
    return html;
  }

  function buildHabitHubListModel(){
    var filter=normalizeHubFilter();
    var allItems=collectHabits();
    var splitAll=splitHubItems(allItems);
    var hasLegacy=splitAll.legacy.length>0;
    var filtered=sortItems(filterItems(allItems));
    var blocks=[];

    if(filter!=='legacy'){
      blocks.push({
        id:'section-global',
        html:'<section class="habit-hub-section habit-hub-section--hero" data-habit-guide="universal" aria-label="'+esc(t('habitHubSectionGlobal'))+'">'
          +'<div class="habit-hub-section-head"><div class="habit-hub-section-head-text">'
          +'<h4 class="habit-hub-section-title">'+esc(t('habitHubSectionGlobal'))+'</h4>'
          +'<p class="habit-hub-section-desc">'+esc(t('habitHubSectionGlobalDesc'))+'</p>'
          +'</div></div>'
          +'<div class="habit-hub-section-list">'+renderGlobalDefaultCard()+'</div></section>'
      });
    }

    if(filter==='legacy'){
      var legacyOnly=sortItems(splitAll.legacy);
      var legacyInner=legacyOnly.map(function(it){ return renderCard(it,{legacy:true}); }).join('');
      if(!legacyInner){
        legacyInner='<p class="habit-hub-section-desc">'+esc(t('habitHubSectionLegacyDesc'))+'</p>';
      }
      blocks.push({
        id:'section-legacy',
        html:renderSection(t('habitHubSectionLegacy'),legacyInner,{
          desc:t('habitHubSectionLegacyDesc'),
          extraClass:'legacy',
          toolbarHtml:renderAppFilterBar({showLegacy:hasLegacy}),
          allowEmpty:true
        })
      });
    }else{
      var cardBlocks=filtered.map(function(it,idx){
        return {
          id:'card-'+String(it.mapping.id),
          html:renderCard(it,{
            horizontal:true,
            canMoveUp:idx>0,
            canMoveDown:idx<filtered.length-1
          })
        };
      });
      pruneSelection(filtered.map(function(it){ return it&&it.mapping&&it.mapping.id; }).filter(Boolean));
      var innerBlocks=[];
      if(ui().habitHubCreating){
        innerBlocks.push({id:'inline-create',html:renderInlineCreatePicker()});
        innerBlocks=innerBlocks.concat(cardBlocks);
      }else if(!cardBlocks.length){
        innerBlocks.push({id:'app-empty',html:renderAppSectionEmpty()});
      }else{
        innerBlocks.push({id:'selection-bar',html:renderSelectionBar(filtered.length)});
        innerBlocks=innerBlocks.concat(cardBlocks);
      }
      var codexBanner=renderCodexDetectBanner();
      if(codexBanner){
        blocks.push({id:'codex-banner',html:codexBanner});
      }
      var shell=renderSectionShell(t('habitHubSectionApp'),{
        desc:t('habitHubSectionAppDesc'),
        actionsHtml:''
          +'<div class="habit-hub-guide-anchor habit-hub-guide-anchor--new" data-habit-guide="new">'
          +guideStructurePin(3,'habitHubGuidePinNew')
          +'<button type="button" class="habit-hub-filter-like is-primary habit-hub-section-new" data-habit-hub-new>'+esc(t('habitHubNew'))+'</button>'
          +'</div>',
        toolbarHtml:renderAppFilterBar({showLegacy:hasLegacy}),
        allowEmpty:true
      });
      if(shell){
        blocks.push({
          id:'section-app',
          ariaLabel:t('habitHubSectionApp'),
          extraClass:'',
          dataHabitGuide:'apps',
          headInner:guideStructurePin(2,'habitHubGuidePinApps')+shell.headInner,
          innerBlocks:innerBlocks
        });
      }
      if(filter==='all'&&hasLegacy){
        var legacyInnerAll=splitAll.legacy.map(function(it){ return renderCard(it,{legacy:true}); }).join('');
        blocks.push({
          id:'section-legacy',
          html:renderSection(t('habitHubSectionLegacy'),legacyInnerAll,{
            desc:t('habitHubSectionLegacyDesc'),
            extraClass:'legacy'
          })
        });
      }
    }

    return {hasContent:blocks.length>0,blocks:blocks};
  }

  function afterHabitHubListCommit(){
    applyViewMode();
    syncGuideStructureClass();
    syncGuideBarVisibility();
    setTimeout(function(){
      hydrateHubAppIcons();
      focusRenameInput();
    },0);
  }

  function syncGuideBarVisibility(){
    var bar=$('habitHubGuideBar');
    var on=!!ui().habitGuideMode;
    if(bar) bar.hidden=!on;
    var shell=$('habitHubView');
    if(shell) shell.classList.toggle('is-guide-on',on);
  }

  function habitHubChromeMounted(){
    return !!global.__otHabitHubChromeMounted;
  }

  function guideView(setup,appCount){
    return renderGuideAside(setup,appCount);
  }

  function buildHabitHubChromeModel(){
    var listModel=buildHabitHubListModel();
    var splitForGuide=splitHubItems(collectHabits());
    return {
      guideHtml:renderGuideAside(universalSetupState(),splitForGuide.app.length),
      empty:{
        hidden:!!listModel.hasContent,
        title:t('habitHubEmptyTitle'),
        desc:t('habitHubEmptyDesc'),
        newLabel:t('habitHubNew')
      },
      sort:{
        value:ui().habitHubSort||'manual',
        options:[
          {value:'manual',label:t('habitHubSortManual')},
          {value:'recent',label:t('habitHubSortRecent')},
          {value:'name',label:t('habitHubSortName')},
          {value:'type',label:t('habitHubSortType')}
        ]
      },
      hasContent:!!listModel.hasContent
    };
  }

  function syncFilterTabStates(){
    var f=normalizeHubFilter();
    document.querySelectorAll('[data-habit-filter]').forEach(function(btn){
      var on=btn.dataset.habitFilter===f;
      btn.classList.toggle('is-active',on);
      btn.setAttribute('aria-selected',on?'true':'false');
    });
    applyViewMode();
  }

  function afterHabitHubChromeCommit(){
    syncFilterTabStates();
  }

  // P12/P13: 列表 + 壳层轻量刷新（避免 delete/confirm 走全量 render() 假死）
  function scheduleHubPaint(){
    requestAnimationFrame(function(){
      setTimeout(function(){
        renderList();
        if(habitHubChromeMounted()&&typeof global.__otHabitHubChromeSync==='function'){
          global.__otHabitHubChromeSync();
        }else{
          var empty=$('habitHubEmpty');
          var model=buildHabitHubListModel();
          if(empty) empty.hidden=!!model.hasContent;
          renderFilters();
        }
        syncFilterTabStates();
      },0);
    });
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
    // Light hub: status + doors only. Never embed keys/voice/camera/Soft Pad editors here.
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
    var renaming=String(ui().habitHubRenameId||'')===m.id;
    var confirmingDel=String(ui().habitHubConfirmDelId||'')===m.id;
    var selected=appScenario&&isSelected(m.id);
    var html='<article class="habit-hub-card habit-hub-card--'+esc(type)
      +(horizontal?' habit-hub-card--horizontal':'')
      +(legacy?' habit-hub-card--legacy':'')
      +(isActive?' is-active-scene':'')
      +(selected?' is-selected':'')
      +(renaming?' is-renaming':'')
      +(confirmingDel?' is-confirm-del':'')
      +'" data-habit-card="'+esc(m.id)+'" role="listitem">';
    var enOn=!!m.enabled;
    // Active badge only when enabled — avoid 已停用 + 正在使用 dirty pair.
    var showActive=!!(isActive&&(!appScenario||enOn));
    if(appScenario&&isBatchSelectMode()){
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
      if(showActive) html+='<span class="habit-hub-card-active">'+esc(t('habitHubActiveBadge'))+'</span>';
      var activation=primaryActivationPhrase(m,cfg);
      if(activation) html+='<span class="habit-hub-card-wake" title="'+esc(t('habitHubDescWakePhrase'))+'">'+esc(activation)+'</span>';
    }
    html+='</span>';
    if(!renaming){
      html+='<span class="habit-hub-card-desc">'+esc(hubPairLine(m))+'</span>';
      html+=hubChannelMicroPillsHtml(m);
      if(!isAppScenario(m)){
        var longDesc=habitDescription(m,type,cfg,profile);
        if(longDesc&&longDesc!==hubPairLine(m)){
          html+='<span class="habit-hub-card-meta">'+esc(longDesc)+'</span>';
        }
      }else{
        var meta=habitMetaLine(m,profile);
        if(meta) html+='<span class="habit-hub-card-meta">'+esc(meta)+'</span>';
        if(global.OneToneHabitScenarioVoiceCommand&&global.OneToneHabitScenarioVoiceCommand.hubChipHtml){
          html+=global.OneToneHabitScenarioVoiceCommand.hubChipHtml(m)||'';
        }
      }
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
        html+='<button type="button" class="toggle-switch habit-hub-enable-toggle'+(enOn?' is-on':'')+'" data-habit-enable="'+esc(m.id)+'" role="switch" aria-checked="'+(enOn?'true':'false')+'" title="'+esc(t('habitScenarioEnableLbl'))+'" data-tip="'+esc(t('habitScenarioEnableLbl'))+'" aria-label="'+esc(t('habitScenarioEnableLbl'))+'"></button>';
        if(!showActive){
          html+=ctaActBtn('data-habit-scenario-use="'+esc(m.id)+'"',t('homeWbHabitBarUse','设为正在使用'),ACT_ICON.keys,{primary:true,tip:t('homeWbHabitBarUse')});
        }
        html+='<details class="habit-hub-config-menu habit-hub-menu">';
        html+='<summary class="habit-hub-act is-cta" data-tip="'+esc(t('habitHubConfigChannels','配置'))+'" aria-label="'+esc(t('habitHubConfigChannels','配置'))+'">'
          +'<span>'+esc(t('habitHubConfigChannels','配置'))+'</span></summary>';
        html+='<div class="habit-hub-more-menu-panel">';
        html+=menuItemBtn('data-habit-scenario-keys="'+esc(m.id)+'"',t('habitHubGlobalOpenKeys','改按键'));
        html+=menuItemBtn('data-habit-scenario-voice="'+esc(m.id)+'"',t('habitHubGlobalOpenVoice','配语音'));
        html+=menuItemBtn('data-habit-scenario-camera="'+esc(m.id)+'"',t('habitHubGlobalOpenCamera','配摄像头'));
        var softHub=global.OneToneSoftPadHub;
        if(softHub&&softHub.isSoftPadSchemeEligible&&softHub.isSoftPadSchemeEligible(m)){
          html+=menuItemBtn('data-habit-scenario-softpad="'+esc(m.id)+'"',t('habitHubGlobalOpenSoftPad','配虚拟键盘'));
        }
        html+='</div></details>';
        html+='<details class="habit-hub-more-menu habit-hub-menu">';
        html+='<summary class="habit-hub-act is-icon" title="'+esc(t('habitHubActMore','更多'))+'" aria-label="'+esc(t('habitHubActMore','更多'))+'">'
          +'<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>'
          +'</summary>';
        html+='<div class="habit-hub-more-menu-panel">';
        html+=menuItemBtn('data-habit-move="up" data-habit-id="'+esc(m.id)+'"',t('habitHubActMoveUp'));
        html+=menuItemBtn('data-habit-move="down" data-habit-id="'+esc(m.id)+'"',t('habitHubActMoveDown'));
        html+=menuItemBtn('data-habit-dup="'+esc(m.id)+'"',t('habitHubActCopy'));
        html+=menuItemBtn('data-habit-rename="'+esc(m.id)+'"',t('habitHubActRename'));
        if(global.OneToneAgentScenarioTemplate&&global.OneToneAgentScenarioTemplate.isCodexScenario
          &&global.OneToneAgentScenarioTemplate.isCodexScenario(m)){
          html+=menuItemBtn('data-habit-codex-reset="'+esc(m.id)+'"',t('codexPackReset','重置推荐'));
        }
        html+='<hr class="habit-hub-menu-sep" />';
        html+=menuItemBtn('data-habit-del="'+esc(m.id)+'"',t('habitHubActDelete'),{danger:true});
        html+='</div></details>';
      }else{
        if(legacy){
          html+='<button type="button" class="habit-hub-act is-primary is-cta" data-habit-migrate="'+esc(m.id)+'" title="'+esc(t('habitHubLegacyMigrate'))+'" data-tip="'+esc(t('habitHubLegacyMigrate'))+'">'+esc(t('habitHubLegacyMigrate'))+'</button>';
        }
        html+='<details class="habit-hub-more-menu habit-hub-menu">';
        html+='<summary class="habit-hub-act is-icon" title="'+esc(t('habitHubActMore','更多'))+'" aria-label="'+esc(t('habitHubActMore','更多'))+'">'
          +'<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>'
          +'</summary>';
        html+='<div class="habit-hub-more-menu-panel">';
        html+=menuItemBtn('data-habit-dup="'+esc(m.id)+'"',t('habitHubActCopy'));
        html+=menuItemBtn('data-habit-rename="'+esc(m.id)+'"',t('habitHubActRename'));
        html+='<hr class="habit-hub-menu-sep" />';
        html+=menuItemBtn('data-habit-del="'+esc(m.id)+'"',t('habitHubActDelete'),{danger:true});
        html+='</div></details>';
      }
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
    if(!habitHubChromeMounted()){
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
      var emptyTitle=$('habitHubEmptyTitle');
      var emptyDesc=$('habitHubEmptyDesc');
      var emptyNew=$('btnHabitHubEmptyNew');
      if(emptyTitle) emptyTitle.textContent=t('habitHubEmptyTitle');
      if(emptyDesc) emptyDesc.textContent=t('habitHubEmptyDesc');
      if(emptyNew) emptyNew.textContent=t('habitHubNew');
    }
    var guideBtn=$('btnHabitHubGuideMode');
    if(guideBtn){
      var guideOn=!!ui().habitGuideMode;
      guideBtn.classList.toggle('is-active',guideOn);
      guideBtn.setAttribute('aria-pressed',guideOn?'true':'false');
    }
    syncGuideStructureClass();
    syncGuideBarVisibility();
  }

  function renderFilters(){
    if(habitHubChromeMounted()){
      syncFilterTabStates();
      if(typeof global.__otHabitHubChromeSync==='function') global.__otHabitHubChromeSync();
      return;
    }
    syncFilterTabStates();
    var sort=$('habitHubSort');
    if(sort) sort.value=ui().habitHubSort||'manual';
  }

  function renderList(){
    var list=$('habitHubList');
    var empty=$('habitHubEmpty');
    if(!list) return;
    var model=buildHabitHubListModel();
    var hasContent=!!model.hasContent;
    if(!habitHubChromeMounted()&&empty) empty.hidden=hasContent;
    list.hidden=!hasContent;
    // P12 守卫：React 岛接管 #habitHubList 后，legacy 不再 innerHTML 重建整表；
    // 改为通知岛做 keyed diff 同步。岛未挂载时走原路径。
    if(global.OneToneIslands&&global.OneToneIslands.isMounted&&global.OneToneIslands.isMounted('habitHubList')){
      if(typeof global.__otHabitHubListSync==='function') global.__otHabitHubListSync();
      if(habitHubChromeMounted()&&typeof global.__otHabitHubChromeSync==='function') global.__otHabitHubChromeSync();
      return;
    }
    list.innerHTML=hasContent?flattenModelToHtml(model):'';
    afterHabitHubListCommit();
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

  var renderRaf=0;
  var pruneOnceDone=false;

  function renderNow(){
    if(global.OneToneAppSession&&global.OneToneAppSession.isBootSettling&&global.OneToneAppSession.isBootSettling()){
      if(!render._bootDefer){
        render._bootDefer=true;
        global.OneToneAppSession.whenBootSettled(function(){
          render._bootDefer=false;
          // Off settle tick — sync hub paint stacked with camera cold-start → 假死.
          setTimeout(function(){ render(); },80);
        });
      }
      return;
    }
    // One-shot only — paint-path prune+save used to thrash and 假死 side-nav clicks.
    if(!pruneOnceDone){
      pruneOnceDone=true;
      try{
        if(global.OneToneAppBehaviorRules&&global.OneToneAppBehaviorRules.pruneIncompleteCustomStubs){
          global.OneToneAppBehaviorRules.pruneIncompleteCustomStubs({persist:true});
        }
      }catch(_){}
    }
    var t0=(typeof performance!=='undefined'&&performance.now)?performance.now():Date.now();
    renderLabels();
    renderList();
    renderFilters();
    applyShellVisibility();
    syncCameraWaveRails($('habitHubList'));
    try{
      if(global.OneToneIpc&&global.OneToneIpc.invoke){
        var ms=Math.round(((typeof performance!=='undefined'&&performance.now)?performance.now():Date.now())-t0);
        global.OneToneIpc.invoke('cmd_app_log',{line:'fe habitHub.render '+ms+'ms'}).catch(function(){});
      }
    }catch(_){}
  }

  // Coalesce SceneModeHub / HabitMulti / applyLang callers — full paint every 2ms made side options unclickable.
  function render(){
    if(renderRaf) return;
    if(typeof requestAnimationFrame!=='function'){
      renderNow();
      return;
    }
    renderRaf=requestAnimationFrame(function(){
      renderRaf=0;
      renderNow();
    });
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
      if(opts.openCamera) global.OneToneHabitScenarioContextBanner.openScenarioCameraEdit(m.id,{returnToHub:true});
      else if(opts.layer==='advanced'||opts.voiceTab||opts.openVoice){
        global.OneToneHabitScenarioContextBanner.openScenarioVoiceEdit(m.id,{returnToHub:true});
      }else{
        global.OneToneHabitScenarioContextBanner.openScenarioKeysEdit(m.id,{returnToHub:true});
      }
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
    ui().habitHubBatchMode=false;
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
    scheduleHubPaint();
    var saveAsync=global.OneToneConfigPersist&&global.OneToneConfigPersist.saveAsync;
    var save=global.OneToneConfigPersist&&global.OneToneConfigPersist.save;
    var done=function(){
      if(global.OneToneMappingTrashMenu&&global.OneToneMappingTrashMenu.renderTrashList){
        global.OneToneMappingTrashMenu.renderTrashList();
      }
      scheduleHubPaint();
      if(global.OneToneAppToast) global.OneToneAppToast.show(t('movedToTrash'),'scheme');
    };
    if(saveAsync) saveAsync({source:'mapping'}).then(done).catch(done);
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

  function countAppScenarios(appId,exceptMappingId){
    appId=String(appId||'').trim();
    exceptMappingId=String(exceptMappingId||'').trim();
    if(!appId) return 0;
    var cfg=state().config||{};
    var list=Array.isArray(cfg.mappings)?cfg.mappings:[];
    var n=0;
    for(var i=0;i<list.length;i++){
      var m=list[i];
      if(!m||!isAppScenario(m)) continue;
      if(exceptMappingId&&m.id===exceptMappingId) continue;
      if(String(m.appTargetId||'')===appId) n++;
    }
    return n;
  }

  /** Unique display group for multi-workflow apps (Codex). First stays base name; next get · 2, · 3… */
  function uniqueScenarioName(appId,exceptMappingId){
    var base=defaultScenarioName(appId);
    var n=countAppScenarios(appId,exceptMappingId);
    if(n<=0) return base;
    return base+' · '+(n+1);
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

  function isSelfForegroundIdentity(identity){
    if(!identity) return true;
    var exe=String(identity.exeName||identity.exe_name||'').toLowerCase();
    if(exe.indexOf('onetone')>=0) return true;
    var path=String(identity.fullPath||identity.full_path||'').toLowerCase();
    return path.indexOf('onetone')>=0||path.indexOf('voice-pilot')>=0;
  }

  function fgIdentityKey(identity){
    if(!identity) return '';
    return String(identity.exeName||identity.exe_name||'')+'|'
      +String(identity.matchedPresetAppId||identity.matched_preset_app_id||identity.appId||'')+'|'
      +String(identity.fullPath||identity.full_path||'');
  }

  function refreshInlineCreateForeground(){
    if(!ui().habitHubCreating) return;
    if(!global.OneToneIpc||!global.OneToneIpc.invoke) return;
    global.OneToneIpc.invoke('cmd_foreground_app',{}).then(function(res){
      if(!ui().habitHubCreating) return;
      var next=null;
      if(res&&(res.exeName||res.exe_name)&&!isSelfForegroundIdentity(res)) next=res;
      var prevKey=fgIdentityKey(ui().habitHubFgIdentity);
      var nextKey=fgIdentityKey(next);
      ui().habitHubFgIdentity=next;
      if(prevKey!==nextKey) render();
    }).catch(function(){});
  }

  function acceptForegroundRecommend(){
    var identity=ui().habitHubFgIdentity;
    if(!identity) return;
    var existing=findAppScenarioForIdentity(identity);
    if(existing){
      openExistingFgScenario(existing.id);
      return;
    }
    var rules=global.OneToneAppBehaviorRules;
    var presetId=String(identity.matchedPresetAppId||identity.matched_preset_app_id||identity.appId||'').trim();
    if(presetId&&rules&&rules.isPresetAppId&&rules.isPresetAppId(presetId)){
      ui().habitHubFgIdentity=null;
      createAppScenario(presetId);
      return;
    }
    var prevSelected=String(state().selectedMappingId||'');
    var m=createAppScenario('custom',{deferPersist:true});
    if(!m) return;
    if(rules&&rules.setPickerCreateTarget) rules.setPickerCreateTarget(m.id);
    if(rules&&rules.pickRunningIdentity) rules.pickRunningIdentity(m,identity);
    if(rules&&rules.isIncompleteCustomStub&&rules.isIncompleteCustomStub(m)){
      if(rules.discardIncompleteCustomCreate) rules.discardIncompleteCustomCreate(m.id);
      ui().habitHubFgIdentity=null;
      render();
      return;
    }
    try{
      if(global.OneToneConfigPersist&&global.OneToneConfigPersist.rememberAppScenariosNow){
        global.OneToneConfigPersist.rememberAppScenariosNow(state().config);
      }
    }catch(_){}
    restoreBaselineSelection(prevSelected);
    ui().habitHubFgIdentity=null;
    render();
  }

  function openExistingFgScenario(mappingId){
    mappingId=String(mappingId||'').trim();
    ui().habitHubCreating=false;
    ui().habitHubFgIdentity=null;
    if(mappingId&&core()&&core().byId&&core().byId(mappingId)){
      state().selectedMappingId=mappingId;
    }
    if(global.OneToneAppToast) global.OneToneAppToast.show(t('habitHubAppScenarioExists'),'scheme');
    render();
  }

  function renderFgRecommendCard(){
    var identity=ui().habitHubFgIdentity;
    if(!identity) return '';
    var rules=global.OneToneAppBehaviorRules;
    var name=rules&&rules.identityDisplayName?String(rules.identityDisplayName(identity)||'').trim():'';
    if(!name){
      name=String(identity.displayName||identity.display_name||identity.exeName||identity.exe_name||'')
        .replace(/\.exe$/i,'').trim()||t('appPickerForeground');
    }
    var exe=String(identity.exeName||identity.exe_name||'').trim();
    var existing=findAppScenarioForIdentity(identity);
    if(existing){
      return '<button type="button" class="habit-hub-codex-recommend habit-hub-fg-recommend" data-habit-open-fg-existing="'+esc(existing.id)+'" role="listitem">'
        +'<span class="habit-hub-codex-recommend-badge">'+esc(t('habitHubFgBadge'))+'</span>'
        +'<span class="habit-hub-codex-recommend-title">'+esc(name)+'</span>'
        +'<span class="habit-hub-codex-recommend-sub">'+esc(t('habitHubFgRecommendOpen'))+'</span>'
        +(exe?'<span class="habit-hub-codex-recommend-note">'+esc(exe)+'</span>':'')
        +'</button>';
    }
    return '<button type="button" class="habit-hub-codex-recommend habit-hub-fg-recommend" data-habit-create-fg role="listitem">'
      +'<span class="habit-hub-codex-recommend-badge">'+esc(t('habitHubFgBadge'))+'</span>'
      +'<span class="habit-hub-codex-recommend-title">'+esc(t('habitHubFgRecommendTitle').replace('{name}',name))+'</span>'
      +'<span class="habit-hub-codex-recommend-sub">'+esc(t('habitHubFgRecommendHint'))+'</span>'
      +(exe?'<span class="habit-hub-codex-recommend-note">'+esc(exe)+'</span>':'')
      +'</button>';
  }

  function startInlineCreate(){
    ui().habitHubCreating=true;
    ui().habitHubFgIdentity=null;
    ui().habitView='hub';
    if(ui().habitHubFilter==='legacy') ui().habitHubFilter='all';
    if(global.OneToneSettingsDrawer) global.OneToneSettingsDrawer.setPanel('habits');
    applyShellVisibility();
    render();
    refreshInlineCreateForeground();
  }

  function cancelInlineCreate(){
    ui().habitHubCreating=false;
    ui().habitHubFgIdentity=null;
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
    // Preset apps: one scenario per app — except Codex, which allows multiple workflows.
    // Custom: unlimited. opts.reuseExisting=true keeps recommend-entry singleton behavior.
    if(appId!=='custom'&&appId!=='codex-chat'){
      var existing=findAppScenarioByAppId(appId);
      if(existing&&!opts.migrateFrom){
        ui().habitHubCreating=false;
        if(global.OneToneAppToast) global.OneToneAppToast.show(t('habitHubAppScenarioExists'),'scheme');
        render();
        return existing;
      }
    }
    if(appId==='codex-chat'&&opts.reuseExisting){
      var existingCodex=findAppScenarioByAppId(appId);
      if(existingCodex&&!opts.migrateFrom){
        var Texist=global.OneToneAgentScenarioTemplate;
        if(Texist&&Texist.ensurePackForMapping) Texist.ensurePackForMapping(existingCodex,{persist:true});
        ui().habitHubCreating=false;
        render();
        return existingCodex;
      }
    }
    var prevSelected=String(state().selectedMappingId||'');
    var id=core().newMappingId?core().newMappingId():('m-'+Date.now()+'-'+Math.random().toString(36).slice(2,7));
    var m={
      id:id,
      label:'',
      group:appId==='codex-chat'?uniqueScenarioName(appId):defaultScenarioName(appId),
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
      cameraOverride:null,
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
    // Selecting Codex app activates builtin Micro pack (keys + voice + camera).
    if(appId==='codex-chat'){
      var Tseed=global.OneToneAgentScenarioTemplate;
      if(Tseed&&Tseed.applyCodexPackToMapping){
        Tseed.applyCodexPackToMapping(m,{
          channels:['keys','voice','camera'],
          essentialsOnly:false,
          reset:true,
          cameraTarget:'override',
          enableProfile:'scenarioAllKeys',
          setAppTarget:true,
          persist:false
        });
      }
    }
    if(opts.migrateFrom&&core().byId){
      var src=core().byId(String(opts.migrateFrom||'').trim());
      if(src){
        ['triggerKey','targetKey','triggerMode','autoEnterEnabled','cancelEnabled','keyModeEnabled','voiceModeEnabled'].forEach(function(k){
          if(src[k]!==undefined) m[k]=src[k];
        });
        if(src.voiceOverride) m.voiceOverride=JSON.parse(JSON.stringify(src.voiceOverride));
        if(src.cameraOverride) m.cameraOverride=JSON.parse(JSON.stringify(src.cameraOverride));
      }
    }
    cfg.mappings=Array.isArray(cfg.mappings)?cfg.mappings:[];
    cfg.mappings.push(m);
    ui().habitHubCreating=false;
    touchUpdated(m);
    // Remember only real app scenarios — bare custom stubs must not reinject later.
    if(!(appId==='custom'&&opts.deferPersist)){
      try{
        if(global.OneToneConfigPersist&&global.OneToneConfigPersist.rememberAppScenariosNow){
          global.OneToneConfigPersist.rememberAppScenariosNow(cfg);
        }
      }catch(_){}
    }
    if(opts.deferPersist){
      // Keep selection on the draft so the app picker can bind identity/icon.
      state().selectedMappingId=m.id;
      return m;
    }
    // Keep global baseline selected so Keys/Voice "universal" context is not stolen.
    restoreBaselineSelection(prevSelected);
    var saveFn=global.OneToneConfigPersist&&global.OneToneConfigPersist.saveAsync;
    var done=function(ok){
      render();
      if(ok===false){
        if(global.OneToneAppToast) global.OneToneAppToast.show(t('habitScenarioSaveFailed'),'scheme');
        return;
      }
      if(global.OneToneAppToast) global.OneToneAppToast.show(t('habitHubAppScenarioCreated'),'scheme');
    };
    if(saveFn) saveFn({source:'mapping'}).then(done).catch(function(){ done(false); });
    else{
      if(hooks().save) hooks().save();
      else if(global.OneToneConfigPersist&&global.OneToneConfigPersist.save) global.OneToneConfigPersist.save();
      done(true);
    }
    return m;
  }

  function renderCodexDetectBanner(){
    var A=global.OneToneAgentActions;
    var T=global.OneToneAgentScenarioTemplate;
    if(!A||!T) return '';
    // Soft detect-only hint; no duplicate 配按键/配语音/配摄像头 CTAs (card already has them).
    if(!isCodexDetected()) return '';
    var existing=findAppScenarioByAppId(A.APP_TARGET_ID);
    var title=t('habitCodexDetectTitle','检测到 Codex，可创建 Codex 应用场景');
    var hint=existing
      ?t('habitCodexDetectHintReady','常用能力已准备好 · 在下方场景卡中改按键 / 配语音 / 配摄像头')
      :t('habitCodexDetectHint','点「+ 新建应用场景」选择 Codex，即可准备常用能力');
    var html='<div class="habit-hub-codex-banner" role="region" aria-label="Codex">'
      +'<div class="habit-hub-codex-banner-text">'
      +'<p class="habit-hub-codex-banner-title">'+esc(title)+'</p>'
      +'<p class="habit-hub-codex-banner-hint">'+esc(hint)+'</p>'
      +'</div>';
    if(!existing){
      html+='<button type="button" class="habit-hub-act is-primary" data-habit-codex-apply>'
        +esc(t('habitCodexApply','创建 Codex 应用场景'))+'</button>';
    }
    html+='</div>';
    return html;
  }

  function isCodexDetected(){
    try{
      var nav=global.OneToneHabitLayerNav;
      if(nav&&typeof nav.foregroundAppId==='function'){
        if(String(nav.foregroundAppId()||'')==='codex-chat') return true;
      }
    }catch(_){}
    try{
      var st=state();
      var fg=st&&st.runtime&&(st.runtime.foregroundApp||st.runtime.foreground);
      var preset=fg&&(fg.matchedPresetAppId||fg.matched_preset_app_id||fg.appId);
      if(String(preset||'')==='codex-chat') return true;
      var exe=String((fg&&(fg.exeName||fg.exe_name))||'');
      if(/^Codex\.exe$/i.test(exe)) return true;
    }catch(_){}
    return false;
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
    html+=renderFgRecommendCard();
    var A=global.OneToneAgentActions;
    if(A){
      html+='<button type="button" class="habit-hub-codex-recommend" data-habit-codex-apply role="listitem">'
        +'<span class="habit-hub-codex-recommend-badge">'+esc(t('habitCodexBadge','OneTone 推荐'))+'</span>'
        +'<span class="habit-hub-codex-recommend-title">'+esc(t('habitCodexCardTitle','Codex 应用场景'))+'</span>'
        +'<span class="habit-hub-codex-recommend-sub">'+esc(t('habitCodexCardSub','一键准备常用能力与推荐快捷键'))+'</span>'
        +'<span class="habit-hub-codex-recommend-note">'+esc(A.DISCLAIMER_ZH)+'</span>'
        +'</button>';
    }
    html+='<div class="habit-hub-inline-create-grid" role="list">';
    presets.forEach(function(p){
      var id=String(p&&p.id||'').trim();
      if(!id) return;
      var name=appDisplayName(id);
      var icon=p.icon?'<img class="habit-wizard-app-icon" src="'+esc(p.icon)+'" alt="" decoding="async" />':'';
      var exists=id!=='codex-chat'&&!!findAppScenarioByAppId(id);
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

  var hubMenusBound=false;
  function bindHubMenuBehavior(){
    if(hubMenusBound) return;
    hubMenusBound=true;
    document.addEventListener('toggle',function(e){
      var d=e.target;
      if(!d||!d.classList||!d.classList.contains('habit-hub-menu')) return;
      if(d.open) closeHubMenus(d);
    },true);
    document.addEventListener('pointerdown',function(e){
      if(e.target&&e.target.closest&&e.target.closest('.habit-hub-menu')) return;
      closeHubMenus();
    },true);
    document.addEventListener('keydown',function(e){
      if(e.key!=='Escape') return;
      var open=document.querySelector('.habit-hub-menu[open]');
      if(!open) return;
      var summary=open.querySelector('summary');
      closeHubMenus();
      if(summary&&typeof summary.focus==='function') summary.focus();
      e.preventDefault();
    },true);
  }

  function bindEvents(){
    bindHubMenuBehavior();
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
          scheduleHubPaint();
          return;
        }
      },true);
      hub.addEventListener('change',function(e){
        if(e.target&&e.target.id==='habitHubSort'){
          ui().habitHubSort=e.target.value;
          scheduleHubPaint();
          return;
        }
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
          scheduleHubPaint();
          return;
        }
        var batchToggle=e.target.closest&&e.target.closest('[data-habit-batch-toggle]');
        if(batchToggle){
          e.preventDefault();
          e.stopPropagation();
          if(isBatchSelectMode()&&ui().habitHubBatchMode){
            ui().habitHubBatchMode=false;
            ui().habitHubSelectedIds=[];
            ui().habitHubBatchConfirm=false;
          }else if(isBatchSelectMode()&&!ui().habitHubBatchMode){
            ui().habitHubSelectedIds=[];
            ui().habitHubBatchConfirm=false;
          }else{
            ui().habitHubBatchMode=true;
          }
          scheduleHubPaint();
          return;
        }
        var globalKeysBtn=e.target.closest&&e.target.closest('[data-habit-global-keys]');
        if(globalKeysBtn){
          e.preventDefault();
          e.stopPropagation();
          closeHubMenus();
          if(global.OneToneHabitScenarioContextBanner) global.OneToneHabitScenarioContextBanner.openGlobalKeys({fromHub:true});
          else if(global.OneToneSettingsDrawer) global.OneToneSettingsDrawer.setPanel('keys');
          return;
        }
        var globalUseBtn=e.target.closest&&e.target.closest('[data-habit-global-use]');
        if(globalUseBtn){
          e.preventDefault();
          e.stopPropagation();
          closeHubMenus();
          var useId=String(globalUseBtn.getAttribute('data-habit-global-use')||'').trim();
          if(useId&&global.OneToneSceneActivate&&global.OneToneSceneActivate.activateScene){
            global.OneToneSceneActivate.activateScene(useId);
          }
          scheduleHubPaint();
          return;
        }
        var globalVoiceBtn=e.target.closest&&e.target.closest('[data-habit-global-voice]');
        if(globalVoiceBtn){
          e.preventDefault();
          e.stopPropagation();
          closeHubMenus();
          if(global.OneToneHabitScenarioContextBanner) global.OneToneHabitScenarioContextBanner.openGlobalVoice({fromHub:true});
          else if(global.OneToneSettingsDrawer) global.OneToneSettingsDrawer.setPanel('voiceWake');
          return;
        }
        var globalCameraBtn=e.target.closest&&e.target.closest('[data-habit-global-camera]');
        if(globalCameraBtn){
          e.preventDefault();
          e.stopPropagation();
          closeHubMenus();
          if(global.OneToneHabitScenarioContextBanner) global.OneToneHabitScenarioContextBanner.openGlobalCamera({fromHub:true});
          else if(global.OneToneSettingsDrawer) global.OneToneSettingsDrawer.setPanel('camera');
          return;
        }
        var globalSoftPadBtn=e.target.closest&&e.target.closest('[data-habit-global-softpad]');
        if(globalSoftPadBtn){
          e.preventDefault();
          e.stopPropagation();
          openHabitSoftPadPanel('');
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
          var ch=channel.getAttribute('data-habit-channel');
          if(ch==='voice'){
            if(global.OneToneHabitScenarioContextBanner) global.OneToneHabitScenarioContextBanner.openGlobalVoice({fromHub:true});
            else if(global.OneToneSettingsDrawer) global.OneToneSettingsDrawer.setPanel('voiceWake');
          }else if(ch==='camera'){
            if(global.OneToneHabitScenarioContextBanner) global.OneToneHabitScenarioContextBanner.openGlobalCamera({fromHub:true});
            else if(global.OneToneSettingsDrawer) global.OneToneSettingsDrawer.setPanel('camera');
          }else if(ch==='softPad'){
            openHabitSoftPadPanel('');
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
        var codexOpen=e.target.closest&&e.target.closest('[data-habit-codex-open]');
        if(codexOpen){
          e.preventDefault();
          var Aopen=global.OneToneAgentActions;
          var existingOpen=Aopen&&findAppScenarioByAppId(Aopen.APP_TARGET_ID);
          var panel=String(codexOpen.getAttribute('data-habit-codex-open')||'keys');
          var banner=global.OneToneHabitScenarioContextBanner;
          if(existingOpen&&banner){
            if(panel==='voice'&&banner.openScenarioVoiceEdit) banner.openScenarioVoiceEdit(existingOpen.id,{returnToHub:true});
            else if(panel==='camera'&&banner.openScenarioCameraEdit) banner.openScenarioCameraEdit(existingOpen.id,{returnToHub:true});
            else if(banner.openScenarioKeysEdit) banner.openScenarioKeysEdit(existingOpen.id,{returnToHub:true});
          }
          return;
        }
        var codexCardReset=e.target.closest&&e.target.closest('[data-habit-codex-reset]');
        if(codexCardReset){
          e.preventDefault();
          var resetId=String(codexCardReset.getAttribute('data-habit-codex-reset')||'').trim();
          var Treset=global.OneToneAgentScenarioTemplate;
          var mreset=core()&&core().byId?core().byId(resetId):null;
          if(Treset&&Treset.applyCodexPackToMapping&&mreset){
            Treset.applyCodexPackToMapping(mreset,{
              channels:['keys','voice','camera'],
              essentialsOnly:false,
              reset:true,
              cameraTarget:'override',
              enableProfile:'scenarioAllKeys',
              setAppTarget:true,
              persist:true
            });
            if(global.OneToneUiFeedback&&global.OneToneUiFeedback.toast){
              global.OneToneUiFeedback.toast(t('habitCodexReset','已重置能力槽位 · 请重新录制快捷键'));
            }
            render();
          }
          return;
        }
        var codexApply=e.target.closest&&e.target.closest('[data-habit-codex-apply]');
        if(codexApply){
          e.preventDefault();
          var T=global.OneToneAgentScenarioTemplate;
          // Recommend entry: open existing if any, else create one new scenario.
          if(T&&T.applyCodexMicro13){
            T.applyCodexMicro13({mode:'openExisting',openPanel:'chooser',openKeys:false});
            cancelInlineCreate();
            render();
          }
          return;
        }
        var createCancel=e.target.closest&&e.target.closest('[data-habit-create-cancel]');
        if(createCancel){
          e.preventDefault();
          cancelInlineCreate();
          return;
        }
        var createFg=e.target.closest&&e.target.closest('[data-habit-create-fg]');
        if(createFg){
          e.preventDefault();
          acceptForegroundRecommend();
          return;
        }
        var openFgExisting=e.target.closest&&e.target.closest('[data-habit-open-fg-existing]');
        if(openFgExisting){
          e.preventDefault();
          openExistingFgScenario(openFgExisting.getAttribute('data-habit-open-fg-existing')||'');
          return;
        }
        var createAppBtn=e.target.closest&&e.target.closest('[data-habit-create-app]');
        if(createAppBtn){
          e.preventDefault();
          var migrateFrom=String(ui().habitHubMigrateFrom||'').trim();
          ui().habitHubMigrateFrom='';
          ui().habitHubFgIdentity=null;
          createAppScenario(createAppBtn.getAttribute('data-habit-create-app')||'',migrateFrom?{migrateFrom:migrateFrom}:{});
          return;
        }
        var createCustom=e.target.closest&&e.target.closest('[data-habit-create-custom]');
        if(createCustom){
          e.preventDefault();
          ui().habitHubFgIdentity=null;
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
          scheduleHubPaint();
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
        var actBtn=e.target.closest&&e.target.closest('.habit-hub-card-actions [data-habit-dup],.habit-hub-card-actions [data-habit-rename],.habit-hub-card-actions [data-habit-migrate],.habit-hub-card-actions [data-habit-scenario-keys],.habit-hub-card-actions [data-habit-scenario-voice],.habit-hub-card-actions [data-habit-scenario-camera],.habit-hub-card-actions [data-habit-scenario-softpad],.habit-hub-card-actions [data-habit-scenario-use],.habit-hub-card-actions [data-habit-enable]');
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
            var cfgEn=state().config||{};
            if(!enableM.enabled&&String(cfgEn.activeSceneId||'')===String(enableM.id)){
              var baseFall=globalBaselineMapping();
              var fallId=baseFall&&baseFall.id?String(baseFall.id):'';
              if(fallId&&global.OneToneSceneActivate&&global.OneToneSceneActivate.activateScene){
                global.OneToneSceneActivate.activateScene(fallId);
              }else{
                cfgEn.activeSceneId=fallId;
              }
            }
            touchUpdated(enableM);
            persistHub();
            render();
          }
          return;
        }
        var scenarioUseBtn=e.target.closest&&e.target.closest('[data-habit-scenario-use]');
        if(scenarioUseBtn){
          e.preventDefault();
          e.stopPropagation();
          var sceneUseId=String(scenarioUseBtn.getAttribute('data-habit-scenario-use')||'').trim();
          if(sceneUseId&&global.OneToneSceneActivate&&global.OneToneSceneActivate.activateScene){
            global.OneToneSceneActivate.activateScene(sceneUseId);
          }
          scheduleHubPaint();
          return;
        }
        var scenarioKeysBtn=e.target.closest&&e.target.closest('[data-habit-scenario-keys]');
        if(scenarioKeysBtn){
          e.preventDefault();
          e.stopPropagation();
          closeHubMenus();
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
          closeHubMenus();
          var voiceId=scenarioVoiceBtn.getAttribute('data-habit-scenario-voice')||'';
          if(voiceId&&global.OneToneHabitScenarioContextBanner){
            global.OneToneHabitScenarioContextBanner.openScenarioVoiceEdit(voiceId,{returnToHub:true});
          }
          return;
        }
        var scenarioCameraBtn=e.target.closest&&e.target.closest('[data-habit-scenario-camera]');
        if(scenarioCameraBtn){
          e.preventDefault();
          e.stopPropagation();
          closeHubMenus();
          var cameraId=scenarioCameraBtn.getAttribute('data-habit-scenario-camera')||'';
          if(cameraId&&global.OneToneHabitScenarioContextBanner){
            global.OneToneHabitScenarioContextBanner.openScenarioCameraEdit(cameraId,{returnToHub:true});
          }
          return;
        }
        var scenarioSoftPadBtn=e.target.closest&&e.target.closest('[data-habit-scenario-softpad]');
        if(scenarioSoftPadBtn){
          e.preventDefault();
          e.stopPropagation();
          closeHubMenus();
          openHabitSoftPadPanel(scenarioSoftPadBtn.getAttribute('data-habit-scenario-softpad')||'');
          return;
        }
        var voiceCmdChip=e.target.closest&&e.target.closest('[data-habit-voice-cmd]');
        if(voiceCmdChip){
          e.preventDefault();
          e.stopPropagation();
          var chipId=voiceCmdChip.getAttribute('data-habit-voice-cmd')||'';
          if(chipId&&global.OneToneHabitScenarioContextBanner){
            global.OneToneHabitScenarioContextBanner.openScenarioVoiceEdit(chipId,{returnToHub:true});
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
        if(channel){
          channel.classList.add('is-hover');
          if(channel.getAttribute('data-habit-channel')==='camera') kickCameraWaveRails();
        }
      });
      hub.addEventListener('mouseout',function(e){
        var channel=e.target.closest&&e.target.closest('[data-habit-channel]');
        if(channel&&(!e.relatedTarget||!channel.contains(e.relatedTarget))){
          channel.classList.remove('is-hover');
          if(channel.getAttribute('data-habit-channel')==='camera') kickCameraWaveRails();
        }
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
    countAppScenarios:countAppScenarios,
    uniqueScenarioName:uniqueScenarioName,
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
    applyShellVisibility:applyShellVisibility,
    renderMappingAppIcon:renderMappingAppIcon,
    cardView:renderCard,
    buildHabitHubListModel:buildHabitHubListModel,
    afterHabitHubListCommit:afterHabitHubListCommit,
    guideView:guideView,
    buildHabitHubChromeModel:buildHabitHubChromeModel,
    afterHabitHubChromeCommit:afterHabitHubChromeCommit,
    scheduleHubPaint:scheduleHubPaint
  };
})((typeof window!=='undefined')?window:globalThis);
