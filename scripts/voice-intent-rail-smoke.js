#!/usr/bin/env node
'use strict';
/** ponytail: fails if voice F-redesign hosts drift out of index.html */
var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '..');
var html = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8');
var css = fs.readFileSync(path.join(root, 'src/css/voice-page-shell.css'), 'utf8');
var railJs = fs.readFileSync(path.join(root, 'src/js/features/voice/voice-intent-rail.js'), 'utf8');
var persist = fs.readFileSync(path.join(root, 'src/js/core/config-persist.js'), 'utf8');
var need = [
  'id="voiceIntentPicker"',
  'id="voiceIntentRail"',
  'id="voiceIntentPaneIme"',
  'id="voiceIntentPanePrompt"',
  'id="voiceIntentPaneKeys"',
  'id="voiceIntentPaneSoftPad"',
  'id="voiceIntentPaneCamera"',
  'id="imePresetStripVoice"',
  'id="voicePromptInjectBody"',
  'id="voiceFaceTabs"',
  'id="voiceWakeSecondary"',
  'id="voiceWakeMoreAliases"',
  'id="btnVoiceWakeGoKeysTarget"',
  'id="voiceWakeDesk"',
  'id="voiceWakeAliasBlock"',
  'id="voiceWakeActionDictate"',
  'id="voiceSceneActionsPanel"',
  'id="voiceSceneActionsDir"',
  'id="voiceSchemeStrip"',
  'id="voiceDockMicBars"',
  'id="voiceWakeListeningOptInToggle"',
  'id="voiceWakeBringUpRow"',
  'voice-f-hero',
  'id="voiceFlowNodeWakeVal"',
  'id="voiceFlowNodeFinishVal"',
  'id="btnVoiceDiscardGoCamera"',
  '字丢掉（Esc）'
];
var missing = need.filter(function (s) { return html.indexOf(s) < 0; });
if (html.indexOf('voice-intent-rail.js') < 0) missing.push('script voice-intent-rail.js');
if (html.indexOf('id="voiceWakeEngineSeg"') >= 0) missing.push('wake still has engine seg');
if (html.indexOf('用什么听') >= 0) missing.push('wake still has 用什么听');
if (html.indexOf('只听口令') >= 0 && html.indexOf('id="voiceWakeEngineKws"') >= 0) missing.push('wake still has 只听口令 engine');
// Strategy switch must live in scheme strip, not bottom dock
var switchAt = html.indexOf('id="voiceSummaryEngineSwitch"');
var stripAt = html.indexOf('id="voiceSchemeStrip"');
var dockAt = html.indexOf('id="voiceBottomDock"');
if (switchAt < 0) missing.push('missing strategy switch');
if (stripAt < 0 || switchAt < stripAt) missing.push('strategy not in scheme strip');
if (dockAt > 0) {
  var dockEnd = html.indexOf('</footer>', dockAt);
  var dockChunk = dockEnd > dockAt ? html.slice(dockAt, dockEnd) : '';
  if (dockChunk.indexOf('voiceSummaryEngineSwitch') >= 0) missing.push('strategy still in bottom dock');
}
// Bring-up under prompt pane
var bringAt = html.indexOf('id="voiceWakeBringUpRow"');
var promptAt = html.indexOf('id="voiceIntentPanePrompt"');
if (bringAt < 0 || promptAt < 0 || bringAt < promptAt) missing.push('bring-up not in prompt pane');
if (css.indexOf('.voice-wake-secondary') < 0) missing.push('css .voice-wake-secondary');
if (css.indexOf('.voice-scheme-strip') < 0) missing.push('css .voice-scheme-strip');
if (css.indexOf('#voiceSceneActionsPanel') < 0) missing.push('css voiceSceneActionsPanel');
var sceneJs = fs.readFileSync(path.join(root, 'src/js/features/mapping/keys-scene-actions-panel.js'), 'utf8');
if (railJs.indexOf('voiceSceneActionsPanel') < 0 && sceneJs.indexOf('voiceSceneActionsPanel') < 0) {
  missing.push('scene panel missing voice host');
}
if (sceneJs.indexOf('filterRowsForChannel') < 0) missing.push('scene missing channel filter');
var feedbackJs = fs.readFileSync(path.join(root, 'src/js/features/voice/voice-feedback-rail.js'), 'utf8');
if (/currentStep\(step\)===['"]wake['"]/.test(feedbackJs) && feedbackJs.indexOf('paint(dockHeard)') >= 0) {
  // ok if wake-gated was removed
}
if (feedbackJs.indexOf('if(currentStep(step)===\'wake\') paint(dockHeard)') >= 0) {
  missing.push('dock heard still wake-only');
}
// rail must live inside picker, not as pipeline sibling before hero
var pickerAt = html.indexOf('id="voiceIntentPicker"');
var railAt = html.indexOf('id="voiceIntentRail"');
var heroAt = html.indexOf('id="voiceFlowNodes"');
if (pickerAt < 0 || railAt < pickerAt) missing.push('rail-inside-picker');
if (heroAt > 0 && railAt > 0 && railAt < heroAt) missing.push('rail-before-hero');
if (css.indexOf('.voice-intent-picker') < 0) missing.push('css .voice-intent-picker');
if (css.indexOf('.voice-f-node') < 0) missing.push('css .voice-f-node');
if (css.indexOf('#voiceFlowNodeWake::after') >= 0) missing.push('css still has 开 glyph');
if (railJs.indexOf('voiceIntentPicker') < 0) missing.push('rail js picker');
if (railJs.indexOf("setVoiceFace('dictate')") < 0) missing.push('rail no-face-swap');
if (persist.indexOf('promptInjectText') < 0) missing.push('persist promptInjectText');
if (missing.length) {
  console.error('[voice-intent-rail-smoke] FAIL', missing);
  process.exit(1);
}
console.log('[voice-intent-rail-smoke] ok');
