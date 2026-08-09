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
      if(global.OneToneHabitScenarioVoiceCommand.bindEvents){
        global.OneToneHabitScenarioVoiceCommand.bindEvents({});
      }
      if(global.OneToneHabitScenarioVoiceCommand.render){
        global.OneToneHabitScenarioVoiceCommand.render();
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

  /** User-configured summon phrases only — never invent Cursor/Codex/… defaults for UI. */
  function resolveSummonAppRows(mapping){
    var m=mapping||null;
    var rows=[];
    var seen={};
    var ab=global.OneToneAppBehaviorRules;
    var atp=global.OneToneAppTargetPresets;
    function pushRow(appId,rule,phrases){
      appId=String(appId||'').trim();
      phrases=(phrases||[]).map(function(p){ return String(p||'').trim(); }).filter(Boolean);
      if(!appId||!phrases.length||seen[appId]) return;
      seen[appId]=true;
      var name=ab&&ab.appDisplayName?ab.appDisplayName(appId,rule):(rule&&rule.displayName)||appId;
      var icon='';
      if(atp&&atp.presetById){
        var p=atp.presetById(appId);
        icon=p&&p.icon?p.icon:'';
      }
      if(!icon&&rule&&rule.iconDataUrl) icon=rule.iconDataUrl;
      if(!icon&&ab&&ab.ruleIconDataUrl&&rule) icon=ab.ruleIconDataUrl(rule)||'';
      rows.push({
        appId:appId,
        name:name,
        icon:icon,
        phrases:phrases,
        initial:(name||appId).charAt(0)
      });
    }
    if(!m) return rows;
    (Array.isArray(m.appBehaviorRules)?m.appBehaviorRules:[]).forEach(function(rule){
      if(!rule) return;
      var custom=String(rule.summonPhrase||'').trim();
      if(!custom) return;
      pushRow(rule.appId||rule.ruleId||'custom',rule,[custom]);
    });
    return rows;
  }

  function renderOutputSummon(vm){
    const block=$('voiceOutputSummonBlock');
    const chipsEl=$('voiceOutputSummonChips');
    const hintEl=$('voiceOutputSummonHint');
    const emptyEl=$('voiceOutputSummonEmpty');
    const manageBtn=$('btnVoiceOutputSummonManage');
    if(isScenarioVoiceEdit()){
      if(block) block.hidden=true;
      return;
    }
    if(!block||!chipsEl) return;
    block.hidden=!!vm.loading;
    var persist=global.OneToneVoiceSchemePersist;
    var mapping=(vm&&vm.habitMapping)||(persist&&persist.resolveVoiceScopeMapping?persist.resolveVoiceScopeMapping():null);
    var rows=resolveSummonAppRows(mapping);
    var hasPrimary=!!(mapping&&String(mapping.appTargetId||'').trim());
    if(hintEl){
      hintEl.hidden=true;
      hintEl.textContent='';
    }
    if(!rows.length){
      if(emptyEl){
        emptyEl.hidden=false;
        emptyEl.textContent=t(hasPrimary?'voiceOutputSummonEmptyNoPhrases':'voiceOutputSummonEmptyNoApp');
      }
      chipsEl.innerHTML='';
      chipsEl.hidden=true;
      if(manageBtn) manageBtn.hidden=false;
      return;
    }
    if(emptyEl){
      emptyEl.hidden=true;
      emptyEl.textContent='';
    }
    chipsEl.hidden=false;
    chipsEl.innerHTML=rows.map(function(row){
      var iconHtml=row.icon
        ?'<img class="voice-wake-app-icon" src="'+V().escHtml(row.icon)+'" alt="" decoding="async" />'
        :'<span class="voice-wake-app-icon voice-wake-app-icon--fallback" aria-hidden="true">'+V().escHtml(row.initial)+'</span>';
      var phraseHtml=row.phrases.map(function(phrase){
        return '<span class="voice-output-summon-chip">'+V().escHtml(phrase)+'</span>';
      }).join('');
      return '<div class="voice-wake-app-row" data-app-id="'+V().escHtml(row.appId)+'">'
        +'<div class="voice-wake-app-meta">'
        +'<div class="voice-wake-app-badge">'+iconHtml+'<span class="voice-wake-app-name">'+V().escHtml(row.name)+'</span></div>'
        +'</div>'
        +'<div class="voice-wake-app-chips">'+phraseHtml+'</div>'
        +'</div>';
    }).join('');
    if(manageBtn) manageBtn.hidden=false;
  }

  function syncWakePhraseKind(){
    var kind=global.__vp_voice_wake_kind__||'text';
    if(global.OneToneVoiceStepSend&&global.OneToneVoiceStepSend.syncPhraseKindTabs){
      global.OneToneVoiceStepSend.syncPhraseKindTabs('voiceWakeKindTabs',kind);
    }
    if(kind==='sound'&&global.OneToneVoiceWakeAcoustic){
      if(global.OneToneVoiceWakeAcoustic.bindEvents) global.OneToneVoiceWakeAcoustic.bindEvents();
      if(global.OneToneVoiceWakeAcoustic.render) global.OneToneVoiceWakeAcoustic.render();
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
    isScenarioVoiceEdit:isScenarioVoiceEdit
  };
})((typeof window!=='undefined')?window:globalThis);
