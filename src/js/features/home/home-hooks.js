(function(global){
  'use strict';

  function tx(){ return global.OneToneAppTextUtils; }
  function vs(){ return global.OneToneVoiceUiState; }
  function H(){ return global.OneToneHomeLiveActions; }

  function register(deps){
    var selectedMapping=deps.activeSceneMapping||deps.selectedMapping;
    global.__vp_home_guide_hooks__={
      escHtml:tx().escHtml,
      closeHomeSchemeMenu:deps.closeHomeSchemeMenu
    };
    global.__vp_home_shell_hooks__={
      getHomeEntryMode:deps.getHomeEntryMode,
      isFirstSuccessDone:deps.isFirstSuccessDone,
      isHomeAdvancedUnlocked:deps.isHomeAdvancedUnlocked,
      isHomeFirstRunFocusMode:deps.isHomeFirstRunFocusMode
    };
    global.__vp_home_live_hooks__={
      configLoadedFromBackend:deps.configLoadedFromBackend,
      isHomeFirstRunFocusMode:deps.isHomeFirstRunFocusMode,
      sessionActiveState:tx().sessionActiveState,
      friendlyKeyName:deps.friendlyKeyName,
      selectedMapping:selectedMapping,
      editorTriggerForMapping:deps.editorTriggerForMapping,
      editorTargetForMapping:deps.editorTargetForMapping,
      voiceUiSnapshot:vs().snapshot(),
      escHtml:tx().escHtml,
      ensureConfig:deps.ensureConfig,
      getRecordingMode:deps.getRecordingMode,
      isSavedMapping:deps.isSavedMapping,
      isDraftMapping:deps.isDraftMapping,
      ensureMappingTiming:deps.ensureMappingTiming,
      ensureMappingExtras:deps.ensureMappingExtras,
      micDevices:deps.micDevices,
      activeMicId:deps.activeMicId,
      cloneStringList:tx().cloneStringList,
      homePreferredVoiceEngine:H().homePreferredVoiceEngine,
      syncHomeMicPickState:deps.syncHomeMicPickState,
      countConflictPairs:deps.countConflictPairs,
      loadMicDevices:deps.loadMicDevices,
      uiBootstrapping:deps.uiBootstrapping,
      renderHomeMicCurrent:deps.renderHomeMicCurrent,
      voiceCaptureActive:deps.voiceCaptureActive,
      bootMicReady:deps.bootMicReady,
      syncHomeMicMonitor:deps.syncHomeMicMonitor,
      voiceEngineBootDone:deps.voiceEngineBootDone,
      renderVoiceSettingsFlow:deps.renderVoiceSettingsFlow,
      syncGlobalMasterUi:deps.syncGlobalMasterUi,
      refreshHomeGuideIfOpen:deps.refreshHomeGuideIfOpen
    };
    global.__vp_home_scheme_hooks__={
      escHtml:tx().escHtml,
      friendlyKeyName:deps.friendlyKeyName,
      friendlyPair:deps.friendlyPair,
      ensureConfig:deps.ensureConfig,
      selectedMapping:selectedMapping,
      sortedMappings:deps.sortedMappings,
      isDraftMapping:deps.isDraftMapping,
      flushAllEditorToMappings:deps.flushAllEditorToMappings,
      syncEditorFromSelection:deps.syncEditorFromSelection,
      render:deps.render,
      mappingById:deps.mappingById,
      editorTriggerForMapping:deps.editorTriggerForMapping,
      editorTargetForMapping:deps.editorTargetForMapping,
      getRecordingMode:deps.getRecordingMode
    };
  }

  global.OneToneHomeHooks={register:register};
})((typeof window!=='undefined')?window:globalThis);
