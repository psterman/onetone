(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom.$(id); };
  function hooks(){ return global.__vp_app_lang_settings_hooks__ || {}; }

  function applySettingsTexts(d){
    var settingsNavBasic=$('settingsNavBasicLabel'); if(settingsNavBasic) settingsNavBasic.textContent=d.settingsNavBasic;
    var settingsNavKeys=$('settingsNavKeysLabel'); if(settingsNavKeys) settingsNavKeys.textContent=d.settingsNavKeys;
    var settingsNavSoftPad=$('settingsNavSoftPadLabel'); if(settingsNavSoftPad) settingsNavSoftPad.textContent=d.settingsNavSoftPad||'虚拟键盘';
    var settingsNavScenes=$('settingsNavScenesLabel'); if(settingsNavScenes) settingsNavScenes.textContent=d.settingsNavScenes;
    var settingsNavHabits=$('settingsNavHabitsLabel'); if(settingsNavHabits) settingsNavHabits.textContent=d.settingsNavHabits;
    var settingsNavVoiceWake=$('settingsNavVoiceWakeLabel'); if(settingsNavVoiceWake) settingsNavVoiceWake.textContent=d.settingsNavVoiceWake;
    var settingsNavCamera=$('settingsNavCameraLabel'); if(settingsNavCamera) settingsNavCamera.textContent=d.settingsNavCamera||d.homeWbNavCamera||'摄像头';
    var settingsNavModels=$('settingsNavModelsLabel'); if(settingsNavModels) settingsNavModels.textContent=d.settingsNavModels||'识别资源';
    var settingsNavDebug=$('settingsNavDebugLabel'); if(settingsNavDebug) settingsNavDebug.textContent=d.settingsNavDebug;
    var spBasic=$('settingsPanelBasicDesc'); if(spBasic&&!(global.OneToneIslands&&typeof global.OneToneIslands.isMounted==='function'&&global.OneToneIslands.isMounted('settingsPanelBasic'))) spBasic.textContent=d.settingsPanelBasicDesc;
    var spKeys=$('settingsPanelKeysDesc'); if(spKeys) spKeys.textContent=d.settingsPanelKeysDesc;
    var spKeysTitle=$('settingsPanelKeysTitle'); if(spKeysTitle) spKeysTitle.textContent=d.settingsNavKeys;
    var spKeysBrand=$('keysPageBrandTitle'); if(spKeysBrand) spKeysBrand.textContent=d.keysPageBrandTitle||d.settingsNavKeys||'按键';
    var spSoftPad=$('settingsPanelSoftPadDesc'); if(spSoftPad) spSoftPad.textContent=d.settingsPanelSoftPadDesc||'';
    var spSoftPadTitle=$('settingsPanelSoftPadTitle'); if(spSoftPadTitle) spSoftPadTitle.textContent=d.settingsNavSoftPad||'虚拟键盘';
    var spSoftPadBrand=$('softPadPageBrandTitle'); if(spSoftPadBrand) spSoftPadBrand.textContent=d.softPadPageBrandTitle||d.settingsNavSoftPad||'虚拟键盘';
    var spHabits=$('settingsPanelHabitsDesc'); if(spHabits) spHabits.textContent=d.settingsPanelHabitsDesc;
    var spHabitsTitle=$('settingsPanelHabitsTitle'); if(spHabitsTitle) spHabitsTitle.textContent=d.settingsNavHabits;
    var spVoice=$('settingsPanelVoiceWakeDesc'); if(spVoice) spVoice.textContent=d.settingsPanelVoiceWakeDesc;
    var spVoiceTitle=$('settingsPanelVoiceWakeTitle'); if(spVoiceTitle) spVoiceTitle.textContent=d.settingsPanelVoiceWakeTitle;
    var spModels=$('settingsPanelModelsDesc'); if(spModels) spModels.textContent=d.settingsPanelModelsDesc||'管理本地语音识别、系统识别与后续云端能力。';
    var spModelsTitle=$('settingsPanelModelsTitle'); if(spModelsTitle) spModelsTitle.textContent=d.settingsNavModels||'识别资源';
    if(global.OneToneSceneModeHub){
      // Drawer closed: habit list paint is wasted work on the home load path.
      var ui=global.OneToneState&&global.OneToneState.ui;
      if(ui&&ui.drawerOpen) global.OneToneSceneModeHub.render();
    }
    var settingsVoiceCommonTitle=$('settingsVoiceCommonTitle'); if(settingsVoiceCommonTitle) settingsVoiceCommonTitle.textContent=d.settingsVoiceCommonTitle;
    var settingsVoiceAdvancedSummary=$('settingsVoiceAdvancedSummary'); if(settingsVoiceAdvancedSummary) settingsVoiceAdvancedSummary.textContent=d.settingsVoiceAdvancedSummary;
    var voiceSettingsEngineSub=$('voiceSettingsEngineSub'); if(voiceSettingsEngineSub) voiceSettingsEngineSub.textContent=d.settingsVoiceEngineSub;
    var quickKeyWakeSummary=$('quickKeyWakeSummary'); if(quickKeyWakeSummary) quickKeyWakeSummary.textContent=d.quickKeyWakeSummary;
    var quickKeyWakeHint=$('quickKeyWakeHint'); if(quickKeyWakeHint) quickKeyWakeHint.textContent=d.quickKeyWakeHint;
    var keyExecFinishTitle=$('keyExecFinishTitle'); if(keyExecFinishTitle) keyExecFinishTitle.textContent=d.keyExecFinishTitle;
    var keySchemeCardKicker=$('keySchemeCardKicker'); if(keySchemeCardKicker&&!(global.OneToneState.ui.drawerOpen&&global.OneToneSettingsDrawer&&global.OneToneSettingsDrawer.isHabitsPanel()&&global.OneToneState.state.selectedMappingId!==(global.OneToneState.state.config&&global.OneToneState.state.config.activeSceneId))) keySchemeCardKicker.textContent=d.keySchemeCardKicker;
    var sceneTabKeysLabel=$('sceneTabKeysLabel'); if(sceneTabKeysLabel) sceneTabKeysLabel.textContent=d.sceneTabKeys;
    var sceneTabVoiceLabel=$('sceneTabVoiceLabel'); if(sceneTabVoiceLabel) sceneTabVoiceLabel.textContent=d.sceneTabVoice;
    var sceneTabAdvancedLabel=$('sceneTabAdvancedLabel'); if(sceneTabAdvancedLabel) sceneTabAdvancedLabel.textContent=d.sceneTabAdvanced;
    if(global.OneToneSceneTabs) global.OneToneSceneTabs.render();
    if(global.OneToneSceneFlowSummary) global.OneToneSceneFlowSummary.renderLabels();
    var keySchemeStepTriggerTitle=$('keySchemeStepTriggerTitle'); if(keySchemeStepTriggerTitle) keySchemeStepTriggerTitle.textContent=d.keySchemeStepTriggerTitle;
    var keySchemeStepTargetTitle=$('keySchemeStepTargetTitle'); if(keySchemeStepTargetTitle) keySchemeStepTargetTitle.textContent=d.keySchemeStepTargetTitle;
    var keySchemeStepFinishTitle=$('keySchemeStepFinishTitle'); if(keySchemeStepFinishTitle) keySchemeStepFinishTitle.textContent=d.keyExecFinishTitle;
    var spSounds=$('settingsPanelSoundsDesc'); if(spSounds) spSounds.textContent=d.settingsPanelSoundsDesc;
    var spDbg=$('settingsPanelDebugDesc');
    if(spDbg){
      spDbg.textContent=d.settingsPanelDebugDesc||'';
      spDbg.hidden=!d.settingsPanelDebugDesc;
    }
    var settingsBackupTitle=$('settingsBackupTitle'); if(settingsBackupTitle) settingsBackupTitle.textContent=d.settingsBackupTitle;
    var settingsBackupDesc=$('settingsBackupDesc');
    if(settingsBackupDesc){
      settingsBackupDesc.textContent=d.settingsBackupDesc;
      if(d.settingsBackupPathTip) settingsBackupDesc.setAttribute('title',d.settingsBackupPathTip);
    }
    var debugDeveloperDesc=$('debugDeveloperDesc'); if(debugDeveloperDesc) debugDeveloperDesc.textContent=d.debugDeveloperDesc||'';
    var debugAdvancedRuntimeSummary=$('debugAdvancedRuntimeSummary');
    if(debugAdvancedRuntimeSummary) debugAdvancedRuntimeSummary.textContent=d.debugAdvancedRuntimeSummary||d.debugTitle;
    var btnDevClearLog=$('btnDevClearLog'); if(btnDevClearLog) btnDevClearLog.textContent=d.btnDevClearLog;
    var btnDevExportLog=$('btnDevExportLog'); if(btnDevExportLog) btnDevExportLog.textContent=d.btnDevExportLog;
    var aboutTitle=$('aboutTitle'); if(aboutTitle) aboutTitle.textContent=d.aboutTitle;
    var aboutDesc=$('aboutDesc'); if(aboutDesc) aboutDesc.textContent=d.aboutDesc;
    var aboutVersionLabel=$('aboutVersionLabel'); if(aboutVersionLabel) aboutVersionLabel.textContent=d.aboutVersionLabel;
    var btnAboutGitHub=$('btnAboutGitHub'); if(btnAboutGitHub) btnAboutGitHub.textContent=d.aboutGitHub;
    var btnAboutCheckUpdate=$('btnAboutCheckUpdate'); if(btnAboutCheckUpdate) btnAboutCheckUpdate.textContent=d.aboutCheckUpdate;
    hooks().renderAboutPanel();
    var keyWakeSettingsTitle=$('keyWakeSettingsTitle'); if(keyWakeSettingsTitle) keyWakeSettingsTitle.textContent=d.keyWakeSettingsTitle;
    var settingsNavSounds=$('settingsNavSoundsLabel'); if(settingsNavSounds) settingsNavSounds.textContent=d.settingsNavSounds;
    var voiceDiagnosticsTitle=$('voiceDiagnosticsTitle'); if(voiceDiagnosticsTitle) voiceDiagnosticsTitle.textContent=d.voiceDiagnosticsTitle;
    var voiceDiagnosticsDesc=$('voiceDiagnosticsDesc');
    if(voiceDiagnosticsDesc){
      voiceDiagnosticsDesc.textContent=d.voiceDiagnosticsDesc||'';
      voiceDiagnosticsDesc.hidden=!d.voiceDiagnosticsDesc;
    }
    var uiNow=global.OneToneState&&global.OneToneState.ui;
    var voiceDiagHot=!!(uiNow&&uiNow.drawerOpen&&uiNow.settingsPanel==='voiceWake');
    if(voiceDiagHot){
      hooks().renderVoiceDiagTabs();
      hooks().renderVoiceDiagLog('sapi');
      hooks().renderVoiceDiagLog('vosk');
      hooks().renderVoiceDiagLog('end');
      hooks().renderVoiceDiagLog('usage');
    }
  }

  global.OneToneAppLangSettings={applySettingsTexts:applySettingsTexts};
})((typeof window!=='undefined')?window:globalThis);
