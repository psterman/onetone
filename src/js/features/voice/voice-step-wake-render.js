(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom.$(id); };
  var t=function(key){ return global.OneToneI18n.t(key); };

  function V(){ return global.OneToneVoiceSettingsViewModel; }

  function resolveWakePresetMode(vm){
    vm=vm||{};
    var wake=global.OneToneVoiceWake;
    if(wake&&wake.getExpandedMode){
      var expanded=wake.getExpandedMode();
      if(expanded==='vosk'||expanded==='sapi') return expanded;
    }
    var flowHooks=global.__vp_voice_settings_flow_hooks__||{};
    if(flowHooks.currentVoiceMode){
      var live=flowHooks.currentVoiceMode();
      if(live==='vosk'||live==='sapi') return live;
    }
    if(vm.mode==='vosk'||vm.mode==='sapi') return vm.mode;
    return (global.OneToneVoiceEngineReadiness&&global.OneToneVoiceEngineReadiness.isVoskOnlyUi())?'vosk':'sapi';
  }

  function resolveWakePresetLang(opts){
    opts=opts||{};
    if(opts.lang==='en'||opts.lang==='zh') return opts.lang;
    return global.__vp_voice_wake_lang__||'zh';
  }

  function syncWakePresetLangVisibility(opts){
    opts=opts||{};
    var lang=resolveWakePresetLang(opts);
    global.__vp_voice_wake_lang__=lang;
    var host=$('voiceSettingsWakeHost');
    var cn=$('voiceVoskPresetsCn');
    var en=$('voiceVoskPresetsEn');
    var cnLabel=$('voiceVoskPresetsCnLabel');
    var enLabel=$('voiceVoskPresetsEnLabel');
    var showEn=lang==='en';
    if(host) host.setAttribute('data-wake-lang',showEn?'en':'zh');
    if(cn){
      cn.hidden=showEn;
      cn.setAttribute('aria-hidden',showEn?'true':'false');
    }
    if(en){
      en.hidden=!showEn;
      en.setAttribute('aria-hidden',!showEn?'true':'false');
    }
    if(cnLabel) cnLabel.hidden=true;
    if(enLabel) enLabel.hidden=true;
    var langToggle=$('voiceWakeLangToggle');
    if(langToggle&&!langToggle.hidden){
      langToggle.querySelectorAll('.flow-lang-btn').forEach(function(b){
        b.classList.toggle('is-on',(b.getAttribute('data-lang')||'')===(showEn?'en':'zh'));
      });
    }
    if(global.OneToneVoiceWake&&global.OneToneVoiceWake.renderWakePhraseTags){
      global.OneToneVoiceWake.renderWakePhraseTags();
    }
  }

  function renderWakeHost(vm){
    vm=vm||{};
    const sapiPresets=$('voiceSapiPresets');
    const voskWrap=$('voiceSettingsVoskWakeWrap');
    const host=$('voiceSettingsWakeHost');
    if(isScenarioVoiceEdit()){
      if(host){
        host.hidden=true;
        host.setAttribute('aria-hidden','true');
      }
      if(sapiPresets) sapiPresets.hidden=true;
      if(voskWrap) voskWrap.hidden=true;
      return;
    }
    var hideLite=global.OneToneVoiceEngineReadiness&&global.OneToneVoiceEngineReadiness.isVoskOnlyUi();
    var mode=resolveWakePresetMode(vm);
    var showSapi=!hideLite&&mode==='sapi'&&!vm.loading;
    var showVosk=mode==='vosk'&&!vm.loading;
    if(host) host.setAttribute('data-wake-mode',showVosk?'vosk':(showSapi?'sapi':'off'));
    if(sapiPresets) sapiPresets.hidden=!showSapi;
    if(voskWrap) voskWrap.hidden=!showVosk;
    if(host){
      /* Catalog stays in DOM for phrase lookups; chips UI is the only visible manager. */
      host.hidden=true;
      host.setAttribute('aria-hidden','true');
    }
    if(showVosk) syncWakePresetLangVisibility({lang:global.__vp_voice_wake_lang__});
    if(global.OneToneVoiceWake&&global.OneToneVoiceWake.renderWakePhraseTags){
      global.OneToneVoiceWake.renderWakePhraseTags();
    }
  }

  function renderMicLine(vm){
    var micName=vm.wakeSourceLabel||t('homeVoiceMapMicEmpty');
    var micOk=!vm.loading&&!!vm.wakeSourceLabel&&vm.wakeSourceLabel!==t('homeVoiceMapMicEmpty');
    var stateText=vm.loading?t('homeLiveLoading'):(micOk?t('voiceMicStatusOk'):t('voiceTestChipMicWarn'));
    var legacyName=$('voiceSettingsMicName');
    if(legacyName) legacyName.textContent=micName;
    var liveName=$('voiceLiveMicName');
    var liveState=$('voiceLiveMicState');
    var liveDot=$('voiceLiveMicDot');
    if(liveName) liveName.textContent=micName;
    if(liveState) liveState.textContent=stateText;
    if(liveDot) liveDot.classList.toggle('is-warn',!vm.loading&&!micOk);
    const liveChangeBtn=$('btnVoiceLiveMicChange');
    if(liveChangeBtn) liveChangeBtn.textContent=t('voiceMicChangeBtn');
  }

  function scenarioVoiceMapping(){
    var uiState=global.OneToneState&&global.OneToneState.ui?global.OneToneState.ui:{};
    var id=String(uiState.habitScenarioReturnId||uiState.voiceEditSchemeId||'').trim();
    if(!id) return null;
    var c=global.OneToneMappingCore;
    if(!c||!c.byId) return null;
    var m=c.byId(id);
    if(!m) return null;
    var diff=global.OneToneHabitOverrideDiff;
    if(diff&&diff.isAppScenarioMapping&&!diff.isAppScenarioMapping(m)) return null;
    if(!String(m.appTargetId||'').trim()) return null;
    return m;
  }

  function isScenarioVoiceEdit(){
    return !!scenarioVoiceMapping();
  }

  function syncScenarioVoiceEditor(){
    var scenarioM=scenarioVoiceMapping();
    var stack=$('voiceSettingsWakeBody');
    var body=$('habitScenarioVoiceBody');
    var hero=$('voiceWakeHeroCard');
    var presets=$('voiceWakePresetsPanel');
    var custom=$('voiceWakeCustomBlock');
    var wakeHost=$('voiceSettingsWakeHost');
    if(stack) stack.classList.toggle('is-scenario-voice-edit',!!scenarioM);
    if(body){
      body.hidden=!scenarioM;
      var calibrating=global.OneToneHabitScenarioVoiceCommand
        &&global.OneToneHabitScenarioVoiceCommand.isCalibrating
        &&global.OneToneHabitScenarioVoiceCommand.isCalibrating();
      if(scenarioM&&global.OneToneHabitScenarioVoiceEditor){
        if(!calibrating){
          if(global.OneToneHabitScenarioVoiceEditor.bindEvents){
            global.OneToneHabitScenarioVoiceEditor.bindEvents({});
          }
          if(global.OneToneHabitScenarioVoiceEditor.sync){
            global.OneToneHabitScenarioVoiceEditor.sync(scenarioM);
          }else{
            global.OneToneHabitScenarioVoiceEditor.render(scenarioM);
          }
        }
      }else if(!scenarioM){
        body.innerHTML='';
      }
    }
    var hideGlobal=!!scenarioM;
    if(hero) hero.hidden=hideGlobal;
    if(presets) presets.hidden=hideGlobal;
    if(custom) custom.hidden=hideGlobal;
    if(wakeHost){
      wakeHost.hidden=hideGlobal;
      wakeHost.setAttribute('aria-hidden',hideGlobal?'true':'false');
    }
    var collapse=$('voiceWakePresetCollapse');
    if(collapse){ collapse.hidden=true; collapse.setAttribute('aria-hidden','true'); }
    var actionBar=$('voiceWakeActionBar');
    if(actionBar){ actionBar.hidden=true; actionBar.setAttribute('aria-hidden','true'); }
    var appTab=$('btnVoiceWakeKindApp');
    var appPane=$('voiceWakeKindAppPane');
    var summonBlock=$('voiceOutputSummonBlock');
    if(appTab){
      appTab.hidden=hideGlobal;
      appTab.setAttribute('aria-hidden',hideGlobal?'true':'false');
    }
    if(appPane){
      appPane.hidden=hideGlobal||(global.__vp_voice_wake_kind__||'text')!=='app';
      if(hideGlobal) appPane.setAttribute('aria-hidden','true');
    }
    if(summonBlock&&hideGlobal) summonBlock.hidden=true;
    if(hideGlobal&&(global.__vp_voice_wake_kind__||'')==='app'){
      global.__vp_voice_wake_kind__='text';
      if(global.OneToneVoiceStepSend&&global.OneToneVoiceStepSend.syncPhraseKindTabs){
        global.OneToneVoiceStepSend.syncPhraseKindTabs('voiceWakeKindTabs','text');
      }
    }
    if(global.OneToneHabitScenarioVoiceCommand){
      var cmdBusy=global.OneToneHabitScenarioVoiceCommand.isBusy
        ?global.OneToneHabitScenarioVoiceCommand.isBusy()
        :(global.OneToneHabitScenarioVoiceCommand.isCalibrating
          &&global.OneToneHabitScenarioVoiceCommand.isCalibrating());
      if(!cmdBusy){
        if(global.OneToneHabitScenarioVoiceCommand.bindEvents){
          global.OneToneHabitScenarioVoiceCommand.bindEvents({});
        }
        if(global.OneToneHabitScenarioVoiceCommand.render){
          global.OneToneHabitScenarioVoiceCommand.render();
        }
      }
    }
  }

  function renderCompactWake(vm){
    const zhEl=$('voiceWakeCompactZh');
    const enEl=$('voiceWakeCompactEn');
    if(vm.loading){
      if(zhEl) zhEl.textContent=t('homeLiveLoading');
      if(enEl) enEl.textContent='';
      renderMicLine(vm);
      renderWakeHost(vm);
      syncScenarioVoiceEditor();
      return;
    }
    var phrase=V().resolveDisplayWakePhrase(vm);
    var presetLang=phrase.lang||global.__vp_voice_wake_lang__||'zh';
    var showEn=presetLang==='en';
    var display=phrase.display||phrase.zh||phrase.en||'—';
    if(zhEl){
      zhEl.textContent=showEn?(phrase.en||display):(phrase.zh||display);
      zhEl.hidden=showEn;
    }
    if(enEl){
      enEl.textContent=phrase.en||display;
      enEl.hidden=!showEn;
    }
    const langToggle=$('voiceWakeLangToggle');
    if(langToggle) langToggle.hidden=true;
    syncWakePresetLangVisibility({lang:presetLang});
    renderMicLine(vm);
    renderWakeHost(vm);
    syncScenarioVoiceEditor();
  }

  function renderCustomPhrases(vm){
    if(isScenarioVoiceEdit()){
      syncScenarioVoiceEditor();
      return;
    }
    if(global.OneToneVoiceWake&&global.OneToneVoiceWake.renderWakeCustomPhrases){
      global.OneToneVoiceWake.renderWakeCustomPhrases();
    }
    const wakeBlock=$('voiceWakeCustomBlock');
    if(wakeBlock) wakeBlock.hidden=vm.loading||vm.mode==='off';
  }

  var openAppExpandedId=''; // appId currently showing inline acoustic host
  var openAppCapabilityCache={};

  function openAppHostId(appId){
    return 'openAppAcousticHost_'+String(appId||'').replace(/[^a-zA-Z0-9_-]/g,'_');
  }

  function capabilityLabel(cap){
    if(cap==='launchable') return t('voiceOpenAppCapLaunchable');
    if(cap==='focus_only') return t('voiceOpenAppCapFocusOnly');
    if(cap==='missing') return t('voiceOpenAppCapMissing');
    return '';
  }

  function ensureOpenAppCapability(appId){
    appId=String(appId||'').trim();
    if(!appId||openAppCapabilityCache[appId]) return;
    openAppCapabilityCache[appId]={ capability:'', loading:true };
    var api=global.OneToneVoiceAcousticIpc;
    if(!api||!api.appLaunchCapability){
      openAppCapabilityCache[appId]={ capability:'missing', loading:false };
      return;
    }
    api.appLaunchCapability(appId).then(function(res){
      openAppCapabilityCache[appId]={
        capability:String((res&&res.capability)||'missing'),
        loading:false
      };
      if(typeof renderOutputSummon==='function') renderOutputSummon();
    }).catch(function(){
      openAppCapabilityCache[appId]={ capability:'missing', loading:false };
    });
  }

  function acousticCountForMapping(m){
    if(!m) return 0;
    var list=Array.isArray(m.acousticVoiceCommands)?m.acousticVoiceCommands
      :(Array.isArray(m.acoustic_voice_commands)?m.acoustic_voice_commands:[]);
    var n=0;
    for(var i=0;i<list.length;i++){ if(list[i]) n++; }
    return n;
  }

  function acousticPaused(m){
    if(!m||!Array.isArray(m.acousticVoiceCommands)) return false;
    for(var i=0;i<m.acousticVoiceCommands.length;i++){
      var c=m.acousticVoiceCommands[i];
      if(c&&c.enabled===false) return true;
    }
    return false;
  }

  function summonPhraseForApp(mapping,appId){
    appId=String(appId||'').trim();
    if(!mapping||!appId) return '';
    var rules=Array.isArray(mapping.appBehaviorRules)?mapping.appBehaviorRules:[];
    for(var i=0;i<rules.length;i++){
      var r=rules[i];
      if(!r) continue;
      if(String(r.appId||r.ruleId||'')===appId){
        return String(r.summonPhrase||'').trim();
      }
    }
    return '';
  }

  function acousticDisplayNote(m){
    if(!m||!Array.isArray(m.acousticVoiceCommands)) return '';
    for(var i=0;i<m.acousticVoiceCommands.length;i++){
      var c=m.acousticVoiceCommands[i];
      if(!c) continue;
      var note=String(c.displayText||'').trim();
      if(note) return note;
    }
    return '';
  }

  /** App cards for 打开应用: app-scenario mappings first, then scope rules, then common presets. */
  function resolveOpenAppRows(scopeMapping){
    var rows=[];
    var seen={};
    var ab=global.OneToneAppBehaviorRules;
    var atp=global.OneToneAppTargetPresets;
    var hub=global.OneToneHabitHub;
    var diff=global.OneToneHabitOverrideDiff;
    var cfg=(global.OneToneState&&global.OneToneState.state&&global.OneToneState.state.config)||{};

    function pushApp(appId,opts){
      opts=opts||{};
      appId=String(appId||'').trim();
      if(!appId||appId==='custom'||seen[appId]) return;
      seen[appId]=true;
      var mapping=hub&&hub.findAppScenarioByAppId?hub.findAppScenarioByAppId(appId):null;
      var name=ab&&ab.appDisplayName?ab.appDisplayName(appId,null):appId;
      var icon='';
      if(atp&&atp.presetById){
        var p=atp.presetById(appId);
        icon=p&&p.icon?p.icon:'';
        if(p&&p.nameKey) name=t(p.nameKey)||name;
      }
      if(mapping){
        // Prefer real app title — mapping.group is often「通用设置」and confuses targeting.
        var phrase=summonPhraseForApp(mapping,appId)||summonPhraseForApp(scopeMapping,appId);
        ensureOpenAppCapability(appId);
        var cap=(openAppCapabilityCache[appId]&&openAppCapabilityCache[appId].capability)||'';
        rows.push({
          appId:appId,
          mappingId:mapping.id,
          name:name,
          icon:icon,
          initial:(name||appId).charAt(0),
          textPhrase:phrase,
          acousticCount:acousticCountForMapping(mapping),
          acousticPaused:acousticPaused(mapping),
          acousticNote:acousticDisplayNote(mapping),
          capability:cap,
          candidate:false
        });
        return;
      }
      ensureOpenAppCapability(appId);
      rows.push({
        appId:appId,
        mappingId:'',
        name:name,
        icon:icon,
        initial:(name||appId).charAt(0),
        textPhrase:summonPhraseForApp(scopeMapping,appId),
        acousticCount:0,
        acousticPaused:false,
        acousticNote:'',
        capability:(openAppCapabilityCache[appId]&&openAppCapabilityCache[appId].capability)||'',
        candidate:!!opts.candidate
      });
    }

    var list=Array.isArray(cfg.mappings)?cfg.mappings:[];
    list.forEach(function(m){
      if(!m) return;
      if(diff&&diff.isAppScenarioMapping&&!diff.isAppScenarioMapping(m)) return;
      var appId=String(m.appTargetId||'').trim();
      if(!appId||appId==='custom') return;
      pushApp(appId);
    });

    if(scopeMapping){
      var primary=String(scopeMapping.appTargetId||'').trim();
      if(primary) pushApp(primary);
      (Array.isArray(scopeMapping.appBehaviorRules)?scopeMapping.appBehaviorRules:[]).forEach(function(rule){
        if(!rule) return;
        pushApp(rule.appId||rule.ruleId||'');
      });
    }

    var presets=(atp&&atp.presets)||[];
    presets.forEach(function(p){
      if(!p||!p.id) return;
      if(seen[p.id]) return;
      pushApp(p.id,{ candidate:true });
    });

    return rows;
  }

  function renderOutputSummon(vm){
    const block=$('voiceOutputSummonBlock');
    const chipsEl=$('voiceOutputSummonChips');
    const hintEl=$('voiceOutputSummonHint');
    const emptyEl=$('voiceOutputSummonEmpty');
    const manageBtn=$('btnVoiceOutputSummonManage');
    const addBtn=$('btnVoiceOpenAppAdd');
    if(isScenarioVoiceEdit()){
      if(block) block.hidden=true;
      return;
    }
    if(!block||!chipsEl) return;
    block.hidden=!!vm.loading;
    var persist=global.OneToneVoiceSchemePersist;
    var scopeMapping=(vm&&vm.habitMapping)||(persist&&persist.resolveVoiceScopeMapping?persist.resolveVoiceScopeMapping():null);
    var rows=resolveOpenAppRows(scopeMapping);
    if(hintEl){
      hintEl.hidden=true;
      hintEl.textContent=t('voiceOutputSummonHint');
    }
    var titleEl=$('voiceOutputSummonLbl');
    if(titleEl) titleEl.textContent=t('voiceOutputSummonLbl');
    if(addBtn){
      addBtn.textContent=t('voiceOpenAppAdd');
      addBtn.hidden=false;
    }
    if(manageBtn){
      manageBtn.textContent=t('voiceOutputSummonManage');
      manageBtn.hidden=false;
    }
    if(!rows.length){
      if(emptyEl){
        emptyEl.hidden=false;
        emptyEl.textContent=t('voiceOutputSummonEmptyNoApp');
      }
      var calibratingEmpty=global.OneToneHabitScenarioVoiceCommand
        &&(global.OneToneHabitScenarioVoiceCommand.isBusy
          ?global.OneToneHabitScenarioVoiceCommand.isBusy()
          :(global.OneToneHabitScenarioVoiceCommand.isCalibrating
            &&global.OneToneHabitScenarioVoiceCommand.isCalibrating()));
      if(!(calibratingEmpty&&chipsEl.querySelector('[data-open-app-acoustic-host]:not([hidden])'))){
        chipsEl.innerHTML='';
        chipsEl.hidden=true;
      }
      return;
    }
    if(emptyEl){
      emptyEl.hidden=true;
      emptyEl.textContent='';
    }
    chipsEl.hidden=false;
    var calibrating=global.OneToneHabitScenarioVoiceCommand
      &&(global.OneToneHabitScenarioVoiceCommand.isBusy
        ?global.OneToneHabitScenarioVoiceCommand.isBusy()
        :(global.OneToneHabitScenarioVoiceCommand.isCalibrating
          &&global.OneToneHabitScenarioVoiceCommand.isCalibrating()));
    // Keep expanded inline acoustic host intact while session busy (levels/UI live there).
    if(calibrating&&chipsEl.querySelector('[data-open-app-acoustic-host]:not([hidden])')){
      return;
    }
    chipsEl.innerHTML=rows.map(function(row){
      var iconHtml=row.icon
        ?'<img class="voice-wake-app-icon" src="'+V().escHtml(row.icon)+'" alt="" decoding="async" />'
        :'<span class="voice-wake-app-icon voice-wake-app-icon--fallback" aria-hidden="true">'+V().escHtml(row.initial)+'</span>';
      var textLine=row.textPhrase
        ?V().escHtml(t('voiceOpenAppTextPhraseLbl'))+'：'+V().escHtml(row.textPhrase)
        :V().escHtml(t('voiceOpenAppTextPhraseNone'));
      var acousticLine;
      if(row.acousticPaused) acousticLine=t('voiceOpenAppAcousticPaused');
      else if(row.acousticCount>0) acousticLine=String(t('voiceOpenAppAcousticReady')||'').replace('{n}',String(row.acousticCount));
      else acousticLine=t('voiceOpenAppAcousticNone');
      var noteLine=row.acousticNote
        ?('<p class="voice-open-app-status-line voice-open-app-text-muted">'+V().escHtml(t('voiceOpenAppNoteLbl'))+'：'+V().escHtml(row.acousticNote)+'</p>')
        :'';
      var capText=capabilityLabel(row.capability);
      var capLine=capText
        ?('<p class="voice-open-app-status-line voice-open-app-text-muted">'+V().escHtml(capText)+'</p>')
        :'';
      var expanded=openAppExpandedId===row.appId;
      var hostId=openAppHostId(row.appId);
      var testing=global.OneToneVoiceOpenAppUi
        &&global.OneToneVoiceOpenAppUi.isTesting
        &&global.OneToneVoiceOpenAppUi.isTesting();
      var actions='';
      if(row.acousticCount>0){
        actions+='<button type="button" class="voice-mode-meta-link" data-open-app-acoustic-act="rerecord" data-app-id="'+V().escHtml(row.appId)+'">'+V().escHtml(t('voiceOpenAppRerecord'))+'</button>';
        actions+='<button type="button" class="voice-mode-meta-link" data-open-app-acoustic-act="play" data-app-id="'+V().escHtml(row.appId)+'" data-mapping-id="'+V().escHtml(row.mappingId||'')+'"'+(testing?' disabled aria-disabled="true"':'')+'>'+V().escHtml(t('voiceOpenAppReplay'))+'</button>';
        actions+='<button type="button" class="voice-mode-meta-link" data-open-app-acoustic-act="test" data-app-id="'+V().escHtml(row.appId)+'" data-mapping-id="'+V().escHtml(row.mappingId||'')+'"'+(testing?' disabled aria-disabled="true"':'')+'>'+V().escHtml(t('voiceOpenAppTest'))+'</button>';
      }else{
        actions+='<button type="button" class="voice-mode-meta-link" data-open-app-acoustic-act="record" data-app-id="'+V().escHtml(row.appId)+'">'+V().escHtml(t('voiceOpenAppRecord'))+'</button>';
      }
      return '<div class="voice-wake-app-row voice-open-app-card" data-app-id="'+V().escHtml(row.appId)+'" data-mapping-id="'+V().escHtml(row.mappingId||'')+'">'
        +'<div class="voice-wake-app-meta">'
        +'<div class="voice-wake-app-badge">'+iconHtml+'<span class="voice-wake-app-name">'+V().escHtml(row.name)+'</span></div>'
        +'</div>'
        +'<div class="voice-open-app-status">'
        +'<p class="voice-open-app-status-line voice-open-app-text-muted">'+textLine+'</p>'
        +'<p class="voice-open-app-status-line voice-open-app-acoustic-line">'+V().escHtml(acousticLine)+'</p>'
        +noteLine
        +capLine
        +'<div class="voice-open-app-card-actions">'+actions+'</div>'
        +'</div>'
        +'<div class="voice-open-app-acoustic-host habit-scenario-voice-command-host" id="'+V().escHtml(hostId)+'" data-open-app-acoustic-host="1"'+(expanded?'':' hidden')+'></div>'
        +'</div>';
    }).join('');
  }

  function setOpenAppExpanded(appId){
    openAppExpandedId=String(appId||'').trim();
  }

  function getOpenAppExpanded(){
    return openAppExpandedId;
  }

  function renderInputTarget(vm){
    var wrap=$('voiceWakeInputTarget');
    var lbl=$('voiceWakeInputTargetLbl');
    var val=$('voiceWakeInputTargetVal');
    if(lbl) lbl.textContent=t('voiceWakeInputTargetLbl');
    if(!val) return;
    if(wrap) wrap.hidden=isScenarioVoiceEdit();
    if(vm&&vm.loading){
      val.textContent=t('homeLiveLoading');
      return;
    }
    if(V().resolveShortcutChipLabel){
      val.textContent=V().resolveShortcutChipLabel(vm||{});
      return;
    }
    val.textContent=t('voiceWakeInputTargetUnset');
  }

  function syncWakePhraseKind(){
    var kind=global.__vp_voice_wake_kind__||'text';
    if(kind==='sound'){
      kind='text';
      global.__vp_voice_wake_kind__='text';
    }
    if(global.OneToneVoiceStepSend&&global.OneToneVoiceStepSend.syncPhraseKindTabs){
      global.OneToneVoiceStepSend.syncPhraseKindTabs('voiceWakeKindTabs',kind);
    }
  }

  function syncWakeInputCount(){
    var input=$('voiceWakeCustomInput');
    var count=$('voiceWakeCustomCount');
    if(!input||!count) return;
    var max=input.maxLength>0?input.maxLength:20;
    count.textContent=String((input.value||'').length)+'/'+max;
  }

  function renderHeroNarrative(vm){
    var badge=$('voiceWakePrimaryFastBadge');
    if(badge) badge.textContent=t('voiceWakePrimaryFastBadge');
    var ready=$('voiceWakeHeroReady');
    if(ready){
      if(vm.loading){
        ready.textContent=t('homeLiveLoading');
        ready.classList.remove('is-on','is-off');
      }else{
        ready.textContent=vm.voiceOn?t('voiceWakeHeroReadyOn'):t('voiceWakeHeroReadyOff');
        ready.classList.toggle('is-on',!!vm.voiceOn);
        ready.classList.toggle('is-off',!vm.voiceOn);
      }
    }
    var hint=$('voiceWakeDisplayHint');
    if(hint){
      if(vm.loading){
        hint.textContent=t('homeLiveLoading');
      }else{
        var phrase=V().resolveDisplayWakePhrase(vm);
        var display=phrase.display||phrase.zh||phrase.en||'—';
        var scope=V().resolveScopeSummary(vm)||'—';
        hint.textContent=String(t('voiceWakeHeroNarrative')||'')
          .replace('{scope}',scope)
          .replace('{phrase}',display);
      }
    }
    var sandboxOpen=$('btnVoiceSandboxOpen');
    if(sandboxOpen){
      sandboxOpen.textContent=t('voiceSandboxOpenBtn');
      sandboxOpen.hidden=isScenarioVoiceEdit();
    }
  }

  function renderWakePage(vm){
    renderCompactWake(vm);
    renderCustomPhrases(vm);
    renderOutputSummon(vm);
    renderInputTarget(vm);
    syncWakePhraseKind();
    syncWakeInputCount();
    renderHeroNarrative(vm);
    var title=$('voiceWakePageTitle');
    if(title) title.textContent=t('voiceWakePageTitle');
    var sub=$('voiceWakePageSub');
    if(sub) sub.textContent=t('voiceWakePageSub');
    var actionBar=$('voiceWakeActionBar');
    if(actionBar){ actionBar.hidden=true; actionBar.setAttribute('aria-hidden','true'); }
    var globalTitle=$('voiceEditSectionPresets');
    if(globalTitle) globalTitle.textContent=t('voiceWakeGlobalTitle');
    var heroTitle=$('voiceWakeHeroTitle');
    if(heroTitle) heroTitle.textContent=t('voiceWakePrimaryLbl');
    var activeLbl=$('voiceWakeActiveLbl');
    if(activeLbl) activeLbl.textContent=t('voiceWakeActiveLbl');
    var wakeAdd=$('btnVoiceWakeCustomAdd');
    if(wakeAdd) wakeAdd.textContent=t('voiceWakeAddBtn');
  }

  global.OneToneVoiceStepWake={
    syncWakeInputCount:syncWakeInputCount,
    render:renderWakePage,
    renderWakePage:renderWakePage,
    syncPresetPanels:function(vm){
      if(isScenarioVoiceEdit()){
        syncScenarioVoiceEditor();
        return;
      }
      renderWakeHost(vm||{loading:true});
    },
    syncPresetLang:syncWakePresetLangVisibility,
    resolveWakePresetMode:resolveWakePresetMode,
    syncScenarioVoiceEditor:syncScenarioVoiceEditor,
    isScenarioVoiceEdit:isScenarioVoiceEdit,
    setOpenAppExpanded:setOpenAppExpanded,
    getOpenAppExpanded:getOpenAppExpanded,
    openAppHostId:openAppHostId,
    renderOutputSummon:renderOutputSummon
  };
})((typeof window!=='undefined')?window:globalThis);
