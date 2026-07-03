const fs = require('fs');
const path = 'c:/Users/Administrator/Desktop/voice-pilot/src/js/main-legacy.js';
const lines = fs.readFileSync(path, 'utf8').split(/\r?\n/);

// 1-indexed inclusive ranges to remove (reverse order for stable indices)
const removeRanges = [
  [2135, 2451], // key-finish-flow render
  [559, 773],   // theme/font/sounds (keep syncKeyWakeSettingsFromConfig at 775)
  [346, 348],   // schemeStepFocus timers
  [318, 320],   // theme/fontScale/FONT_SCALE_VALUES
];

function inRemove(n) {
  return removeRanges.some(([s, e]) => n >= s && n <= e);
}

const out = lines.filter((_, i) => !inRemove(i + 1));

const shimBlock = `
  function setTheme(next){ return OneToneAppThemePrefs.setTheme(next); }
  function applyTheme(){ return OneToneAppThemePrefs.applyTheme(); }
  function setFontScale(scale){ return OneToneAppThemePrefs.setFontScale(scale); }
  function applyFontScale(){ return OneToneAppThemePrefs.applyFontScale(); }
  function playSoundCue(cue,forcePreview){ return OneToneAppThemePrefs.playSoundCue(cue,forcePreview); }
  function previewSoundSlot(slotKey){ return OneToneAppThemePrefs.previewSoundSlot(slotKey); }
  function renderSoundSettingsPanel(){ return OneToneAppThemePrefs.renderSoundSettingsPanel(); }
  function setSoundSlotEnabled(slotKey,enabled){ return OneToneAppThemePrefs.setSoundSlotEnabled(slotKey,enabled); }
  function setSoundSlotId(slotKey,id){ return OneToneAppThemePrefs.setSoundSlotId(slotKey,id); }
  function toggleSoundsMaster(){ return OneToneAppThemePrefs.toggleSoundsMaster(); }
  function ensureSoundsConfig(){ return OneToneAppThemePrefs.ensureSoundsConfig(); }
  function syncSoundsSettingsUi(){ return OneToneAppThemePrefs.syncSoundsSettingsUi(); }
  function fontScaleValues(){ return OneToneAppThemePrefs.fontScaleValues(); }

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
`;

let insertedShim = false;
const final = out.map((line) => {
  if (!insertedShim && line.trim() === 'function defaultConfig(){ return OneToneConfigPersist.defaultConfig(); }') {
    insertedShim = true;
    return line + shimBlock;
  }
  return line;
});

// Fix updateMappingTiming to use module scheduleTimingSave
const patched = final.map((line) => {
  if (line.includes('scheduleTimingSave();') && line.trim() === 'scheduleTimingSave();') {
    return line.replace('scheduleTimingSave();', 'OneToneKeyFinishFlowRender.scheduleTimingSave();');
  }
  return line;
});

// Fix bootstrap fontScaleValues hook
const patched2 = patched.map((line) => {
  if (line.includes('fontScaleValues:function(){ return FONT_SCALE_VALUES; }')) {
    return line.replace('fontScaleValues:function(){ return FONT_SCALE_VALUES; }', 'fontScaleValues:fontScaleValues');
  }
  return line;
});

// Insert registerKeyFinishFlowRenderHooks before registerBootstrapHooks
const hookFn = `
  function registerKeyFinishFlowRenderHooks(){
    window.__vp_key_finish_flow_render_hooks__={
      ensureConfig:ensureConfig,save:save,
      selectedMapping:selectedMapping,isSavedMapping:isSavedMapping,isDraftMapping:isDraftMapping,
      selectedDisplayTriggerKey:selectedDisplayTriggerKey,selectedDisplayTargetKey:selectedDisplayTargetKey,
      friendlyKeyName:friendlyKeyName,homeSchemeLabel:homeSchemeLabel,schemeMappingHasConflict:schemeMappingHasConflict,
      isCurrentDraftComplete:isCurrentDraftComplete,ensureMappingTiming:ensureMappingTiming,
      keyFinishPreviewText:keyFinishPreviewText,renderHomeKeyFinishPreview:renderHomeKeyFinishPreview,
      renderMappingList:function(){ return OneToneMappingList.renderList(); },
      voiceUiSnapshot:function(){ return voiceUiSnapshot; },
      escHtml:escHtml
    };
  }
  function registerAppThemePrefsHooks(){
    window.__vp_app_theme_prefs_hooks__={ defaultConfig:defaultConfig,save:save };
  }
`;

let insertedHooks = false;
const patched3 = patched2.map((line) => {
  if (!insertedHooks && line.trim() === 'function registerBootstrapHooks(){') {
    insertedHooks = true;
    return hookFn + line;
  }
  return line;
});

// Call hook registrars before registerBootstrapHooks
let insertedCalls = false;
const patched4 = patched3.map((line) => {
  if (!insertedCalls && line.trim() === 'registerBootstrapHooks();') {
    insertedCalls = true;
    return '  registerKeyFinishFlowRenderHooks();\n  registerAppThemePrefsHooks();\n  ' + line;
  }
  return line;
});

fs.writeFileSync(path, patched4.join('\n') + '\n', 'utf8');
console.log('main-legacy.js lines:', patched4.length);
