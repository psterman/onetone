/**
 * Smoke: voice oral intent + keys loader + Soft default rows.
 * Run: node scripts/smoke-oral-command-ia.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const html = read('src/index.html');
assert.ok(html.includes('data-voice-intent="oral"'), 'voice rail has oral tab');
assert.ok(html.includes('id="voiceIntentPaneOral"'), 'voice oral pane exists');
assert.ok(html.includes('id="voiceIntentOralHost"'), 'voice oral host exists');
assert.ok(html.includes('oral-command-ui.js'), 'oral-command-ui script tagged');
// Oral is first intent row (before IME).
const oralIdx = html.indexOf('data-voice-intent="oral"');
const imeIdx = html.indexOf('data-voice-intent="ime"');
assert.ok(oralIdx > 0 && imeIdx > oralIdx, 'oral intent tab precedes ime');

const rail = read('src/js/features/voice/voice-intent-rail.js');
assert.ok(/INTENTS\s*=\s*\[[^\]]*['"]oral['"]/.test(rail), 'INTENTS includes oral');
assert.ok(
  /INTENTS\s*=\s*\[\s*['"]oral['"]/.test(rail),
  'INTENTS starts with oral'
);
assert.ok(rail.includes("oral:'voiceIntentPaneOral'"), 'PANE_BY_INTENT maps oral');
assert.ok(rail.includes("OneToneOralCommandUi"), 'rail mounts oral UI');
assert.ok(
  rail.includes('去按键设置改口头触发键') || rail.includes('voiceStartHintOral'),
  'oral start hint points to Key settings (not re-record on voice page)'
);
assert.ok(
  !rail.includes('点按重录口头触发键'),
  'oral start must not invite key recording on voice page'
);

const oralUi = read('src/js/features/voice/oral-command-ui.js');
assert.ok(oralUi.includes('openKeysOralArmSettings'), 'helper opens Keys · oral arm');
assert.ok(
  /openKeysOralArmSettings[\s\S]{0,400}panel:\s*['"]keys['"]/.test(oralUi) &&
    /setActiveTab\(\s*['"]voice['"]\s*\)/.test(oralUi),
  'openKeysOralArmSettings opens keys panel voice tab'
);

const bindings = read('src/js/features/voice/voice-ui-bindings.js');
assert.ok(
  /intent===['"]oral['"][\s\S]{0,300}openKeysOralArmSettings/.test(bindings),
  'start phrase click for oral goes to Keys oral arm'
);
assert.ok(
  !/intent===['"]oral['"][\s\S]{0,300}startOralTriggerRecord/.test(bindings),
  'start phrase click for oral must not startOralTriggerRecord'
);
assert.ok(
  /startTrigger\(\s*mid\s*,\s*\{\s*slot:\s*['"]oral['"]\s*\}\s*\)/.test(oralUi) ||
    /startTrigger\(mid,\s*\{\s*slot:\s*['"]oral['"]\s*\}\)/.test(oralUi),
  'oral loader record forces slot oral'
);
assert.ok(oralUi.includes('data-oral-mode="loader"') || oralUi.includes("data-oral-loader"), 'loader mark');
assert.ok(oralUi.includes('renderOralLoaderHtml'), 'loader renderer');
assert.ok(oralUi.includes('renderOralEditorHtml'), 'editor renderer');
assert.ok(oralUi.includes('keys-oral-main--solo') || oralUi.includes('keys-oral-cats--row'), 'G compact layout');
assert.ok(oralUi.includes('keys-oral-card'), 'G card mark');
assert.ok(oralUi.includes('data-oral-cat'), 'G category nav');
assert.ok(oralUi.includes('keys-oral-say'), 'editable say input');
assert.ok(oralUi.includes('shiftOralInCat'), 'G sort helper');
assert.ok(!/keys-oral-tog/.test(oralUi.replace(/\/\*[\s\S]*?\*\//g, '')), 'editor dropped toggles');
assert.ok(oralUi.includes("source: d.core ? 'core' : 'soft'"), 'core/soft split');
assert.ok(oralUi.includes('enabled !== true'), 'bind/prompt opt-in');
// Habit-only oral scope: never resolve via peer activeTriggerMappingId.
assert.ok(
  !/\.activeTriggerMappingId\s*\(/.test(oralUi),
  'oral selectedMappingId must not call activeTriggerMappingId'
);
assert.ok(oralUi.includes('habitScenarioReturnId'), 'oral scope prefers habitScenarioReturnId');
assert.ok(oralUi.includes('data-oral-mapping'), 'editor stamps data-oral-mapping');
assert.ok(
  oralUi.includes('forceRemount: true') && oralUi.includes('mappingId: mid'),
  'openVoiceOralSettings forceRemounts habit mapping'
);

assert.ok(
  rail.includes('wantMid') && rail.includes('liveMid') && /wantMid\s*!==\s*liveMid/.test(rail),
  'rail remounts oral editor when mappingId changes'
);

const keys = read('src/js/features/mapping/keys-channel-command-picker.js');
assert.ok(keys.includes('mountLoader'), 'keys uses oral loader');
assert.ok(keys.includes('renderOralLoaderHtml'), 'keys falls back to loader html');
assert.ok(
  /startTrigger\(\s*mid\s*,\s*\{\s*slot:\s*['"]oral['"]\s*\}\s*\)/.test(keys) ||
    /startTrigger\(mid,\s*\{\s*slot:\s*['"]oral['"]\s*\}\)/.test(keys),
  'keys oral record forces slot oral'
);
assert.ok(
  /never copy|Never copy habit into oral|channels record separately/i.test(keys),
  'legacy oral migrate must not copy dictation key'
);
assert.ok(
  !/migrateLegacyOralGesture[\s\S]{0,800}scheme\.triggerKey\s*=\s*(raw|habitRaw)/.test(keys),
  'migrate must not assign habit.triggerKey into oral'
);
const kb = read('src/js/core/app-keyboard.js');
assert.ok(kb.includes("mapped='XButton1'") || kb.includes("mapped='XButton1'"), 'probe maps button3→XButton1');
const recIn = read('src/js/features/mapping/mapping-recording-input.js');
assert.ok(
  /page-side[\s\S]{0,500}invokeFrontendKeydownBackup/.test(recIn),
  'page side-button sends native capture backup'
);

const router = read('src-tauri/src/voice_command_router.rs');
assert.ok(router.includes('soft_oral_default_on'), 'router soft defaults helper');
assert.ok(router.includes('oral_item_enabled(scheme.as_ref(), &id, false)'), 'prompt/bind default off');
assert.ok(
  /"continue"\s*\|\s*"newThread"\s*\|\s*"cancelListen"/.test(router)
    || /"continue"[\s\S]{0,80}"newThread"/.test(router),
  'soft oral defaults include continue/newThread (ARM_HINT)'
);
assert.ok(
  !/need_composer_aim\(\)[\s\S]{0,280}return Some\(skip\("请先圈选/.test(router),
  'oral continue/send must not hard-skip on need_composer_aim'
);
assert.ok(
  /need_composer_aim\(\)[\s\S]{0,500}abort_if_open/.test(router),
  'need_composer_aim clears calibrate cover then aims'
);

const session = read('src-tauri/src/voice_command_session.rs');
assert.ok(session.includes('soft_oral_default_on'), 'session soft defaults');
assert.ok(session.includes('hold_session_down'), 'hold-to-listen down');
assert.ok(session.includes('hold_session_up'), 'hold-to-listen up');
assert.ok(session.includes('HOLD_SAFETY_WINDOW_MS'), 'hold safety window');
assert.ok(session.includes('HOLD_RELEASE_GRACE_MS'), 'hold release ASR grace');
// Visual chrome before reclaim_mic / activate — lag used to hide hold feedback.
{
  const begin = session.indexOf('pub fn begin_session');
  const body = session.slice(begin, begin + 4500);
  const pushAt = body.indexOf('push_state(app, state.as_ref())');
  const reclaimAt = body.indexOf('reclaim_mic_from_voice_ime');
  assert.ok(pushAt > 0 && reclaimAt > pushAt, 'begin_session pushes Soft Pad before reclaim_mic');
}

const dispatch = read('src-tauri/src/ipc/runtime_dispatch.rs');
assert.ok(dispatch.includes('hold_session_down'), 'physical oral arm uses hold down');
assert.ok(dispatch.includes('hold_session_up'), 'physical oral arm uses hold up');
assert.ok(
  dispatch.includes('normalized_activation_mode'),
  'oral activation mode comes from explicit mapping config'
);
assert.ok(
  /let toggle = activation_mode == "toggle"\s*\|\|\s*is_side/.test(dispatch),
  'side-button oral uses toggle (hold would flash panel on tap)'
);
// Soft Pad mic: explicit route hold mode ends on pointerup; legacy routes may toggle.
assert.ok(
  /pushToTalk[\s\S]{0,1300}route\.is_hold[\s\S]{0,500}hold_session_down/.test(dispatch),
  'Soft Pad pushToTalk honors hold-to-talk route'
);
assert.ok(
  dispatch.includes('voice_command_hold_up'),
  'Soft Pad pushToTalk releases oral listen on key_up'
);
// Recording owns the wire — oral must not arm / Soft Pad mic must not toggle.
assert.ok(
  /fn try_dispatch_oral_trigger[\s\S]{0,350}is_recording_session_active\(\)/.test(dispatch),
  'try_dispatch_oral_trigger refuses while recording'
);
assert.ok(
  /pushToTalk[\s\S]{0,700}recording_blocks_oral/.test(dispatch),
  'Soft Pad pushToTalk refuses while recording'
);
const recSession = read('src-tauri/src/ipc/commands/recording/session.rs');
assert.ok(
  /force_cancel[\s\S]{0,80}record_arm/.test(recSession) ||
    /force_cancel[\s\S]{0,80}record_start/.test(recSession),
  'arm/start recording force_cancels oral listen'
);
assert.ok(
  /session_begin blocked — recording owns wire/.test(session),
  'begin_session refuses Soft Pad oral while recording'
);
const recJs = read('src/js/features/mapping/mapping-recording.js');
assert.ok(
  /Arm RECORDING_SESSION before showing/.test(recJs) ||
    /invokeStartRecording[\s\S]{0,500}setRecording\('trigger'\)/.test(recJs),
  'trigger record arms backend before showing modal'
);
assert.ok(
  /invokeArmRecordingWire\([\s\S]{0,80}startMode\)\.then\([\s\S]{0,120}invokeStartRecording/.test(
    recJs
  ),
  'trigger record awaits arm (with mode) before start'
);
assert.ok(
  /cmd_arm_recording_wire[\s\S]{0,120}mappingId/.test(recJs),
  'arm IPC passes mappingId for startPending FE backup'
);
// Modal must not precede invokeStartRecording (side-button→oral race).
assert.ok(
  !/setRecording\('trigger'\);\s*hooks\(\)\.pushLog\('\[record\] start trigger/.test(recJs),
  'trigger modal must not open before cmd_start_recording'
);
assert.ok(
  recSession.includes('arm_recording_session'),
  'cmd_start_recording arms RECORDING_SESSION'
);
const hotkey = read('src-tauri/src/hotkey_win.rs');
assert.ok(
  hotkey.includes('pub fn is_recording_session_active'),
  'hotkey exposes is_recording_session_active'
);
assert.ok(
  /is_side && session_active[\s\S]{0,800}return 1/.test(hotkey),
  'mouse hook swallows named XButtons into recording channel while session active'
);
assert.ok(
  /record_empty_data_unnamed — pass to FE page backup/.test(hotkey),
  'unnamed XButton during recording passes to FE page backup (Logitech)'
);
assert.ok(
  hotkey.includes('prime_recording_sender'),
  'prearm primes recording_sender before StartRecording'
);
assert.ok(
  hotkey.includes('fn xbutton_name_from_empty_up'),
  'empty mouseData UP uses pure identity helper'
);
assert.ok(
  !/if is_x_up \{\s*sync_async_xbutton_latch_from_vk\(\);\s*None/.test(hotkey),
  'empty UP must not silently sync latch and drop the edge'
);
assert.ok(
  hotkey.includes('fn try_xbutton_orphan_release'),
  'poll orphan release recovers stuck ACTIVE_MASK'
);
assert.ok(
  hotkey.includes('fn xbutton_name_from_held_vk'),
  'empty mouseData during record can name via held VK'
);
const feCaptureRs = read('src-tauri/src/ipc/commands/recording/capture.rs');
assert.ok(
  feCaptureRs.includes('fe_recover'),
  'cmd_frontend_keydown recovers recording for page-side side-button backup'
);
const recInput = read('src/js/features/mapping/mapping-recording-input.js');
assert.ok(
  /fe-backup/.test(recInput) && /mvp_frontend_keydown/.test(recInput),
  'FE side-button backup probes and has webview postMessage fallback'
);
assert.ok(
  /oral_arm[\s\S]{0,80}edge key=|log_line\([\s\S]{0,40}"oral_arm"/.test(dispatch),
  'oral arm logs side-button dispatch for first-press diagnosis'
);
assert.ok(
  /fn try_dispatch_named_pad[\s\S]{0,400}RECORDING_SESSION/.test(hotkey),
  'named Soft Pad routes refuse while recording'
);
assert.ok(
  /oral_arm_owns_physical_key[\s\S]{0,200}try_dispatch_named_pad|try_dispatch_named_pad[\s\S]{0,400}oral_arm_owns_physical_key/.test(
    hotkey
  ),
  'Keys oral unique key wins Soft Pad named routes before micro fire'
);
// Soft Pad pushToTalk source_key must fire micro (oral listen) when oral does not own the key.
assert.ok(
  !/must NOT open Soft Pad[\s\S]{0,120}pushToTalk/.test(hotkey),
  'Soft Pad pushToTalk source_key may summon Soft Pad oral listen'
);
assert.ok(
  /recording_blocks_soft_pad/.test(dispatch),
  'fire_codex_micro_pad_key refuses Soft Pad while recording'
);

assert.ok(router.includes('handle_detection_ex'), 'oral latch via handle_detection_ex');
const vosk = read('src-tauri/src/voice_vosk_runtime.rs');
assert.ok(
  /handle_detection_ex\(\s*&state2,\s*&app2,\s*&detection,\s*true/.test(vosk),
  'vosk oral path latches armed=true across spawn'
);

assert.ok(
  keys.includes('keysOralArmBoundPulse') &&
    (keys.includes('按住 {key} 收听命令，抬起停止') || keys.includes('keysOralArmBound')),
  'keys oral arm copy: hold/release + side-key pulse toggle'
);
assert.ok(
  keys.includes('keysOralArmNeedKey') && keys.includes('data-oral-activation'),
  'keys oral UI exposes explicit activation mode'
);
assert.ok(
  oralUi.includes('activationMode') && oralUi.includes('keysOralArmNeedKey'),
  'voice oral loader reads explicit activation mode'
);

const finishRs = read('src-tauri/src/ipc/recording/hardware/finish.rs');
assert.ok(
  finishRs.indexOf('is_spurious_trigger_capture') <
    finishRs.indexOf('let _recording_exit_guard = RecordingExitGuard'),
  'RecordingExitGuard arms only after validation (Logitech FE backup must not hit silent not_recording)'
);
assert.ok(
  /Dictation 01 only[\s\S]{0,120}if is_trigger[\s\S]{0,200}softpad_occupied/.test(finishRs),
  'softpad_occupied rejects dictation trigger only (oral may steal)'
);
assert.ok(
  !/if is_oral_trigger[\s\S]{0,80}softpad_occupied/.test(finishRs),
  'oral trigger must not hard-reject softpad_occupied'
);

const applyRs = read('src-tauri/src/ipc/recording/apply.rs');
assert.ok(
  applyRs.includes('clear_soft_pad_source_for_physical') &&
    /fn clear_soft_pad_source_for_physical[\s\S]{0,800}route\.source_key\.clear\(\)/.test(applyRs),
  'oral capture clears Soft Pad source_key on every mapping (incl. global)'
);
assert.ok(
  applyRs.includes('oral_capture_clears_global_soft_pad_side_button'),
  'unit test covers global Soft Pad XButton steal'
);
assert.ok(
  keys.includes('clearSoftPadSourceForOralKey') &&
    /setOralTriggerKey[\s\S]{0,400}clearSoftPadSourceForOralKey/.test(keys) &&
    /clearSoftPadSourceForOralKey[\s\S]{0,500}config\(\)\.mappings/.test(keys),
  'FE setOralTriggerKey clears Soft Pad source on all mappings before save'
);

const recInOral = read('src/js/features/mapping/mapping-recording-input.js');
assert.ok(
  /if\s*\(\s*oralSlot\s*\)\s*\{[\s\S]{0,220}?invokeFrontendKeydownBackup[\s\S]{0,120}?armReconcileWatchdog[\s\S]{0,80}?return;/.test(
    recInOral
  ),
  'oral page-side waits for backend commit (no early finish→Soft Pad steal)'
);
assert.ok(
  finishRs.includes('disarm_recording_session'),
  'hardware finish disarms RECORDING_SESSION before Soft Pad rebind'
);
const hotkeyRs = read('src-tauri/src/hotkey_win.rs');
assert.ok(
  /oral_arm_owns_physical_key[\s\S]{0,200}try_dispatch_named_pad|try_dispatch_named_pad[\s\S]{0,400}oral_arm_owns_physical_key/
    .test(hotkeyRs),
  'named Soft Pad refuses keys owned by oral arm'
);

const keysPanel = read('src/js/features/settings/keys-panel-ui.js');
assert.ok(
  keysPanel.includes('keysRecordingTriggerOral') &&
    /triggerSlot\(\)\s*===\s*['"]oral['"]/.test(keysPanel),
  'recording feedback uses oral-specific hint when slot is oral'
);
assert.ok(
  read('src/js/core/i18n.js').includes('keysRecordingTriggerOral'),
  'i18n defines keysRecordingTriggerOral'
);

const bind = read('src/js/features/voice/voice-ui-bindings.js');
assert.ok(
  bind.includes('openVoiceOralSettings'),
  'bridge opens oral via openVoiceOralSettings (habit forceRemount)'
);

console.log('smoke-oral-command-ia: ok');
