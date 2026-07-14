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
    var suggestions=$('voiceWakePhraseSuggestions');
    var poolLbl=$('voiceWakePresetPoolLbl');
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
    if(suggestions) suggestions.hidden=hideGlobal;
    if(poolLbl) poolLbl.hidden=hideGlobal;
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
    if(langToggle){
      const showLangToggle=vm.mode==='vosk';
      langToggle.hidden=!showLangToggle;
    }
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

  global.OneToneVoiceStepWake={
    render:function(vm){
      renderCompactWake(vm);
      renderCustomPhrases(vm);
    },
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
