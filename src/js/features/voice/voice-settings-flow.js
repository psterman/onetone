(function(global){
  'use strict';
  var state=global.OneToneState.state;
  var $=function(id){ return global.OneToneDom.$(id); };
  var t=function(key){ return global.OneToneI18n.t(key); };

  function hooks(){ return global.__vp_voice_settings_flow_hooks__||{}; }

  function syncVoiceAsideLiveStatus(){
    if(global.OneToneVoiceFeedbackRail&&global.OneToneVoiceFeedbackRail.syncLiveText){
      global.OneToneVoiceFeedbackRail.syncLiveText();
    }
    if(global.OneToneVoiceFeedbackRail&&global.OneToneVoiceFeedbackRail.render&&global.OneToneVoiceSettingsViewModel){
      global.OneToneVoiceFeedbackRail.render(global.OneToneVoiceSettingsViewModel.build(false));
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

    var voiceTargetEl=$('voiceSettingsTargetKey');
    if(voiceTargetEl){
      const cfg=(state.config&&state.config.voiceSapi)||(state.config&&state.config.voice_sapi)||{};
      const vosk=(state.config&&state.config.voiceVosk)||(state.config&&state.config.voice_vosk)||{};
      const key=String(cfg.targetKey||vosk.targetKey||'RAlt').trim()||'RAlt';
      voiceTargetEl.textContent=vm.loading?t('homeLiveLoading'):(global.OneToneKeyLabels?global.OneToneKeyLabels.friendlyKeyName(key,global.OneToneI18n.getLang()):key);
    }
    if(global.OneToneImePresets) global.OneToneImePresets.refresh('voice');
    if(global.OneToneVoiceModelsPanel) global.OneToneVoiceModelsPanel.render();
    if(global.OneToneVoicePageNav) global.OneToneVoicePageNav.render(vm);
    if(global.OneToneVoiceFeedbackRail) global.OneToneVoiceFeedbackRail.render(vm);
  }

  global.OneToneVoiceSettingsFlow={
    render:renderVoiceSettingsFlow,
    buildViewModel:buildVoiceSettingsViewModel,
    syncAsideLiveStatus:syncVoiceAsideLiveStatus,
    setRecognizeNavState:setRecognizeNavState
  };
})((typeof window!=='undefined')?window:globalThis);
