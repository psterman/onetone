/**
 * Voice settings IA after Batch A (Q39–Q45): 4 faces, landing, 2-step finish.
 * Run: node scripts/test-voice-wake-ia.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const html = read('src/index.html');
assert.ok(!html.includes('btnVoiceWakeCustomListen'), 'no btnVoiceWakeCustomListen');
assert.ok(!html.includes('btnVoiceWakeKindSound'), 'no sound tab button');
assert.ok(html.includes('id="voiceWakeAcousticHost"'), 'keeps voiceWakeAcousticHost');
assert.ok(!html.includes('id="voiceWakeInputTarget"'), 'no voiceWakeInputTarget on wake page');
assert.ok(html.includes('voice-wake-pool-card') || html.includes('voice-phrase-hero') || html.includes('id="voiceWakeHeroCard"'), 'has wake hero');
assert.ok(html.includes('id="btnVoiceWakePoolAdd"') || html.includes('id="btnVoiceWakePhraseCap"'), 'has wake phrase edit entry');
assert.ok(html.includes('id="voicePhraseHero"') || html.includes('voice-phrase-cap') || html.includes('btnVoiceWakePhraseCap'), 'proto phrase-cap');
assert.ok(html.includes('id="voiceFinishCausal"'), 'finish causal');
assert.ok(html.includes('id="voiceFinishDetailKeep"'), 'finish keep detail');
assert.ok(!html.includes('btnVoiceSandboxOpen'), 'no btnVoiceSandboxOpen');

/* Face strip + wrong-fg + 4 faces (no openApp) */
assert.ok(html.includes('id="voiceFaceTabs"'), 'has voiceFaceTabs');
assert.ok(html.includes('id="btnVoiceFaceDictate"'), 'has dictate face');
assert.ok(html.includes('id="btnVoiceFaceSoftPad"'), 'has SoftPad face');
assert.ok(html.includes('id="btnVoiceFaceKeys"'), 'has keys face');
assert.ok(html.includes('id="btnVoiceFaceCamera"'), 'has camera face');
assert.ok(!html.includes('id="btnVoiceFaceOpenApp"'), 'no openApp face tab');
assert.ok(!html.includes('id="voiceOpenAppFace"'), 'no openApp face pane');
assert.ok(html.includes('id="voiceSoftPadFace"'), 'has SoftPad bridge pane');
assert.ok(html.includes('id="voiceKeysFace"'), 'has keys bridge pane');
assert.ok(html.includes('id="voiceCameraFace"'), 'has camera bridge pane');
assert.ok(html.includes('id="voiceWrongFgStatus"'), 'has wrong-fg status');
assert.ok(html.includes('id="voiceLandingStrip"'), 'has landing strip');
assert.ok(!html.includes('id="voiceSchemeCard"'), 'no scheme card');
assert.ok(!html.includes('id="voiceWakeSideLinks"'), 'no side links');
assert.ok(html.includes('id="btnVoiceDockTryMic"'), 'dock try mic');
assert.ok(!html.includes('id="btnVoiceWakeOpenAppEntry"'), 'no 01 openApp secondary entry');
assert.ok(!html.includes('id="voiceWakeActionApp"'), 'causal bar has no切目标 step');
assert.ok(!html.includes('id="voiceTab2TryAgent"'), 'no Cursor try CTA');
assert.ok(!html.includes('id="voiceTab2TryLocal"'), 'local try moved off Tab2 CTA');
assert.ok(!/无目标/.test(html), 'no 无目标 copy in html');

/* Two-step flow */
assert.ok(html.includes('data-voice-node="wake"'), 'wake flow node');
assert.ok(html.includes('data-voice-node="finish"'), 'finish flow node');
assert.ok(!html.includes('data-voice-node="send"'), 'no send flow node');
assert.ok(html.includes('data-voice-subpage="finish"'), 'finish step card');
assert.ok(html.includes('id="voiceFinishOutcomes"'), 'finish outcomes');
assert.ok(html.includes('id="voiceWakeAdvanced"'), 'wake advanced details');

