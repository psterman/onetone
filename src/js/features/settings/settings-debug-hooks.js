(function(global){
  'use strict';

  function tx(){ return global.OneToneAppTextUtils; }
  function vs(){ return global.OneToneVoiceUiState; }
  function dbg(){ return global.OneToneAppDebugState; }
  function autostart(){ return global.OneToneAppAutostart; }

  function register(deps){
    var voiceUiState=global.OneToneVoiceUiState;
    global.__vp_settings_drawer_hooks__={
      closeHomeSchemeMenu:deps.closeHomeSchemeMenu,
      ensureFullLangApplied:deps.ensureFullLangApplied,
      focusSchemeEditStep:deps.focusSchemeEditStep,
      setVoiceWakeExpandedMode:deps.setVoiceWakeExpandedMode,
      currentVoiceMode:deps.currentVoiceMode,
      renderVoiceModeSwitch:deps.renderVoiceModeSwitch,
      voiceCaptureActive:deps.voiceCaptureActive,
      stopMicLevelPoll:deps.stopMicLevelPoll,
      stopMicMonitor:deps.stopMicMonitor,
      loadMicDevices:deps.loadMicDevices,
      startMicLevelPoll:deps.startMicLevelPoll,
      startProcessUsagePoll:deps.startProcessUsagePoll,
      refreshProcessUsage:deps.refreshProcessUsage,
      renderDebugPanel:deps.renderDebugPanel,
      scheduleDebugChromeRefresh:deps.scheduleDebugChromeRefresh,
      syncDebugFocusSections:deps.syncDebugFocusSections,
      renderKeyFinishFlowPanel:deps.renderKeyFinishFlowPanel,
      renderMappingChrome:deps.renderMappingChrome,
      renderEditor:deps.renderEditor,
      renderTrashList:deps.renderTrashList,
      renderSoundSettingsPanel:deps.renderSoundSettingsPanel,
      voiceUiSnapshot:voiceUiState.snapshot,
      renderVoiceSapiStatus:deps.renderVoiceSapiStatus,
      renderVoiceVoskStatus:deps.renderVoiceVoskStatus,
      renderSettingsSchemeSubnav:deps.renderSettingsSchemeSubnav,
      renderSettingsVoiceSubnav:deps.renderSettingsVoiceSubnav,
      renderSettingsDebugSubnav:deps.renderSettingsDebugSubnav,
      loadAutostartState:autostart().loadState,
      settingsPanelNeedsVoicePoll:deps.settingsPanelNeedsVoicePoll,
      voiceStatusPollTick:deps.voiceStatusPollTick,
      syncHomeMicMonitor:deps.syncHomeMicMonitor,
      micLevelUiVisible:deps.micLevelUiVisible
    };
    global.__vp_debug_panel_hooks__={
      escHtml:tx().escHtml,
      computeHomeState:deps.computeHomeState,
      selectedMapping:deps.selectedMapping,
      editorTriggerForMapping:deps.editorTriggerForMapping,
      editorTargetForMapping:deps.editorTargetForMapping,
      friendlyKeyName:deps.friendlyKeyName,
      friendlyPair:deps.friendlyPair,
      conflictsForMapping:deps.conflictsForMapping,
      formatTriggerTrace:deps.formatTriggerTrace,
      sessionActiveState:tx().sessionActiveState,
      voiceWakeStateLabel:deps.voiceWakeStateLabel,
      voiceEndStateLabel:deps.voiceEndStateLabel,
      processUsageSummaryLine:deps.processUsageSummaryLine,
      processUsageLine:deps.processUsageLine,
      processUsageSnapshot:deps.processUsageSnapshot,
      voiceUiSnapshot:vs().snapshot(),
      lastKeyDebug:dbg().lastKeyDebug,
      logLines:deps.logLines,
      recordingMode:deps.recordingMode
    };
    global.__vp_voice_diag_hooks__={
      escHtml:tx().escHtml,
      currentVoiceMode:deps.currentVoiceMode,
      voiceWakeStateLabel:deps.voiceWakeStateLabel,
      voiceEndStateLabel:deps.voiceEndStateLabel,
      processUsageModeLabel:deps.processUsageModeLabel,
      processUsageSummaryLine:deps.processUsageSummaryLine,
      processUsageStatusLabel:deps.processUsageStatusLabel,
      processUsageLine:deps.processUsageLine,
      processUsageUnavailableLine:deps.processUsageUnavailableLine,
      processUsageSnapshot:deps.processUsageSnapshot,
      voiceUiSnapshot:vs().snapshot(),
      sessionActiveState:tx().sessionActiveState,
      formatProcessMemory:deps.formatProcessMemory,
      formatProcessCpu:deps.formatProcessCpu,
      logLines:deps.logLines,
      voiceStatusPollTick:deps.voiceStatusPollTick,
      renderDebugOverview:deps.renderDebugOverview,
      renderDebugDeveloperPanel:deps.renderDebugDeveloperPanel
    };
    global.__vp_render_hooks__={
      mappingListUiActive:deps.mappingListUiActive,
      renderMappingChrome:deps.renderMappingChrome,
      renderTrashList:deps.renderTrashList,
      renderEditor:deps.renderEditor,
      renderRecordCancelBar:deps.renderRecordCancelBar,
      renderSoundSettingsPanel:deps.renderSoundSettingsPanel,
      renderDebugDeveloperPanel:deps.renderDebugDeveloperPanel,
      scheduleDebugChromeRefresh:deps.scheduleDebugChromeRefresh,
      renderKeyFinishFlowPanel:deps.renderKeyFinishFlowPanel,
      renderVoiceModeSwitch:deps.renderVoiceModeSwitch,
      renderHome:deps.renderHome,
      renderListenRuntime:deps.renderListenRuntime,
      renderUpdateUi:deps.renderUpdateUi,
      frontendLog:deps.frontendLog,
      applyKeyWakeRecordingUi:deps.applyKeyWakeRecordingUi
    };
  }

  global.OneToneSettingsDebugHooks={register:register};
})((typeof window!=='undefined')?window:globalThis);
