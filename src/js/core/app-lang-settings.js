(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom.$(id); };
  function hooks(){ return global.__vp_app_lang_settings_hooks__ || {}; }

  function applySettingsTexts(d){
    var settingsNavBasic=$('settingsNavBasicLabel'); if(settingsNavBasic) settingsNavBasic.textContent=d.settingsNavBasic;
    var settingsNavKeyWake=$('settingsNavKeyWakeLabel'); if(settingsNavKeyWake) settingsNavKeyWake.textContent=d.settingsNavKeyWake;
    var settingsNavVoiceWake=$('settingsNavVoiceWakeLabel'); if(settingsNavVoiceWake) settingsNavVoiceWake.textContent=d.settingsNavVoiceWake;
    var settingsNavDebug=$('settingsNavDebugLabel'); if(settingsNavDebug) settingsNavDebug.textContent=d.settingsNavDebug;
    var settingsNavGeneral=$('settingsNavGeneralLabel'); if(settingsNavGeneral) settingsNavGeneral.textContent=d.settingsNavGeneral;
    var spBasic=$('settingsPanelBasicDesc'); if(spBasic) spBasic.textContent=d.settingsPanelBasicDesc;
    var spKey=$('settingsPanelKeyWakeDesc'); if(spKey) spKey.textContent=d.settingsPanelKeyWakeDesc;
    var spVoice=$('settingsPanelVoiceWakeDesc'); if(spVoice) spVoice.textContent=d.settingsPanelVoiceWakeDesc;
    var quickKeyWakeSummary=$('quickKeyWakeSummary'); if(quickKeyWakeSummary) quickKeyWakeSummary.textContent=d.quickKeyWakeSummary;
    var quickKeyWakeHint=$('quickKeyWakeHint'); if(quickKeyWakeHint) quickKeyWakeHint.textContent=d.quickKeyWakeHint;
    var keyExecFinishTitle=$('keyExecFinishTitle'); if(keyExecFinishTitle) keyExecFinishTitle.textContent=d.keyExecFinishTitle;
    var keySchemeCardKicker=$('keySchemeCardKicker'); if(keySchemeCardKicker) keySchemeCardKicker.textContent=d.keySchemeCardKicker;
    var keySchemeStepTriggerTitle=$('keySchemeStepTriggerTitle'); if(keySchemeStepTriggerTitle) keySchemeStepTriggerTitle.textContent=d.keySchemeStepTriggerTitle;
    var keySchemeStepTargetTitle=$('keySchemeStepTargetTitle'); if(keySchemeStepTargetTitle) keySchemeStepTargetTitle.textContent=d.keySchemeStepTargetTitle;
    var keySchemeStepFinishTitle=$('keySchemeStepFinishTitle'); if(keySchemeStepFinishTitle) keySchemeStepFinishTitle.textContent=d.keyExecFinishTitle;
    var spSounds=$('settingsPanelSoundsDesc'); if(spSounds) spSounds.textContent=d.settingsPanelSoundsDesc;
    var spDbg=$('settingsPanelDebugDesc'); if(spDbg) spDbg.textContent=d.settingsPanelDebugDesc;
    var spGen=$('settingsPanelGeneralDesc'); if(spGen) spGen.textContent=d.settingsPanelGeneralDesc;
    var debugDeveloperDesc=$('debugDeveloperDesc'); if(debugDeveloperDesc) debugDeveloperDesc.textContent=d.debugDeveloperDesc;
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
    var voiceDiagnosticsDesc=$('voiceDiagnosticsDesc'); if(voiceDiagnosticsDesc) voiceDiagnosticsDesc.textContent=d.voiceDiagnosticsDesc;
    hooks().renderVoiceDiagTabs();
    hooks().renderVoiceDiagLog('sapi');
    hooks().renderVoiceDiagLog('vosk');
    hooks().renderVoiceDiagLog('end');
    hooks().renderVoiceDiagLog('usage');
  }

  global.OneToneAppLangSettings={applySettingsTexts:applySettingsTexts};
})((typeof window!=='undefined')?window:globalThis);
