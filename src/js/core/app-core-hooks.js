(function(global){
  'use strict';

  function register(deps){
    var ed=global.OneToneMappingEditorState;
    var tx=global.OneToneAppTextUtils;
    var dbg=global.OneToneAppDebugState;
    var conflict=global.OneToneMappingConflictState;
    var M=global.OneToneMappingEditActions;
    var C=global.OneToneMappingConfirmModal;
    global.__vp_app_global_error_hooks__={
      t:deps.t,
      vpInvoke:deps.vpInvoke,
      toast:deps.toast,
      renderDebugDeveloperPanel:deps.renderDebugDeveloperPanel,
      renderSettingsDebugSubnav:deps.renderSettingsDebugSubnav
    };
    global.__vp_config_persist_hooks__={
      newMappingId:deps.newMappingId,
      defaultSoundsConfig:deps.defaultSoundsConfig,
      ensureMappingExtras:deps.ensureMappingExtras,
      ensureSoundsConfig:deps.ensureSoundsConfig,
      soundSlotDefaults:deps.soundSlotDefaults,
      cloneStringList:tx.cloneStringList,
      flushAllEditorToMappings:deps.flushAllEditorToMappings,
      editorTriggerForMapping:deps.editorTriggerForMapping,
      editorTargetForMapping:deps.editorTargetForMapping,
      normalizeUpdateState:deps.normalizeUpdateState,
      defaultUpdateState:deps.defaultUpdateState,
      setConflictRows:conflict.setConflictRows,
      selectedMapping:deps.selectedMapping,
      getEditorTriggerKey:ed.getEditorTriggerKey,
      getEditorTargetKey:ed.getEditorTargetKey,
      localCaptureGuardUntil:ed.localCaptureGuardUntil,
      syncEditorFromSelection:deps.syncEditorFromSelection,
      scheduleBootMicReady:deps.scheduleBootMicReady,
      scheduleDeferredVoiceEngineBoot:deps.scheduleDeferredVoiceEngineBoot,
      syncVoiceSettingsFromConfig:deps.syncVoiceSettingsFromConfig,
      syncKeyWakeSettingsFromConfig:global.OneToneAppThemePrefs.syncKeyWakeSettingsFromConfig,
      ensureNotificationPermission:deps.ensureNotificationPermission,
      renderHome:deps.renderHome,
      renderHomeLiveZone:deps.renderHomeLiveZone,
      renderUpdateUi:deps.renderUpdateUi,
      welcomeOpen:deps.welcomeOpen,
      renderEditor:deps.renderEditor,
      renderListenRuntime:deps.renderListenRuntime,
      mappingListUiActive:deps.mappingListUiActive,
      renderMappingChrome:deps.renderMappingChrome,
      renderTrashList:deps.renderTrashList,
      renderVoiceSapiStatus:deps.renderVoiceSapiStatus,
      renderVoiceVoskStatus:deps.renderVoiceVoskStatus,
      startVoiceStatusPoll:deps.startVoiceStatusPoll
    };
    global.__vp_app_keyboard_hooks__={
      t:deps.t,
      closeTestModal:deps.closeTestModal,
      closeConfirmModal:C.close,
      onboardIsOpen:deps.onboardIsOpen,
      closeWelcome:deps.closeWelcome,
      welcomeOpen:deps.welcomeOpen,
      closeDrawer:deps.closeDrawer,
      friendlyKeyName:deps.friendlyKeyName,
      setLastKeyDebug:dbg.setLastKeyDebug,
      lastKeyDebug:dbg.lastKeyDebug,
      escHtml:tx.escHtml,
      pushLog:deps.pushLog
    };
  }

  global.OneToneAppCoreHooks={register:register};
})((typeof window!=='undefined')?window:globalThis);
