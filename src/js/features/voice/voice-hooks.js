(function(global){
  'use strict';

  function tx(){ return global.OneToneAppTextUtils; }
  function vs(){ return global.OneToneVoiceUiState; }
  function homeSync(){ return global.OneToneVoiceHomeSync; }
  function H(){ return global.OneToneHomeLiveActions; }

  function register(deps){
    var voiceUiState=global.OneToneVoiceUiState;
    global.__vp_voice_wake_hooks__={
      escHtml:tx().escHtml,
      cloneStringList:tx().cloneStringList,
      syncHomeFromVoiceSettings:homeSync().sync,
      renderVoiceSettingsFlow:deps.renderVoiceSettingsFlow,
      renderVoiceModeUsage:deps.renderVoiceModeUsage,
      renderHomeLiveZone:deps.renderHomeLiveZone,
      scheduleRenderHomeLiveZone:deps.scheduleRenderHomeLiveZone,
      renderHomeVoiceModeSwitchUi:deps.renderHomeVoiceModeSwitchUi,
      markVoiceEngineBootHandled:deps.markVoiceEngineBootHandled,
      stopMicMonitor:deps.stopMicMonitor,
      stopMicLevelPoll:deps.stopMicLevelPoll,
      startMicLevelPoll:deps.startMicLevelPoll,
      syncHomeMicMonitor:deps.syncHomeMicMonitor,
      micLevelUiVisible:deps.micLevelUiVisible,
      hasMicPollTimer:deps.hasMicPollTimer,
      loadMicDevices:deps.loadMicDevices,
      voiceCaptureActive:deps.voiceCaptureActive,
      welcomeOpen:deps.welcomeOpen,
      sessionActiveState:tx().sessionActiveState,
      scheduleVoiceUiRender:deps.scheduleVoiceUiRender,
      toast:deps.toast,
      voiceUiSnapshot:voiceUiState.snapshot(),
    };
    global.__vp_voice_settings_flow_hooks__={
      configLoadedFromBackend:deps.configLoadedFromBackend,
      homeVoiceEngineOn:deps.homeVoiceEngineOn,
      homeVoiceWakePhrase:deps.homeVoiceWakePhrase,
      voiceUiSnapshot:voiceUiState.snapshot,
      voiceEndUiUsesLiteMode:deps.voiceEndUiUsesLiteMode,
      micDevices:deps.micDevices,
      activeMicId:deps.activeMicId,
      buildMicLevelBars:deps.buildMicLevelBars,
      syncVoiceEndCommitKeyUi:deps.syncVoiceEndCommitKeyUi,
      syncVoiceEndDelayRanges:deps.syncVoiceEndDelayRanges
    };
    global.__vp_voice_end_hooks__={
      homeVoiceEngineOn:deps.homeVoiceEngineOn,
      homeVoiceEngineUiMode:deps.homeVoiceEngineUiMode,
      homePreferredVoiceEngine:H().homePreferredVoiceEngine,
      getVoiceWakeExpandedMode:deps.getVoiceWakeExpandedMode,
      cloneStringList:tx().cloneStringList,
      syncHomeFromVoiceSettings:homeSync().sync,
      loadVoiceVoskStatus:deps.loadVoiceVoskStatus,
      renderVoiceModeSwitch:deps.renderVoiceModeSwitch,
      renderVoiceSettingsFlow:deps.renderVoiceSettingsFlow,
      voiceStatusPollTick:deps.voiceStatusPollTick,
      voiceUiSnapshot:voiceUiState.snapshot(),
      toast:deps.toast,
      openSettings:deps.openSettings
    };
  }

  global.OneToneVoiceHooks={register:register};
})((typeof window!=='undefined')?window:globalThis);
