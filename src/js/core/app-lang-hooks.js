(function(global){
  'use strict';

  function register(deps){
    var D=global.OneToneDebugAbout;
    var K=global.OneToneKeyFinishFlowRender;
    global.__vp_app_lang_bootstrap_hooks__={
      applyTheme:deps.applyTheme,
      applyFontScale:deps.applyFontScale,
      setLangBootstrapPending:deps.setLangBootstrapPending
    };
    global.__vp_app_lang_core_hooks__={
      t:deps.t,
      ui:deps.ui,
      applyHomeLiveLang:deps.applyHomeLiveLang
    };
    global.__vp_app_lang_settings_hooks__={
      renderAboutPanel:D.renderAboutPanel,
      renderVoiceDiagTabs:deps.renderVoiceDiagTabs,
      renderVoiceDiagLog:deps.renderVoiceDiagLog
    };
    global.__vp_app_lang_mapping_prefs_hooks__={
      t:deps.t,
      ui:deps.ui,
      getAppLang:deps.getAppLang,
      selectedDisplayTriggerKey:deps.selectedDisplayTriggerKey,
      selectedDisplayTargetKey:deps.selectedDisplayTargetKey,
      syncKeyExecFinishCard:K.syncKeyExecFinishCard,
      syncVoiceEndModeUi:deps.syncVoiceEndModeUi,
      renderVoiceModeSwitch:deps.renderVoiceModeSwitch
    };
    global.__vp_app_lang_runtime_hooks__={
      t:deps.t,
      runtimePaused:deps.runtimePaused,
      applyTheme:deps.applyTheme,
      applyFontScale:deps.applyFontScale,
      mappingRecordMode:deps.mappingRecordMode,
      setRecording:deps.setRecording,
      render:deps.render,
      getAppLang:deps.getAppLang
    };
    global.__vp_app_lang_apply_hooks__={
      frontendLog:deps.frontendLog,
      dict:deps.dict,
      applyBootstrapLangTexts:deps.applyBootstrapLangTexts,
      applyCoreLangTexts:deps.applyCoreLangTexts,
      applySettingsLangTexts:deps.applySettingsLangTexts,
      applyMappingPrefsLangTexts:deps.applyMappingPrefsLangTexts,
      applyRuntimeLangTexts:deps.applyRuntimeLangTexts
    };
  }

  global.OneToneAppLangHooks={register:register};
})((typeof window!=='undefined')?window:globalThis);
