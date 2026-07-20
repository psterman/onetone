(function(global){
  'use strict';

  function build(){
    const vpInvoke=window.OneToneIpc.invoke;
    const vpInvokeTimeout=window.OneToneIpc.invokeTimeout;
    const $=window.OneToneDom.$;
    const setText=window.OneToneDom.setText;
    function frontendLog(line){ window.OneToneDom.log(line); }
    function markBoot(label){ window.OneToneDom.markBoot(label); }
    const state=window.OneToneState.state;
    const ui=window.OneToneState.ui;
    const runtime=window.OneToneState.runtime;
    const I18N=window.OneToneI18n.I18N;
    function t(key){ return window.OneToneI18n.t(key); }
    function toast(msg, kind){ return window.OneToneAppToast.show(msg, kind); }
    function getAppLang(){ return window.OneToneI18n.getLang(); }
    function setAppLang(next){ window.OneToneI18n.setLang(next); }
    function defaultUpdateState(){ return OneToneUpdate.defaultState(); }
    function normalizeUpdateState(raw){ return OneToneUpdate.normalizeState(raw); }
    function setUpdateState(raw){ return OneToneUpdate.setState(raw); }
    function renderUpdateUi(){ return OneToneUpdate.renderUi(); }
    function defaultConfig(){ return OneToneConfigPersist.defaultConfig(); }
    function setTheme(next){ return OneToneAppThemePrefs.setTheme(next); }
    function applyTheme(){ return OneToneAppThemePrefs.applyTheme(); }
    function setFontScale(scale){ return OneToneAppThemePrefs.setFontScale(scale); }
    function applyFontScale(){ return OneToneAppThemePrefs.applyFontScale(); }
    function playSoundCue(cue,forcePreview){ return OneToneAppThemePrefs.playSoundCue(cue,forcePreview); }
    function previewSoundSlot(slotKey){ return OneToneAppThemePrefs.previewSoundSlot(slotKey); }
    function renderSoundSettingsPanel(){ return OneToneAppThemePrefs.renderSoundSettingsPanel(); }
    function setSoundSlotEnabled(slotKey,enabled){ return OneToneAppThemePrefs.setSoundSlotEnabled(slotKey,enabled); }
    function setSoundSlotId(slotKey,id){ return OneToneAppThemePrefs.setSoundSlotId(slotKey,id); }
    function setRecordingAudioMuteEnabled(enabled){ return OneToneAppThemePrefs.setRecordingAudioMuteEnabled(enabled); }
    function setRecordingAudioStrength(strength){ return OneToneAppThemePrefs.setRecordingAudioStrength(strength); }
    function syncRecordingAudioUi(){ return OneToneAppThemePrefs.syncRecordingAudioUi(); }
    function toggleSoundsMaster(){ return OneToneAppThemePrefs.toggleSoundsMaster(); }
    function ensureSoundsConfig(){ return OneToneAppThemePrefs.ensureSoundsConfig(); }
    function syncSoundsSettingsUi(){ return OneToneAppThemePrefs.syncSoundsSettingsUi(); }
    function normalizeRecordingMuteStrength(raw){ return OneToneAppThemePrefs.normalizeRecordingMuteStrength(raw); }
    function recordingMuteStrengthLabel(strength){ return OneToneAppThemePrefs.recordingMuteStrengthLabel(strength); }
    function recordingMuteStrengthOptions(){ return OneToneAppThemePrefs.recordingMuteStrengthOptions(); }
    function fontScaleValues(){ return OneToneAppThemePrefs.fontScaleValues(); }
    function buildMicLevelBars(count){ return OneToneAppMic.buildMicLevelBars(count); }
    function syncHomeMicPickState(loading){ return OneToneAppMic.syncHomeMicPickState(loading); }
    function updateMicLevelBars(deviceId,level){ return OneToneAppMic.updateMicLevelBars(deviceId,level); }
    function clearMicBackoff(){ return OneToneAppMic.clearMicBackoff(); }
    function voiceCaptureActive(){ return OneToneAppMic.voiceCaptureActive(); }
    function micLevelUiVisible(){ return OneToneAppMic.micLevelUiVisible(); }
    function syncHomeMicMonitor(){ return OneToneAppMic.syncHomeMicMonitor(); }
    function startMicLevelPoll(){ return OneToneAppMic.startMicLevelPoll(); }
    function stopMicLevelPoll(){ return OneToneAppMic.stopMicLevelPoll(); }
    function renderMicDevices(){ return OneToneAppMic.renderMicDevices(); }
    function renderHomeMicCurrent(){ return OneToneAppMic.renderHomeMicCurrent(); }
    function startMicMonitor(deviceId){ return OneToneAppMic.startMicMonitor(deviceId); }
    function stopMicMonitor(){ return OneToneAppMic.stopMicMonitor(); }
    function loadMicDevices(opts){ return OneToneAppMic.loadMicDevices(opts); }
    function handleMicMonitorError(msg){ return OneToneAppMic.handleMicMonitorError(msg); }
    function onboardEmit(event,payload){ return OneToneAppBridge.onboardEmit(event,payload); }
    function onboardIsOpen(){ return OneToneAppBridge.onboardIsOpen(); }
    function openWelcome(){ return OneToneAppBridge.openWelcome(); }
    function closeWelcome(markSeen){ return OneToneAppBridge.closeWelcome(markSeen); }
    function homeOneClickStart(){ return OneToneAppBridge.homeOneClickStart(); }
    function handleHomeCtaClick(){ return OneToneAppBridge.handleHomeCtaClick(); }
    function ensureFullLangApplied(){ return OneToneAppSession.ensureFullLangApplied(); }
    function markVoiceEngineBootHandled(){ return OneToneAppSession.markVoiceEngineBootHandled(); }
    function scheduleDeferredVoiceEngineBoot(){ return OneToneAppSession.scheduleDeferredVoiceEngineBoot(); }
    function scheduleBootMicReady(){ return OneToneAppSession.scheduleBootMicReady(); }
    function scheduleLangBootstrap(){ return OneToneAppSession.scheduleLangBootstrap(); }
    function maybeStartProcessUsagePoll(){ return OneToneAppSession.maybeStartProcessUsagePoll(); }
    function deferProcessUsagePoll(){ return OneToneAppSession.deferProcessUsagePoll(); }
    function scheduleVoiceUiRender(drawerPayload){ return OneToneVoiceRuntime.scheduleVoiceUiRender(drawerPayload); }
    function syncVoiceSettingsFromConfig(){ return OneToneVoiceRuntime.syncVoiceSettingsFromConfig(); }
    function formatProcessMemory(memoryMb){ return OneToneAppProcessUsage.formatProcessMemory(memoryMb); }
    function formatProcessCpu(cpuPercent){ return OneToneAppProcessUsage.formatProcessCpu(cpuPercent); }
    function processUsageLine(){ return OneToneAppProcessUsage.processUsageLine(); }
    function processUsageUnavailableLine(){ return OneToneAppProcessUsage.processUsageUnavailableLine(); }
    function processUsageSummaryLine(){ return OneToneAppProcessUsage.processUsageSummaryLine(); }
    function processUsageModeLabel(mode){ return OneToneAppProcessUsage.processUsageModeLabel(mode); }
    function processUsageStatusLabel(){ return OneToneAppProcessUsage.processUsageStatusLabel(); }
    function renderVoiceModeUsage(){ return OneToneAppProcessUsage.renderVoiceModeUsage(); }
    function refreshProcessUsage(){ return OneToneAppProcessUsage.refreshProcessUsage(); }
    function startProcessUsagePoll(){ return OneToneAppProcessUsage.startProcessUsagePoll(); }
    function applyHomeLiveLang(){ return OneToneAppHomeLang.applyHomeLiveLang(); }
    function applyBootstrapLangTexts(d){ return OneToneAppLangBootstrap.applyBootstrapTexts(d); }
    function applyCoreLangTexts(d){ return OneToneAppLangCore.applyCoreTexts(d); }
    function applySettingsLangTexts(d){ return OneToneAppLangSettings.applySettingsTexts(d); }
    function applyMappingPrefsLangTexts(d){ return OneToneAppLangMappingPrefs.applyMappingAndPrefsTexts(d); }
    function applyRuntimeLangTexts(d,skipRender){ return OneToneAppLangRuntime.applyRuntimeTexts(d,skipRender); }
    function applyLangFlow(skipRender,opts){ return OneToneAppLangApply.apply(skipRender,opts); }
    function rawEventForHotkey(hotkey,label){ return OneToneAppKeyUtils.rawEventForHotkey(hotkey,label); }
    function buildPeripheralTriggerSource(physical){ return OneToneAppKeyUtils.buildPeripheralTriggerSource(physical); }
    function normalizeTriggerKey(key){ return OneToneAppKeyUtils.normalizeTriggerKey(key); }
    function normalizeMediaTargetKey(code,key){ return OneToneAppKeyUtils.normalizeMediaTargetKey(code,key); }
    function armTriggerLeftClickIgnore(ms){ return OneToneAppKeyUtils.armTriggerLeftClickIgnore(ms); }
    function armTargetLeftClickIgnore(ms){ return OneToneAppKeyUtils.armTargetLeftClickIgnore(ms); }
    function shouldIgnoreTriggerLeftClickCapture(key,sourceKey,source){ return OneToneAppKeyUtils.shouldIgnoreTriggerLeftClickCapture(key,sourceKey,source); }
    function shouldIgnoreTargetLeftClickCapture(key,sourceKey,source){ return OneToneAppKeyUtils.shouldIgnoreTargetLeftClickCapture(key,sourceKey,source); }
    function isAllowedTargetKey(key){ return OneToneAppKeyUtils.isAllowedTargetKey(key); }
    function containsLeftMouseToken(key){ return OneToneAppKeyUtils.containsLeftMouseToken(key); }
    
    function renderKeyFinishFlowPanel(){ return OneToneKeyFinishFlowRender.renderKeyFinishFlowPanel(); }
    function focusSchemeEditStep(step){ return OneToneKeyFinishFlowRender.focusSchemeEditStep(step); }
    function syncKeySchemeTimeline(focusStep){ return OneToneKeyFinishFlowRender.syncKeySchemeTimeline(focusStep); }
    function renderKeySchemeCardHeader(){ return OneToneKeyFinishFlowRender.renderKeySchemeCardHeader(); }
    function handleKeyFinishFlowInput(e){ return OneToneKeyFinishFlowRender.handleKeyFinishFlowInput(e); }
    function handleKeyFinishFlowClick(e){ return OneToneKeyFinishFlowRender.handleKeyFinishFlowClick(e); }
    function formatTimingSec(ms){ return OneToneKeyFinishFlowRender.formatTimingSec(ms); }
    function syncAllTimingRanges(root){ return OneToneKeyFinishFlowRender.syncAllTimingRanges(root); }
    function liveUpdateTimingRange(range){ return OneToneKeyFinishFlowRender.liveUpdateTimingRange(range); }
    function schemeStepFocus(){ return OneToneKeyFinishFlowRender.schemeStepFocus(); }
    
    function ensureConfig(){ return OneToneConfigPersist.ensureConfig(); }
    function buildSavePayload(){ return OneToneConfigPersist.buildSavePayload(); }
    function save(){ return OneToneConfigPersist.save(); }
    function saveAsync(){ return OneToneConfigPersist.saveAsync(); }
    function applyMvpInit(msg){ return OneToneConfigPersist.applyMvpInit(msg); }
    function requestBackendConfig(retry){ return OneToneConfigPersist.requestBackendConfig(retry); }
    function fallbackConfigLoaded(){ return OneToneConfigPersist.fallbackConfigLoaded(); }
    function handleUpdateCheckResult(result,manual){ return OneToneUpdate.handleCheckResult(result,manual); }
    function checkForAppUpdate(manual){ return OneToneUpdate.check(manual); }
    function installAppUpdate(){ return OneToneUpdate.install(); }
    function dismissAppUpdate(){ return OneToneUpdate.dismiss(); }
    function syncDebugFocusSections(){ return OneToneVoiceDiag.syncFocusSections(); }
    function setDebugFocusMode(mode){ return OneToneVoiceDiag.setFocusMode(mode); }
    function renderSettingsDebugSubnav(){ return OneToneVoiceDiag.renderSubnav(); }
    function setVoiceDiagTab(tab){ return OneToneVoiceDiag.setTab(tab); }
    function renderVoiceDiagMetrics(kind){ return OneToneVoiceDiag.renderMetrics(kind); }
    function renderVoiceDiagTabs(){ return OneToneVoiceDiag.renderTabs(); }
    function scheduleDebugChromeRefresh(){ return OneToneVoiceDiag.scheduleChromeRefresh(); }
    function renderVoiceDiagLog(kind){ return OneToneVoiceDiag.renderLog(kind); }
    function pushVoiceDiagLog(kind,label,text,sig){ return OneToneVoiceDiag.pushLog(kind,label,text,sig); }
    function forceVoiceDiagLog(kind,label,text){ return OneToneVoiceDiag.forceLog(kind,label,text); }
    function updateVoiceDiagMetric(kind,name,value,label){ return OneToneVoiceDiag.updateMetric(kind,name,value,label); }
    function voiceEndStateLabel(raw){ return OneToneVoiceEnd.stateLabel(raw); }
    function voiceEndUiUsesLiteMode(){ return OneToneVoiceEnd.uiUsesLiteMode(); }
    function syncVoiceEndModeUi(){ return OneToneVoiceEnd.syncModeUi(); }
    function syncVoiceEndConfigFromStatus(res){ return OneToneVoiceEnd.syncConfigFromStatus(res); }
    function normalizeVoiceEndCommitKey(raw){ return OneToneVoiceEnd.normalizeCommitKey(raw); }
    function syncVoiceEndCommitKeyUi(commitKey){ return OneToneVoiceEnd.syncCommitKeyUi(commitKey); }
    function syncVoiceEndDelayRanges(ms,skipEl){ return OneToneVoiceEnd.syncDelayRanges(ms,skipEl); }
    function setVoiceEndCommitKey(commitKey){ return OneToneVoiceEnd.setCommitKey(commitKey); }
    function voiceEndEnabledInConfig(){ return OneToneVoiceEnd.enabledInConfig(); }
    function renderVoiceEndStatus(res){ return OneToneVoiceEnd.renderStatus(res); }
    function loadVoiceEndStatus(){ return OneToneVoiceEnd.loadStatus(); }
    function syncVoiceEndToggle(enabled){ return OneToneVoiceEnd.syncToggle(enabled); }
    function syncVoiceEndAutoSendToggle(enabled){ return OneToneVoiceEnd.syncAutoSendToggle(enabled); }
    function toggleVoiceEnd(){ return OneToneVoiceEnd.toggle(); }
    function toggleVoiceEndAutoSend(){ return OneToneVoiceEnd.toggleAutoSend(); }
    function onVoiceEndDelayInput(){ return OneToneVoiceEnd.onDelayInput(); }
    function onVoiceEndDelayChange(){ return OneToneVoiceEnd.onDelayChange(); }
    function addVoiceEndPreset(ev){ return OneToneVoiceEnd.addPreset(ev); }
    function syncVoiceEndPresets(zh,en){ return OneToneVoiceEnd.syncPresets(zh,en); }
    function testVoiceEndStop(){ return OneToneVoiceEnd.testStop(); }
    function testVoiceEndCommit(){ return OneToneVoiceEnd.testCommit(); }
    
    function voiceWakeStateLabel(raw){ return OneToneVoiceWake.stateLabel(raw); }
    function voiceWakeNoticeIsTriggered(res,notice){ return OneToneVoiceWake.noticeIsTriggered(res,notice); }
    function voiceWakeNoticeLabel(res,notice){ return OneToneVoiceWake.noticeLabel(res,notice); }
    function voiceNavStatusLine(mode){ return OneToneVoiceWake.navStatusLine(mode); }
    function renderVoiceMicLive(){ return OneToneVoiceWake.renderMicLive(); }
    function renderSettingsVoiceSubnav(){
      if(global.OneToneSceneModeHub&&global.OneToneSceneModeHub.renderVoiceSubnav) return global.OneToneSceneModeHub.renderVoiceSubnav();
      return OneToneVoiceWake.renderSubnav();
    }
    function syncVoiceSapiConfigFromStatus(res){ return OneToneVoiceWake.syncSapiConfigFromStatus(res); }
    function syncVoiceVoskConfigFromStatus(res){ return OneToneVoiceWake.syncVoskConfigFromStatus(res); }
    function currentVoiceMode(){ return OneToneVoiceWake.currentMode(); }
    function setVoiceWakeExpandedMode(mode){ return OneToneVoiceWake.setExpandedMode(mode); }
    function renderVoiceModeSwitch(){ return OneToneVoiceWake.renderModeSwitch(); }
    function switchVoiceMode(mode,opts){ return OneToneVoiceWake.switchMode(mode,opts); }
    function voiceWakeEnabledInConfig(){ return OneToneVoiceWake.enabledInConfig(); }
    function voiceStatusPollTick(){ return OneToneVoiceWake.pollTick(); }
    function startVoiceStatusPoll(){ return OneToneVoiceWake.startPoll(); }
    function voiceWakeLiveFingerprint(res){ return OneToneVoiceWake.liveFingerprint(res); }
    function refreshDrawerMicAfterVoiceToggle(){ return OneToneVoiceWake.refreshDrawerMic(); }
    function syncVoiceSapiToggle(enabled){ return OneToneVoiceWake.syncSapiToggle(enabled); }
    function renderVoiceSapiStatus(res,opts){ return OneToneVoiceWake.renderSapiStatus(res,opts); }
    function loadVoiceSapiStatus(){ return OneToneVoiceWake.loadSapiStatus(); }
    function voiceSapiEnabledNow(){ return OneToneVoiceWake.sapiEnabledNow(); }
    function voiceVoskEnabledNow(){ return OneToneVoiceWake.voskEnabledNow(); }
    function openVoiceSapiSetup(){ return OneToneVoiceWake.openSapiSetup(); }
    function handleVoiceSapiEnableResult(res,next){ return OneToneVoiceWake.handleSapiEnableResult(res,next); }
    function scheduleVoiceToggleRefresh(){ return OneToneVoiceWake.scheduleToggleRefresh(); }
    function toggleVoiceSapi(explicitNext){ return OneToneVoiceWake.toggleSapi(explicitNext); }
    function testVoiceSapiSend(){ return OneToneVoiceWake.testSapiSend(); }
    function addVoiceSapiPreset(ev){ return OneToneVoiceWake.addSapiPreset(ev); }
    function syncVoiceSapiPresets(phrases){ return OneToneVoiceWake.syncSapiPresets(phrases); }
    function updateVoiceSapiConfidence(saveNow){ return OneToneVoiceWake.updateSapiConfidence(saveNow); }
    function applyVoiceSapiSensLevel(index){ return OneToneVoiceWake.applySapiSensLevel(index); }
    function renderVoiceVoskStatus(res,opts){ return OneToneVoiceWake.renderVoskStatus(res,opts); }
    function renderVoiceKwsStatus(res,opts){ return OneToneVoiceWake.renderKwsStatus(res,opts); }
    function loadVoiceVoskStatus(){ return OneToneVoiceWake.loadVoskStatus(); }
    function syncVoiceVoskToggle(enabled){ return OneToneVoiceWake.syncVoskToggle(enabled); }
    function toggleVoiceVosk(explicitNext){ return OneToneVoiceWake.toggleVosk(explicitNext); }
    function testVoiceVoskSend(){ return OneToneVoiceWake.testVoskSend(); }
    function setVoiceKwsEnabled(enabled){ return OneToneVoiceWake.setKwsEnabled(enabled); }
    function testVoiceKwsSend(){ return OneToneVoiceWake.testKwsSend(); }
    function testVoiceKwsDetect(phrase){ return OneToneVoiceWake.testKwsDetect(phrase); }
    function openVoskResourcesDir(){ return OneToneVoiceWake.openVoskResourcesDir(); }
    function downloadVoskModelGuide(){ return OneToneVoiceWake.downloadVoskModelGuide(); }
    function downloadVoskModel(){ return OneToneVoiceWake.downloadVoskModel(); }
    function retryVoskStart(){ return OneToneVoiceWake.retryVoskStart(); }
    function addVoiceVoskPreset(ev){ return OneToneVoiceWake.addVoskPreset(ev); }
    function syncVoiceVoskPresets(phrases){ return OneToneVoiceWake.syncVoskPresets(phrases); }
    function changeVoiceVoskModelPreset(preset){ return OneToneVoiceWake.changeVoskModelPreset(preset); }
    function settingsPanelNeedsVoicePoll(){ return OneToneVoiceWake.settingsPanelNeedsPoll(); }
    
    function mappingListUiActive(){ return OneToneMappingCore.listUiActive(); }
    function renderMappingChrome(){ return OneToneMappingCore.renderChrome(); }
    function schemeMappingHasConflict(m){ return OneToneMappingCore.schemeHasConflict(m); }
    function schemeNavTags(m){ return OneToneMappingCore.schemeNavTags(m); }
    function renderSettingsSchemeSubnav(){ return OneToneMappingCore.renderSchemeSubnav(); }
    function friendlyPair(triggerKey,targetKey,m){ return OneToneMappingCore.friendlyPair(triggerKey,targetKey,m); }
    function isSavedMapping(m){ return OneToneMappingCore.isSaved(m); }
    function isDraftMapping(m){ return OneToneMappingCore.isDraft(m); }
    function hasDraftMappings(){ return OneToneMappingCore.hasDrafts(); }
    function isDraftPristine(m){ return OneToneMappingCore.isDraftPristine(m); }
    function removeDraftMapping(id){ return OneToneMappingCore.removeDraft(id); }
    function abandonDraftIfPristine(id){ return OneToneMappingCore.abandonDraftIfPristine(id); }
    function mappingById(id){ return OneToneMappingCore.byId(id); }
    function isSelectedMapping(id){ return OneToneMappingCore.isSelected(id); }
    function editorTriggerForMapping(m){ return OneToneMappingCore.editorTrigger(m); }
    function editorTargetForMapping(m){ return OneToneMappingCore.editorTarget(m); }
    function flushEditorToMapping(m){ return OneToneMappingCore.flushEditor(m); }
    function flushAllEditorToMappings(){ return OneToneMappingCore.flushAllEditor(); }
    function recordingMapping(){ return OneToneMappingCore.recording(); }
    function maybeEnableMappingAfterComplete(m){ return OneToneMappingCore.maybeEnableAfterComplete(m); }
    function mappingTargetKey(id){ return OneToneMappingCore.targetKey(id); }
    function conflictsForMapping(id){ return OneToneMappingCore.conflictsFor(id); }
    function otherIdInConflict(c,selfId){ return OneToneMappingCore.otherConflictId(c,selfId); }
    function conflictHintForRow(c,selfId){ return OneToneMappingCore.conflictHint(c,selfId); }
    function focusMapping(id){ return OneToneMappingCore.focus(id); }
    function toggleMappingAdv(id){ return OneToneMappingCore.toggleAdv(id); }
    function countConflictPairs(){ return OneToneMappingCore.countConflictPairs(); }
    function renderConflictBanner(){ return OneToneMappingCore.renderConflictBanner(); }
    function formatTriggerTrace(m){ return OneToneMappingCore.formatTriggerTrace(m); }
    function selectedMapping(){ return OneToneMappingCore.selected(); }
    function activeSceneMapping(){ return OneToneMappingCore.activeScene(); }
    function sortedMappings(){ return OneToneMappingCore.sorted(); }
    function renderMappingList(){ return OneToneMappingList.renderList(); }
    function renderEditor(){ return OneToneMappingList.renderEditor(); }
    function isCurrentDraftComplete(){ return OneToneMappingEditorChrome.isCurrentDraftComplete(); }
    function renderAddButton(){ return OneToneMappingEditorChrome.renderAddButton(); }
    function renderDraftHint(){ return OneToneMappingEditorChrome.renderDraftHint(); }
    function updatePrimaryCTA(){ return OneToneMappingEditorChrome.updatePrimaryCTA(); }
    function cancelRecording(){ return OneToneMappingRecording.cancel(); }
    function cancelDraftOrRecording(){ return OneToneMappingRecording.cancelDraftOrRecording(); }
    function setRecording(mode,opts){ return OneToneMappingRecording.setRecording(mode,opts); }
    function startTriggerRecord(){ return OneToneMappingRecording.startTrigger(); }
    function startTargetRecord(){ return OneToneMappingRecording.startTarget(); }
    function renderRecordCancelBar(){ return OneToneMappingRecording.renderCancelBar(); }
    function applyKeyWakeRecordingUi(){ return OneToneMappingRecording.applyRecordingUi(); }
    function updateRecordingPreview(mode,key){ return OneToneMappingRecording.updatePreview(mode,key); }
    function armLocalCaptureGuard(){ return OneToneMappingEditorState.armLocalCaptureGuard(); }
    function disableMappingForRecordingAsync(m){ return OneToneMappingRecording.disableForRecordingAsync(m); }
    function clearRecordMappingGuard(){ return OneToneMappingRecording.clearMappingGuard(); }
    function notifyOnboardingCapture(mode,msg){ return OneToneMappingRecording.notifyOnboardingCapture(mode,msg); }
    function notifyOnboardingRecordingPreview(mode,key){ return OneToneMappingRecording.notifyOnboardingPreview(mode,key); }
    function startNativeRestoreRecord(id){ return OneToneMappingRecording.startNativeRestore(id); }
    function finishNativeRestoreCapture(p,s){ return OneToneMappingRecording.finishNativeRestore(p,s); }
    function startSchemeSwitchRecord(){ return OneToneMappingRecording.startSchemeSwitch(); }
    function finishSchemeSwitchCapture(c){ return OneToneMappingRecording.finishSchemeSwitch(c); }
    function startMappingSwitchRecord(id){ return OneToneMappingRecording.startMappingSwitch(id); }
    function finishMappingSwitchCapture(c){ return OneToneMappingRecording.finishMappingSwitch(c); }
    function clearSchemeSwitchKey(){ return OneToneMappingRecording.clearSchemeSwitch(); }
    function applyBackendKeyCapture(msg){ return OneToneMappingRecording.applyBackendKeyCapture(msg); }
    function previewCaptureKey(mode,key){ return OneToneMappingRecording.previewCaptureKey(mode,key); }
    function isHardwareDelegatedTriggerKey(key,code){ return OneToneMappingRecording.isHardwareDelegatedTriggerKey(key,code); }
    function finishTriggerCapture(key,source,sourceKey,sourceTime){ return OneToneMappingRecording.finishTrigger(key,source,sourceKey,sourceTime); }
    function finishFrontendTriggerCapture(combo){ return OneToneMappingRecording.finishFrontendTrigger(combo); }
    function isHardwareCaptureToken(key){ return OneToneMappingRecording.isHardwareCaptureToken(key); }
    function finishDetectedHardwareTriggerCapture(key){ return OneToneMappingRecording.finishDetectedHardwareTrigger(key); }
    function finishTargetCapture(combo,mappingId){ return OneToneMappingRecording.finishTarget(combo,mappingId); }
    function resetTargetCapture(){ return OneToneMappingRecordingInput.resetTargetCapture(); }
    function sanitizeTargetCombo(combo){ return OneToneMappingRecordingInput.sanitizeTargetCombo(combo); }
    function renderVoiceSettingsFlow(loading){ return OneToneVoiceSettingsFlow.render(loading); }
    function homeEntryVisibility(mode){ return OneToneHomeShell.entryVisibility(mode); }
    function applyHomeEntryModeLayout(showKeyEntry,showVoiceEntry){ return OneToneHomeShell.applyEntryLayout(showKeyEntry,showVoiceEntry); }
    function renderHome(){ return OneToneHomeShell.render(); }
    function openHomeSetupFlow(){ return OneToneHomeShell.openSetupFlow(); }
    function placeHomeHabitsBtn(unlocked){ return OneToneHomeShell.placeHabitsBtn(unlocked); }
    function openSettings(opts){ return OneToneSettingsDrawer.open(opts); }
    function openDrawer(opts){ return OneToneSettingsDrawer.openDrawer(opts); }
    function closeDrawer(){ return OneToneSettingsDrawer.close(); }
    function setSettingsPanel(panel){ return OneToneSettingsDrawer.setPanel(panel); }
    function syncSettingsChrome(){ return OneToneSettingsDrawer.syncChrome(); }
    function focusSettingsField(focus){ return OneToneSettingsDrawer.focusField(focus); }
    function resetSettingsLayoutScroll(opts){ return OneToneSettingsDrawer.resetScroll(opts); }
    
    function homeSchemeLabel(){ return OneToneHomeScheme.label(); }
    function homeMappingShortName(m){ return OneToneHomeScheme.shortName(m); }
    function homeMappingPairLine(m){ return OneToneHomeScheme.pairLine(m); }
    function closeHomeSchemeMenu(){ return OneToneHomeScheme.closeMenu(); }
    function toggleHomeSchemeMenu(){ return OneToneHomeScheme.toggleMenu(); }
    function selectHomeMapping(id){ return OneToneHomeScheme.selectMapping(id); }
    function toggleHomeSchemeMappingEnabled(id){ return OneToneHomeScheme.toggleMappingEnabled(id); }
    function renderHomeSchemeSwitcher(loading){ return OneToneHomeScheme.renderSwitcher(loading); }
    function recordingBusySchemeSwitcher(){ return OneToneHomeScheme.isSwitcherBusy(); }
    
    function computeHomeState(){ return OneToneHomeLive.computeState(); }
    function setHomeLiveVal(id,text,kind){ return OneToneHomeLive.setLiveVal(id,text,kind); }
    function setHomeLiveBadge(id,text,kind){ return OneToneHomeLive.setLiveBadge(id,text,kind); }
    function renderHomeKeyMapCard(loading){ return OneToneHomeLive.renderKeyMapCard(loading); }
    function keyFinishPreviewText(m){ return OneToneHomeLive.keyFinishPreview(m); }
    function renderHomeKeyFinishPreview(loading){ return OneToneHomeLive.renderKeyFinishPreview(loading); }
    function homeMicStatusLabel(){ return OneToneHomeLive.micStatusLabel(); }
    function homeVoiceWakePhrase(){ return OneToneHomeLive.voiceWakePhrase(); }
    function homeVoiceWakePhrases(){ return OneToneHomeLive.voiceWakePhrases(); }
    function homeVoiceEndPhrases(){ return OneToneHomeLive.voiceEndPhrases(); }
    function homeVoiceEngineOn(){ return OneToneHomeLive.voiceEngineOn(); }
    function homeVoiceEngineUiMode(){ return OneToneHomeLive.voiceEngineUiMode(); }
    function syncHomeEntryToggleBtn(btn,isActive,offKey,onKey){ return OneToneHomeLive.syncEntryToggleBtn(btn,isActive,offKey,onKey); }
    function renderHomeLiveKeyPanel(loading){ return OneToneHomeLive.renderKeyPanel(loading); }
    function renderHomeLiveVoicePanel(loading){ return OneToneHomeLive.renderVoicePanel(loading); }
    function renderHomeLiveZone(){ return OneToneHomeLive.renderZone(); }
    function scheduleRenderHomeLiveZone(){ return OneToneHomeLive.scheduleRenderZone(); }
    function renderHomeVoiceModeSwitchUi(){ return OneToneHomeLive.renderVoiceModeSwitchUi(); }
    function openHomeGuide(card,anchorBtn){ return OneToneHomeGuide.open(card,anchorBtn); }
    function closeHomeGuide(userInitiated){ return OneToneHomeGuide.close(userInitiated); }
    function refreshHomeGuideIfOpen(rebuild){ return OneToneHomeGuide.refresh(rebuild); }
    function initHomeGuide(){ return OneToneHomeGuide.init(); }
    function isEnglishVoskPreset(preset){ return OneToneVoiceWake.isEnglishVoskPreset(preset); }
    function isFirstSuccessDone(){ return OneToneAppHomeRuntime.isFirstSuccessDone(); }
    function markFirstSuccessDone(){ return OneToneAppHomeRuntime.markFirstSuccessDone(); }
    function isHomeAdvancedUnlocked(){ return OneToneAppHomeRuntime.isHomeAdvancedUnlocked(); }
    function isHomeFirstRunFocusMode(){ return OneToneAppHomeRuntime.isHomeFirstRunFocusMode(); }
    function getHomeEntryMode(){ return OneToneAppHomeRuntime.getHomeEntryMode(); }
    function toggleGlobalListen(){ return OneToneAppHomeRuntime.toggleGlobalListen(); }
    function syncGlobalMasterUi(){ return OneToneAppHomeRuntime.syncGlobalMasterUi(); }
    function renderListenRuntime(){ return OneToneAppHomeRuntime.renderListenRuntime(); }
    function isVoiceWakeRuntimeAction(action){ return OneToneAppHomeRuntime.isVoiceWakeRuntimeAction(action); }
    function scheduleRuntimeRender(){ return OneToneAppHomeRuntime.scheduleRuntimeRender(); }
    
    function friendlyKeyName(key){ return window.OneToneKeyLabels.friendlyKeyName(key, getAppLang()); }
    
    
    function selectedDisplayTriggerKey(){
      return editorTriggerForMapping(selectedMapping());
    }
    
    function selectedDisplayTargetKey(){
      var m=selectedMapping();
      var cap=global.OneToneAgentCapabilityUi;
      if(cap&&cap.flowTargetDisplayKey){
        var codexKey=cap.flowTargetDisplayKey(m);
        if(codexKey) return codexKey;
      }
      return editorTargetForMapping(m);
    }
    
    
    function syncEditorFromSelection(){
      OneToneMappingEditorState.syncFromMapping(selectedMapping());
      if(global.OneToneAppBehaviorRules&&global.OneToneAppBehaviorRules.renderKeysAside){
        global.OneToneAppBehaviorRules.renderKeysAside();
      }
      if(global.OneToneKeysPanelUi&&global.OneToneKeysPanelUi.render){
        global.OneToneKeysPanelUi.render();
      }
    }
    
    
    
    function cloneStringList(list){ return OneToneAppTextUtils.cloneStringList(list); }
    
    function sessionActiveState(raw){ return OneToneAppTextUtils.sessionActiveState(raw); }
    
    
    
    
    
    
    function escHtml(s){ return OneToneAppTextUtils.escHtml(s); }
    
    
    
    
    
    
    
    
    
    
    function applyLang(skipRender,opts){
      return applyLangFlow(skipRender,opts);
    }
    
    function newMappingId(){ return OneToneMappingCore.newMappingId(); }
    function ensureMappingExtras(m){ return OneToneMappingCore.ensureMappingExtras(m); }
    function isAutoTriggerMapping(m){ return OneToneMappingCore.isAutoTriggerMapping(m); }
    function ensureMappingTiming(m){ return OneToneMappingCore.ensureMappingTiming(m); }
    
    function renderDebugOverview(){ window.OneToneDebugPanel.renderOverview(); }
    function renderDebugOverviewActions(hs){ window.OneToneDebugPanel.renderOverviewActions(hs); }
    function renderDebugOverviewCards(){ window.OneToneDebugPanel.renderOverviewCards(); }
    function renderDebugDeveloperPanel(){ window.OneToneDebugPanel.renderDeveloper(); }
    function renderDebugPanel(){ window.OneToneDebugPanel.renderPanel(); }
    
    const logLines=OneToneAppGlobalError.logLines;
    function pushLog(line){ return OneToneAppGlobalError.pushLog(line); }
    function logGlobalError(kind,detail){ return OneToneAppGlobalError.logGlobalError(kind,detail); }
    function formatSourceTime(raw){ return OneToneMappingMetaRender.formatSourceTime(raw); }
    function formatNativeKeyLabels(m){ return OneToneMappingMetaRender.formatNativeKeyLabels(m); }
    function renderTriggerMetaBlock(m,id){ return OneToneMappingMetaRender.renderTriggerMetaBlock(m,id); }
    function renderNativeRestoreBlock(m,id){ return OneToneMappingMetaRender.renderNativeRestoreBlock(m,id); }
    function renderSwitchKeysBlock(m,id){ return OneToneMappingMetaRender.renderSwitchKeysBlock(m,id); }
    
    function fireTestSend(forMappingId){ return OneToneMappingTestSend.fire(forMappingId); }
    function closeTestModal(){ return OneToneMappingTestSend.closeModal(); }
    function handleTestSendResult(msg){ return OneToneMappingTestSend.handleResult(msg); }
    function renderTestSendButton(){ return OneToneMappingTestSend.renderSendButton(); }
    
    function closeFloatMenu(){ return OneToneMappingTrashMenu.close(); }
    function openFloatMenu(id, btn){ return OneToneMappingTrashMenu.open(id, btn); }
    function deleteMappingFromMenu(id){ return OneToneMappingTrashMenu.deleteFromMenu(id); }
    function duplicateMapping(id){ return OneToneMappingTrashMenu.duplicate(id); }
    function reorderMapping(id, dir){ return OneToneMappingTrashMenu.reorder(id, dir); }
    function restoreFromTrash(id){ return OneToneMappingTrashMenu.restoreFromTrash(id); }
    function renderTrashList(){ return OneToneMappingTrashMenu.renderTrashList(); }
    function showSchemeSwitchFeedback(toId, label){ return OneToneSchemeSwitchFeedback.show(toId, label); }
    function ensureNotificationPermission(){ return OneToneSchemeSwitchFeedback.ensureNotificationPermission(); }
    
    function isAllowedTriggerKey(key){
      return OneToneAppKeyUtils.isAllowedTriggerKey(key);
    }
    
    function hasCompleteMappings(){
      return sortedMappings().some(isSavedMapping);
    }
    
    function renderSchemeSwitch(){
      return;
    }
    
    function renderHeroBadges(){ return OneToneRender.renderHeroBadges(); }
    function render(){ return OneToneRender.render(); }

    return {
      $:$,
      abandonDraftIfPristine:abandonDraftIfPristine,
      addVoiceEndPreset:addVoiceEndPreset,
      addVoiceSapiPreset:addVoiceSapiPreset,
      addVoiceVoskPreset:addVoiceVoskPreset,
      applyBootstrapLangTexts:applyBootstrapLangTexts,
      applyCoreLangTexts:applyCoreLangTexts,
      applyFontScale:applyFontScale,
      applyHomeLiveLang:applyHomeLiveLang,
      applyKeyWakeRecordingUi:applyKeyWakeRecordingUi,
      applyLang:applyLang,
      applyMappingPrefsLangTexts:applyMappingPrefsLangTexts,
      applyMvpInit:applyMvpInit,
      applyRuntimeLangTexts:applyRuntimeLangTexts,
      applySettingsLangTexts:applySettingsLangTexts,
      applyTheme:applyTheme,
      armTargetLeftClickIgnore:armTargetLeftClickIgnore,
      armTriggerLeftClickIgnore:armTriggerLeftClickIgnore,
      buildMicLevelBars:buildMicLevelBars,
      buildPeripheralTriggerSource:buildPeripheralTriggerSource,
      cancelDraftOrRecording:cancelDraftOrRecording,
      cancelRecording:cancelRecording,
      changeVoiceVoskModelPreset:changeVoiceVoskModelPreset,
      checkForAppUpdate:checkForAppUpdate,
      clearMicBackoff:clearMicBackoff,
      clearSchemeSwitchKey:clearSchemeSwitchKey,
      closeDrawer:closeDrawer,
      closeFloatMenu:closeFloatMenu,
      closeHomeSchemeMenu:closeHomeSchemeMenu,
      closeTestModal:closeTestModal,
      closeWelcome:closeWelcome,
      computeHomeState:computeHomeState,
      conflictsForMapping:conflictsForMapping,
      countConflictPairs:countConflictPairs,
      currentVoiceMode:currentVoiceMode,
      defaultConfig:defaultConfig,
      defaultUpdateState:defaultUpdateState,
      downloadVoskModelGuide:downloadVoskModelGuide,
      downloadVoskModel:downloadVoskModel,
      deferProcessUsagePoll:deferProcessUsagePoll,
      deleteMappingFromMenu:deleteMappingFromMenu,
      disableMappingForRecordingAsync:disableMappingForRecordingAsync,
      dismissAppUpdate:dismissAppUpdate,
      duplicateMapping:duplicateMapping,
      editorTargetForMapping:editorTargetForMapping,
      editorTriggerForMapping:editorTriggerForMapping,
      ensureConfig:ensureConfig,
      ensureFullLangApplied:ensureFullLangApplied,
      ensureMappingExtras:ensureMappingExtras,
      ensureMappingTiming:ensureMappingTiming,
      ensureNotificationPermission:ensureNotificationPermission,
      ensureSoundsConfig:ensureSoundsConfig,
      fallbackConfigLoaded:fallbackConfigLoaded,
      fireTestSend:fireTestSend,
      flushAllEditorToMappings:flushAllEditorToMappings,
      focusMapping:focusMapping,
      focusSchemeEditStep:focusSchemeEditStep,
      focusSettingsField:focusSettingsField,
      fontScaleValues:fontScaleValues,
      forceVoiceDiagLog:forceVoiceDiagLog,
      formatProcessCpu:formatProcessCpu,
      formatProcessMemory:formatProcessMemory,
      formatTimingSec:formatTimingSec,
      formatTriggerTrace:formatTriggerTrace,
      friendlyKeyName:friendlyKeyName,
      friendlyPair:friendlyPair,
      frontendLog:frontendLog,
      getAppLang:getAppLang,
      getHomeEntryMode:getHomeEntryMode,
      handleHomeCtaClick:handleHomeCtaClick,
      handleKeyFinishFlowClick:handleKeyFinishFlowClick,
      handleKeyFinishFlowInput:handleKeyFinishFlowInput,
      handleMicMonitorError:handleMicMonitorError,
      handleTestSendResult:handleTestSendResult,
      handleVoiceSapiEnableResult:handleVoiceSapiEnableResult,
      homeMappingPairLine:homeMappingPairLine,
      homeMicStatusLabel:homeMicStatusLabel,
      homeOneClickStart:homeOneClickStart,
      homeSchemeLabel:homeSchemeLabel,
      homeVoiceEngineOn:homeVoiceEngineOn,
      homeVoiceEngineUiMode:homeVoiceEngineUiMode,
      homeVoiceWakePhrase:homeVoiceWakePhrase,
      initHomeGuide:initHomeGuide,
      installAppUpdate:installAppUpdate,
      isAllowedTriggerKey:isAllowedTriggerKey,
      isAllowedTargetKey:isAllowedTargetKey,
      containsLeftMouseToken:containsLeftMouseToken,
      isAutoTriggerMapping:isAutoTriggerMapping,
      isCurrentDraftComplete:isCurrentDraftComplete,
      isDraftMapping:isDraftMapping,
      isFirstSuccessDone:isFirstSuccessDone,
      isHomeAdvancedUnlocked:isHomeAdvancedUnlocked,
      isHomeFirstRunFocusMode:isHomeFirstRunFocusMode,
      isSavedMapping:isSavedMapping,
      isVoiceWakeRuntimeAction:isVoiceWakeRuntimeAction,
      keyFinishPreviewText:keyFinishPreviewText,
      liveUpdateTimingRange:liveUpdateTimingRange,
      loadMicDevices:loadMicDevices,
      loadVoiceVoskStatus:loadVoiceVoskStatus,
      logGlobalError:logGlobalError,
      logLines:logLines,
      mappingById:mappingById,
      mappingListUiActive:mappingListUiActive,
      mappingTargetKey:mappingTargetKey,
      markBoot:markBoot,
      markFirstSuccessDone:markFirstSuccessDone,
      markVoiceEngineBootHandled:markVoiceEngineBootHandled,
      maybeEnableMappingAfterComplete:maybeEnableMappingAfterComplete,
      maybeStartProcessUsagePoll:maybeStartProcessUsagePoll,
      micLevelUiVisible:micLevelUiVisible,
      newMappingId:newMappingId,
      normalizeMediaTargetKey:normalizeMediaTargetKey,
      normalizeTriggerKey:normalizeTriggerKey,
      normalizeUpdateState:normalizeUpdateState,
      onVoiceEndDelayChange:onVoiceEndDelayChange,
      onVoiceEndDelayInput:onVoiceEndDelayInput,
      onboardEmit:onboardEmit,
      onboardIsOpen:onboardIsOpen,
      openFloatMenu:openFloatMenu,
      openHomeGuide:openHomeGuide,
      openHomeSetupFlow:openHomeSetupFlow,
      openSettings:openSettings,
      openVoiceSapiSetup:openVoiceSapiSetup,
      openVoskResourcesDir:openVoskResourcesDir,
      openWelcome:openWelcome,
      otherIdInConflict:otherIdInConflict,
      playSoundCue:playSoundCue,
      previewSoundSlot:previewSoundSlot,
      processUsageLine:processUsageLine,
      processUsageModeLabel:processUsageModeLabel,
      processUsageStatusLabel:processUsageStatusLabel,
      processUsageSummaryLine:processUsageSummaryLine,
      processUsageUnavailableLine:processUsageUnavailableLine,
      pushLog:pushLog,
      recordingMapping:recordingMapping,
      refreshHomeGuideIfOpen:refreshHomeGuideIfOpen,
      refreshProcessUsage:refreshProcessUsage,
      removeDraftMapping:removeDraftMapping,
      render:render,
      renderAddButton:renderAddButton,
      renderDebugDeveloperPanel:renderDebugDeveloperPanel,
      renderDebugPanel:renderDebugPanel,
      renderDraftHint:renderDraftHint,
      renderEditor:renderEditor,
      renderHeroBadges:renderHeroBadges,
      renderHome:renderHome,
      renderHomeKeyFinishPreview:renderHomeKeyFinishPreview,
      renderHomeLiveKeyPanel:renderHomeLiveKeyPanel,
      renderHomeLiveVoicePanel:renderHomeLiveVoicePanel,
      renderHomeLiveZone:renderHomeLiveZone,
      scheduleRenderHomeLiveZone:scheduleRenderHomeLiveZone,
      renderHomeVoiceModeSwitchUi:renderHomeVoiceModeSwitchUi,
      renderHomeMicCurrent:renderHomeMicCurrent,
      renderKeyFinishFlowPanel:renderKeyFinishFlowPanel,
      renderKeySchemeCardHeader:renderKeySchemeCardHeader,
      renderListenRuntime:renderListenRuntime,
      renderMappingChrome:renderMappingChrome,
      renderMappingList:renderMappingList,
      renderMicDevices:renderMicDevices,
      renderRecordCancelBar:renderRecordCancelBar,
      renderSchemeSwitch:renderSchemeSwitch,
      renderSettingsDebugSubnav:renderSettingsDebugSubnav,
      renderSettingsSchemeSubnav:renderSettingsSchemeSubnav,
      renderSettingsVoiceSubnav:renderSettingsVoiceSubnav,
      renderSoundSettingsPanel:renderSoundSettingsPanel,
      renderTestSendButton:renderTestSendButton,
      renderTrashList:renderTrashList,
      renderUpdateUi:renderUpdateUi,
      renderVoiceDiagLog:renderVoiceDiagLog,
      renderVoiceDiagTabs:renderVoiceDiagTabs,
      renderVoiceEndStatus:renderVoiceEndStatus,
      renderVoiceModeSwitch:renderVoiceModeSwitch,
      renderVoiceModeUsage:renderVoiceModeUsage,
      renderVoiceSapiStatus:renderVoiceSapiStatus,
      renderVoiceVoskStatus:renderVoiceVoskStatus,
      renderVoiceKwsStatus:renderVoiceKwsStatus,
      retryVoskStart:retryVoskStart,
      retryVoskStart:retryVoskStart,
      reorderMapping:reorderMapping,
      requestBackendConfig:requestBackendConfig,
      resetTargetCapture:resetTargetCapture,
      restoreFromTrash:restoreFromTrash,
      runtime:function(){ return runtime; },
      sanitizeTargetCombo:sanitizeTargetCombo,
      save:save,
      saveAsync:saveAsync,
      scheduleBootMicReady:scheduleBootMicReady,
      scheduleDebugChromeRefresh:scheduleDebugChromeRefresh,
      scheduleDeferredVoiceEngineBoot:scheduleDeferredVoiceEngineBoot,
      scheduleLangBootstrap:scheduleLangBootstrap,
      scheduleRuntimeRender:scheduleRuntimeRender,
      scheduleVoiceUiRender:scheduleVoiceUiRender,
      schemeMappingHasConflict:schemeMappingHasConflict,
      schemeStepFocus:schemeStepFocus,
      selectHomeMapping:selectHomeMapping,
      selectedDisplayTargetKey:selectedDisplayTargetKey,
      selectedDisplayTriggerKey:selectedDisplayTriggerKey,
      selectedMapping:selectedMapping,
      activeSceneMapping:activeSceneMapping,
      setAppLang:setAppLang,
      setDebugFocusMode:setDebugFocusMode,
      setFontScale:setFontScale,
      setRecording:setRecording,
      setSettingsPanel:setSettingsPanel,
      setSoundSlotEnabled:setSoundSlotEnabled,
      setSoundSlotId:setSoundSlotId,
      setRecordingAudioMuteEnabled:setRecordingAudioMuteEnabled,
      setRecordingAudioStrength:setRecordingAudioStrength,
      setTheme:setTheme,
      setVoiceDiagTab:setVoiceDiagTab,
      setVoiceEndCommitKey:setVoiceEndCommitKey,
      setVoiceWakeExpandedMode:setVoiceWakeExpandedMode,
      settingsPanelNeedsVoicePoll:settingsPanelNeedsVoicePoll,
      shouldIgnoreTargetLeftClickCapture:shouldIgnoreTargetLeftClickCapture,
      shouldIgnoreTriggerLeftClickCapture:shouldIgnoreTriggerLeftClickCapture,
      showSchemeSwitchFeedback:showSchemeSwitchFeedback,
      sortedMappings:sortedMappings,
      startMappingSwitchRecord:startMappingSwitchRecord,
      startMicLevelPoll:startMicLevelPoll,
      startNativeRestoreRecord:startNativeRestoreRecord,
      startProcessUsagePoll:startProcessUsagePoll,
      startSchemeSwitchRecord:startSchemeSwitchRecord,
      startTargetRecord:startTargetRecord,
      startTriggerRecord:startTriggerRecord,
      startVoiceStatusPoll:startVoiceStatusPoll,
      state:function(){ return state; },
      stopMicLevelPoll:stopMicLevelPoll,
      stopMicMonitor:stopMicMonitor,
      switchVoiceMode:switchVoiceMode,
      syncAllTimingRanges:syncAllTimingRanges,
      syncDebugFocusSections:syncDebugFocusSections,
      syncEditorFromSelection:syncEditorFromSelection,
      syncGlobalMasterUi:syncGlobalMasterUi,
      syncHomeMicMonitor:syncHomeMicMonitor,
      syncHomeMicPickState:syncHomeMicPickState,
      syncKeySchemeTimeline:syncKeySchemeTimeline,
      syncVoiceEndAutoSendToggle:syncVoiceEndAutoSendToggle,
      syncVoiceEndCommitKeyUi:syncVoiceEndCommitKeyUi,
      syncVoiceEndDelayRanges:syncVoiceEndDelayRanges,
      syncVoiceEndModeUi:syncVoiceEndModeUi,
      syncVoiceEndPresets:syncVoiceEndPresets,
      syncVoiceEndToggle:syncVoiceEndToggle,
      syncVoiceSapiToggle:syncVoiceSapiToggle,
      syncVoiceSettingsFromConfig:syncVoiceSettingsFromConfig,
      syncVoiceVoskToggle:syncVoiceVoskToggle,
      t:t,
      testVoiceEndCommit:testVoiceEndCommit,
      testVoiceEndStop:testVoiceEndStop,
      testVoiceSapiSend:testVoiceSapiSend,
      testVoiceVoskSend:testVoiceVoskSend,
      setVoiceKwsEnabled:setVoiceKwsEnabled,
      testVoiceKwsSend:testVoiceKwsSend,
      testVoiceKwsDetect:testVoiceKwsDetect,
      toast:toast,
      toggleGlobalListen:toggleGlobalListen,
      toggleHomeSchemeMappingEnabled:toggleHomeSchemeMappingEnabled,
      toggleHomeSchemeMenu:toggleHomeSchemeMenu,
      toggleSoundsMaster:toggleSoundsMaster,
      toggleVoiceEnd:toggleVoiceEnd,
      toggleVoiceEndAutoSend:toggleVoiceEndAutoSend,
      toggleVoiceSapi:toggleVoiceSapi,
      toggleVoiceVosk:toggleVoiceVosk,
      ui:function(){ return ui; },
      syncRecordingAudioUi:syncRecordingAudioUi,
      normalizeRecordingMuteStrength:normalizeRecordingMuteStrength,
      recordingMuteStrengthLabel:recordingMuteStrengthLabel,
      recordingMuteStrengthOptions:recordingMuteStrengthOptions,
      updateMicLevelBars:updateMicLevelBars,
      updatePrimaryCTA:updatePrimaryCTA,
      updateVoiceDiagMetric:updateVoiceDiagMetric,
      updateVoiceSapiConfidence:updateVoiceSapiConfidence,
      applyVoiceSapiSensLevel:applyVoiceSapiSensLevel,
      voiceCaptureActive:voiceCaptureActive,
      voiceEndStateLabel:voiceEndStateLabel,
      voiceEndUiUsesLiteMode:voiceEndUiUsesLiteMode,
      voiceStatusPollTick:voiceStatusPollTick,
      voiceWakeStateLabel:voiceWakeStateLabel,
      vpInvoke:vpInvoke,
      vpInvokeTimeout:vpInvokeTimeout,
    };
  }

  global.OneToneAppLegacyShims={build:build};
})((typeof window!=='undefined')?window:globalThis);