const wakeBodyMatch = html.match(/id="voiceSettingsWakeBody"[\s\S]*?(?=<div class="keys-workflow-arrow voice-workflow-arrow")/);
assert.ok(wakeBodyMatch, 'can slice voiceSettingsWakeBody');
const wakeBody = wakeBodyMatch[0];
assert.ok(wakeBody.includes('id="voiceWakeActionBar"'), 'has voiceWakeActionBar');
assert.ok(wakeBody.includes('id="voiceWakeActionDictate"'), 'has voiceWakeActionDictate');
assert.ok(!wakeBody.includes('id="voiceWakeActionApp"'), 'no voiceWakeActionApp');
assert.ok(!/voiceWakeActionNoSend|不自动发送|send_mode/.test(wakeBody), 'wake body has no send_mode leak');
assert.ok(wakeBody.includes('id="voiceLandingStrip"'), 'landing in wake body');
assert.ok(!wakeBody.includes('id="voiceOutputSummonBlock"'), 'summon block not inside wake 01');

const wakeRender = read('src/js/features/voice/voice-step-wake-render.js');
assert.ok(/setVoiceFace/.test(wakeRender), 'wake-render exports setVoiceFace');
assert.ok(/renderLandingStrip/.test(wakeRender), 'renders landing strip');
assert.ok(/renderWrongFgStatus/.test(wakeRender), 'renders wrong-fg status');
assert.ok(/softpad/.test(wakeRender) && /camera/.test(wakeRender), 'four-face enum');
assert.ok(!/resolveWakeActionAppLabel/.test(wakeRender), 'no切目标 label resolver');
assert.ok(!/OneToneVoiceWakeAcoustic/.test(wakeRender), 'wake-render does not mount VoiceWakeAcoustic');
assert.ok(/function isScenarioVoiceEdit\(\)\{\s*return false/.test(wakeRender.replace(/\s+/g,' ')), 'scenario voice edit disabled on voice settings');
assert.ok(/habitScenarioVoiceBody/.test(wakeRender), 'clears scenario body host');
assert.ok(/btnVoiceWakePhraseEditLink/.test(wakeRender), 'preserves proto hint edit link');

const pageState = read('src/js/features/voice/voice-page-state.js');
assert.ok(/STEPS=\['wake','finish'\]/.test(pageState), 'STEPS wake|finish');

const stepNav = read('src/js/features/voice/voice-step-nav.js');
assert.ok(/finish:\{btn:'voiceFlowNodeFinish'/.test(stepNav), 'nav finish node');

const bindings = read('src/js/features/voice/voice-ui-bindings.js');
assert.ok(/btnVoiceFaceDictate|voiceFaceTabs/.test(bindings), 'binds face tabs');
assert.ok(/btnVoiceLandingKeysTarget/.test(bindings), 'binds landing CTA');
assert.ok(/focus:'target'|focus,\"target\"|'target'/.test(bindings), 'landing CTA focuses keys target');
assert.ok(/voice_wake_refused_wrong_fg/.test(bindings), 'listens for wrong-fg refuse toast');
assert.ok(/btnVoiceDockTryMic/.test(bindings), 'binds dock try mic');
assert.ok(/setFinishOutcome|voiceFinishOutcomes/.test(bindings), 'binds finish outcomes');
assert.ok(!/btnVoiceWakeSideKeys/.test(bindings), 'no side-link binds');
assert.ok(!/btnVoiceOpenAppTryAgent/.test(bindings), 'no openApp try-agent bind');

const drawer = read('src/js/features/settings/settings-drawer.js');
assert.ok(/voiceFace/.test(drawer), 'drawer accepts voiceFace deep-link');
assert.ok(/softpad/.test(drawer) || /keys/.test(drawer), 'drawer accepts bridge faces');

const css = read('src/css/voice-page-shell.css');
assert.ok(/\.voice-face-tabs/.test(css), 'face tabs css');
assert.ok(/\.voice-landing/.test(css), 'landing css');
assert.ok(/\.voice-dock-try-mic/.test(css), 'dock try mic css');
assert.ok(/\.voice-bridge-face\[hidden\]/.test(css), 'bridge face hidden beats display:grid');
assert.ok(/\.voice-bridge-empty\[hidden\]/.test(css), 'bridge empty hidden beats display:grid');
assert.ok(/\.voice-finish-detail\[hidden\]/.test(css), 'finish detail hidden beats display:grid');
assert.ok(/\.voice-finish-delay-chips\[hidden\]/.test(css), 'finish delay chips hidden beats display:flex');
assert.ok(/data-voice-face="softpad".*#voiceSoftPadFace|not\(\[data-voice-face="softpad"\]\).*#voiceSoftPadFace/.test(css.replace(/\s+/g,' ')), 'css face gate for softpad');
assert.ok(/#voiceKeysFace:not\(\.is-in-picker\)/.test(css), 'face gate skips picker-mounted keys face');
assert.ok(/#voiceSoftPadFace:not\(\.is-in-picker\)/.test(css), 'face gate skips picker-mounted softpad face');
assert.ok(/#voiceCameraFace:not\(\.is-in-picker\)/.test(css), 'face gate skips picker-mounted camera face');
assert.ok(/#voiceIntentPicker\s+\.voice-bridge-face\.is-in-picker:not\(\[hidden\]\)/.test(css), 'picker bridge display beats pipeline face gate');
assert.ok(/\.voice-bridge-face\.is-in-picker:not\(\[hidden\]\)/.test(css), 'picker bridge visible outside pipeline');

assert.ok(/is-in-picker/.test(wakeRender)&&/voiceIntentPicker/.test(wakeRender), 'setVoiceFace skips picker-mounted bridges');
const intentRail = read('src/js/features/voice/voice-intent-rail.js');
assert.ok(/mountBridge/.test(intentRail)&&/is-in-picker/.test(intentRail), 'intent rail mounts bridges into picker');
assert.ok(/mounted\.hidden\s*=\s*false/.test(intentRail), 'setIntent re-asserts bridge face visible');

assert.ok(/listMode|setMode|customKey/.test(keysBridge), 'keys bridge separates 我录的键 from catalog');
assert.ok(/setMode\(id==='key'\?'customKey':'catalog'\)|setMode\(id==="key"\?"customKey":"catalog"\)/.test(intentRail.replace(/\s+/g,'')), 'intent rail maps 我录的键 to customKey mode');

assert.ok(html.includes('voice-bridge-softpad.js'), 'loads softpad bridge script');
assert.ok(html.includes('voice-bridge-keys.js'), 'loads keys bridge script');
assert.ok(html.includes('voice-bridge-camera.js'), 'loads camera bridge script');
assert.ok(html.includes('id="voiceCamLinked"'), 'camera linked pane');
assert.ok(html.includes('id="voiceKeysCapEffect"'), 'keys effect line');
assert.ok(html.includes('id="voiceKeysKeyLine"'), 'keys keyline');

const keysBridge = read('src/js/features/voice/voice-bridge-keys.js');
assert.ok(/isSoftPadVoice|semantic:softPad/.test(keysBridge), 'keys bridge excludes SoftPad voice');
assert.ok(/semantic:camera:/.test(keysBridge), 'keys bridge excludes camera voice');
assert.ok(/resolveScopeMapping/.test(keysBridge), 'keys bridge uses scope mapping');
assert.ok(/triggerType==='key'|triggerType==="key"/.test(keysBridge), 'keys bridge reads key chords');

const softBridge = read('src/js/features/voice/voice-bridge-softpad.js');
assert.ok(/resolveScopeMapping/.test(softBridge), 'softpad bridge uses scope mapping');
assert.ok(/ensurePad/.test(softBridge), 'softpad heals pad before paint');
assert.ok(/renderSoftPadPreview/.test(softBridge), 'softpad paints real Soft Pad 1:1');
assert.ok(/padKeys\(m\)/.test(softBridge), 'softpad lists only Soft Pad armed keys');
assert.ok(/keyExplain|explainForSlot/.test(softBridge), 'softpad explains capability not phrases');
assert.ok(/applySelectOverlay/.test(softBridge), 'softpad select overlay without phrase edit');
assert.ok(/explainForSlot/.test(keysBridge), 'keys bridge exports explainForSlot');
assert.ok(/addPhrase/.test(softBridge), 'softpad addPhrase write-back');
assert.ok(/addPhrase/.test(keysBridge), 'keys addPhrase write-back');
assert.ok(/catalogSlotOf/.test(keysBridge)&&/agent\.continue/.test(keysBridge), 'keys maps actionId to catalog slot');
assert.ok(/refreshActiveVoiceBridge/.test(read('src/js/features/voice/voice-step-wake-render.js')), 'wake refresh bridge');
assert.ok(/bindBridgeAdd/.test(read('src/js/features/voice/voice-ui-bindings.js')), 'bindings wire addPhrase');
assert.ok(/\.sp-voice-ph/.test(css), 'softpad phrase chip css');

const camBridge = read('src/js/features/voice/voice-bridge-camera.js');
assert.ok(/semantic:camera:/.test(camBridge), 'camera bridge uses camera slot prefix');
assert.ok(/OneToneVoiceBridgeCamera/.test(camBridge), 'camera bridge exports');
assert.ok(/resolveScopeMapping/.test(camBridge), 'camera bridge uses scope mapping');
assert.ok(/presencePrefs|CameraPresenceActions/.test(camBridge), 'camera bridge reads presence actions');
assert.ok(/activeCameraKeys|actionOn\(pa/.test(camBridge), 'camera lists only active presence actions');
assert.ok(/cats\.hidden\s*=\s*true|hidden=true/.test(camBridge), 'camera hides catalog categories');
assert.ok(/addPhrase/.test(camBridge), 'camera addPhrase write-back');

assert.ok(/voiceKeysPhraseOnly/.test(keysBridge), 'keys phrase-only filter');
assert.ok(/actionInstanceId/.test(keysBridge), 'keys keeps shortcut instances apart');
assert.ok(/KEY_GROUPS|voiceKeysCats/.test(keysBridge), 'keys bridge has category framework');
assert.ok(/KEY_META/.test(keysBridge), 'keys bridge has Chinese title map');
assert.ok(/looksLikeId|labelForSlotForMapping/.test(keysBridge), 'keys prefers human titles over ids');

assert.ok(html.includes('id="voiceCamCats"'), 'camera cats host');
assert.ok(html.includes('id="voiceKeysCats"'), 'keys cats host');
assert.ok(html.includes('id="voiceKeysPhraseOnly"'), 'keys phrase-only checkbox');

const header = read('src/js/features/voice/voice-page-header-render.js');
assert.ok(/selectedMappingId/.test(header), 'scope mapping reads selectedMappingId');
assert.ok(/activeSceneId/.test(header), 'scope mapping reads activeSceneId');
assert.ok(/habitScenarioReturnId/.test(header), 'scope mapping reads habitScenarioReturnId');

const rustGate = read('src-tauri/src/voice_end_runtime.rs');
assert.ok(/should_refuse_wake_wrong_fg/.test(rustGate), 'rust wrong-fg gate helper');
assert.ok(/VOICE_WAKE_REFUSED_WRONG_FG|voice_wake_refused_wrong_fg/.test(rustGate), 'emits refuse event');

const kind = read('src-tauri/crates/onetone-logic/src/runtime_event.rs');
assert.ok(/VOICE_WAKE_REFUSED_WRONG_FG/.test(kind), 'runtime event kind defined');

const wakeVm = read('src/js/features/voice/voice-settings-view-model.js');
assert.ok(
  /currentWakePhraseList/.test(wakeVm) && /Prefer persisted\/list-head order/.test(wakeVm),
  'wake display prefers phrase list head over DOM preset order'
);
const wakeUi = read('src/js/features/voice/voice-ui-bindings.js');
assert.ok(
  /voiceWakePhraseTags[\s\S]*replacePrimaryWakePhrase/.test(wakeUi),
  'wake alias chip promotes to primary'
);

console.log('test-voice-wake-ia: ok');
