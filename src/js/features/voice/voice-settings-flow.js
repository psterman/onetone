(function(global){
  'use strict';
  var state=global.OneToneState.state;
  var $=function(id){ return global.OneToneDom.$(id); };
  var t=function(key){ return global.OneToneI18n.t(key); };

  function hooks(){ return global.__vp_voice_settings_flow_hooks__||{}; }

  var settingsRenderTimer=0;

  function canRenderVoiceSettings(){
    var ui=global.OneToneState&&global.OneToneState.ui;
    if(!ui||!ui.drawerOpen||ui.settingsPanel!=='voiceWake') return false;
    return !!hooks().configLoadedFromBackend();
  }

  function isVoiceWakeParked(){
    try{
      return !!(document.documentElement&&document.documentElement.classList.contains('ot-voice-wake-park'));
    }catch(_){
      return false;
    }
  }

  /** Wake hero + rail + header only — skips schemes/models remount that 假死'd 切换. */
  function renderVoiceSettingsFlowLight(loading){
    const uiState=global.OneToneState.ui;
    if(!uiState.drawerOpen||uiState.settingsPanel!=='voiceWake') return;
    if(global.OneToneVoicePageState&&global.OneToneVoicePageState.init){
      global.OneToneVoicePageState.init();
    }
    loading=!!loading||!hooks().configLoadedFromBackend();
    const vm=buildVoiceSettingsViewModel(loading);
    const header=global.OneToneVoicePageHeaderRender;
    if(header){
      header.renderLabels();
      header.renderHeaderSummary(vm);
      header.renderStepStatus(vm);
      header.renderModeMeta(vm);
      header.renderSaveAction(vm);
      header.renderAppScope(vm);
    }
    // Primary wake phrase lives here — park skip left it as "—".
    if(global.OneToneVoiceStepWake) global.OneToneVoiceStepWake.render(vm);
    if(global.OneToneVoiceStepSend) global.OneToneVoiceStepSend.render(vm);
    if(global.OneToneVoicePageNav) global.OneToneVoicePageNav.render(vm);
    if(global.OneToneVoiceFeedbackRail) global.OneToneVoiceFeedbackRail.render(vm);
    const micNameEl=$('voiceSettingsMicName');
    if(micNameEl) micNameEl.textContent=vm.wakeSourceLabel;
    const barsEl=$('voiceSettingsMicBars');
    if(barsEl&&!barsEl.children.length) barsEl.innerHTML=hooks().buildMicLevelBars();
    hooks().syncVoiceEndCommitKeyUi(vm.autoSendKey);
    hooks().syncVoiceEndDelayRanges(vm.autoSendDelayMs);
  }

  function scheduleVoiceSettingsRender(){
    clearTimeout(settingsRenderTimer);
    settingsRenderTimer=setTimeout(function(){
      // #region agent log
      var __flowT0=performance.now();
      // #endregion
      if(!canRenderVoiceSettings()) return;
      // Parked: light paint (wake phrase + rail). Full schemes/models remount was UI_HB_STALL.
      if(isVoiceWakeParked()) renderVoiceSettingsFlowLight(false);
      else renderVoiceSettingsFlow(false);
      // #region agent log
      try{ if(global.__dbgB5) global.__dbgB5('F','voice-settings-flow.js:scheduleTick','flow render done',{ms:Math.round(performance.now()-__flowT0),light:isVoiceWakeParked()?1:0}); }catch(_){}
      // #endregion
    },0);
  }

  function syncVoiceAsideLiveStatus(){
    if(!canRenderVoiceSettings()) return;
    var vm=buildVoiceSettingsViewModel(false);
    if(global.OneToneVoiceFeedbackRail&&global.OneToneVoiceFeedbackRail.syncLiveState){
      global.OneToneVoiceFeedbackRail.syncLiveState(vm);
    }
  }

  function setRecognizeNavState(targetId){
    if(global.OneToneVoiceStepRecognize&&global.OneToneVoiceStepRecognize.setRecognizeNavState){
      global.OneToneVoiceStepRecognize.setRecognizeNavState(targetId);
    }
  }

  function buildVoiceSettingsViewModel(loading){
    return global.OneToneVoiceSettingsViewModel
      ?global.OneToneVoiceSettingsViewModel.build(loading)
      :{loading:true};
  }

  function renderVoiceSettingsFlow(loading){
    const uiState=global.OneToneState.ui;
    if(!uiState.drawerOpen||uiState.settingsPanel!=='voiceWake') return;
    if(global.OneToneVoicePageState&&global.OneToneVoicePageState.init){
      global.OneToneVoicePageState.init();
    }
    loading=!!loading||!hooks().configLoadedFromBackend();
    const vm=buildVoiceSettingsViewModel(loading);
    const header=global.OneToneVoicePageHeaderRender;

    if(header){
      header.renderLabels();
      header.renderHeaderSummary(vm);
      header.renderStepStatus(vm);
      header.renderModeMeta(vm);
      header.renderSaveAction(vm);
      header.renderAppScope(vm);
    }
    if(global.OneToneVoiceSchemesUi) global.OneToneVoiceSchemesUi.render(vm);
    if(global.OneToneVoiceStepRecognize) global.OneToneVoiceStepRecognize.render(vm);
    if(global.OneToneVoiceStepWake) global.OneToneVoiceStepWake.render(vm);
    if(global.OneToneVoiceStepSend) global.OneToneVoiceStepSend.render(vm);

    const micNameEl=$('voiceSettingsMicName');
    const endPhraseHint=$('voiceSettingsEndPhraseHint');
    if(micNameEl) micNameEl.textContent=vm.wakeSourceLabel;
    const barsEl=$('voiceSettingsMicBars');
    if(barsEl&&!barsEl.children.length) barsEl.innerHTML=hooks().buildMicLevelBars();

    if(global.OneToneAppBehaviorRules&&global.OneToneAppBehaviorRules.renderVoiceAside){
      global.OneToneAppBehaviorRules.renderVoiceAside();
    }

    if(!vm.loading&&vm.mode!=='vosk'&&global.OneToneVoiceWake&&global.OneToneVoiceWake.syncSapiSensUi){
      const cfg=(state.config&&state.config.voiceSapi)||(state.config&&state.config.voice_sapi)||{};
      global.OneToneVoiceWake.syncSapiSensUi(cfg.minConfidence==null?0.35:cfg.minConfidence);
    }
    if(endPhraseHint) endPhraseHint.textContent='';

    hooks().syncVoiceEndCommitKeyUi(vm.autoSendKey);
    hooks().syncVoiceEndDelayRanges(vm.autoSendDelayMs);

    if(global.OneToneVoiceModelsPanel) global.OneToneVoiceModelsPanel.render();
    if(global.OneToneVoicePageNav) global.OneToneVoicePageNav.render(vm);
    if(global.OneToneVoiceFeedbackRail) global.OneToneVoiceFeedbackRail.render(vm);
    if(global.OneToneHabitScenarioContextBanner) global.OneToneHabitScenarioContextBanner.render();
  }

  if(global.OneToneVoicePageState&&global.OneToneVoicePageState.registerStepHook){
    global.OneToneVoicePageState.registerStepHook(function(){
      scheduleVoiceSettingsRender();
    });
  }

  global.OneToneVoiceSettingsFlow={
    render:renderVoiceSettingsFlow,
    renderLight:renderVoiceSettingsFlowLight,
    buildViewModel:buildVoiceSettingsViewModel,
    scheduleVoiceSettingsRender:scheduleVoiceSettingsRender,
    syncAsideLiveStatus:syncVoiceAsideLiveStatus,
    setRecognizeNavState:setRecognizeNavState
  };
})((typeof window!=='undefined')?window:globalThis);
