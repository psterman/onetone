/**
 * QS voice practice stage: practice box = IME only; end phrase uses PhrasePractice modal.
 * practice_hold_fg still blocks regular send_wake_to_target.
 */
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'src/index.html'), 'utf8');
const js = readFileSync(join(root, 'src/js/features/home/habit-trigger-setup.js'), 'utf8');
const i18n = readFileSync(join(root, 'src/js/core/i18n.js'), 'utf8');
const css = readFileSync(join(root, 'src/css/app.css'), 'utf8');
const mockPath = join(root, 'design-mock/voice-practice-stage-preview.html');
const buildRs = readFileSync(join(root, 'src-tauri/build.rs'), 'utf8');
const appIpc = readFileSync(join(root, 'src-tauri/permissions/app-ipc.toml'), 'utf8');
const endRt = readFileSync(join(root, 'src-tauri/src/voice_end_runtime.rs'), 'utf8');
const appCmd = readFileSync(join(root, 'src-tauri/src/ipc/commands/runtime/app.rs'), 'utf8');

assert.ok(html.includes('id="habitSetupVoicePracticeStage"'), 'stage markup');
assert.ok(html.includes('id="habitSetupVoicePracticeInput"'), 'practice input');
assert.ok(!/id="habitSetupVoicePracticeInput"[^>]*\breadonly\b/.test(html), 'practice input editable');
assert.ok(html.includes('系统语音输入法转化的文字会出现在这里'), 'html placeholder: IME text only');
assert.ok(html.includes('id="phrasePracticeOverlay"'), 'end phrase overlay exists');

assert.ok(js.includes('setVoicePracticeHoldFg(true)'), 'hold fg on enter');
assert.ok(js.includes('setVoicePracticeHoldFg(false)'), 'clear hold fg on exit');
assert.ok(!js.includes('writeVoicePracticeHeard'), 'no ASR write into practice box');
assert.ok(js.includes('startVoicePracticeLiveDictation'), 'live dictation chrome');
assert.ok(js.includes('activateVoicePracticeIme'), 'wake → local IME activate helper');
assert.ok(js.includes('bindVoicePracticeEndModal'), 'end phrase modal helper');
assert.ok(js.includes("cmd_voice_practice_activate_ime"), 'invoke practice activate IME');
assert.ok(js.includes('onVoicePracticeWakeMatched'), 'wake match handler');

const wakeFn = js.slice(js.indexOf('function onVoicePracticeWakeMatched'));
const wakeBody = wakeFn.slice(0, wakeFn.indexOf('function onVoicePracticeEndMatched'));
assert.ok(wakeBody.includes('activateVoicePracticeIme()'), 'wake match calls activate');
assert.ok(!wakeBody.includes('bindVoicePracticeEndModal()'), 'wake match does NOT open end modal');
assert.ok(wakeBody.includes('exitVoicePracticeStage'), 'wake match returns to dual panels');
assert.ok(wakeBody.includes("activeVoiceLesson='end'"), 'wake match points user to end panel');
assert.ok(!js.includes('OneTone 听写中'), 'no fake snippet carousel');

const endModalFn = js.slice(js.indexOf('function bindVoicePracticeEndModal'));
const endModalBody = endModalFn.slice(0, endModalFn.indexOf('function qsVoiceDualPanelGuideText')>=0?endModalFn.indexOf('function qsVoiceDualPanelGuideText'):endModalFn.indexOf('function onVoicePracticeWakeMatched'));
assert.ok(endModalBody.includes('embedded:false'), 'end uses PhrasePractice modal not embed');
assert.ok(endModalBody.includes("mode:'end'"), 'end modal mode=end');

const wakeBind = js.slice(js.indexOf('function bindVoicePracticeStageListening'));
const wakeBindBody = wakeBind.slice(0, wakeBind.indexOf('function bindVoicePracticeEndModal'));
assert.ok(!wakeBindBody.includes('onHeardChange'), 'wake bind does not write ASR into box');
assert.ok(wakeBindBody.includes('embedded:true'), 'wake stays embedded on stage');
assert.ok(wakeBindBody.includes("hintText:''") || wakeBindBody.includes('hintText:""'), 'wake embed skips duplicate hint');
assert.ok(js.includes('field.hidden=true') && js.includes("bindVoicePracticeStageListening('wake')"), 'wake hides IME field');

const markFn = js.slice(js.indexOf('function markVoicePracticeStageDoneManual'));
const markBody = markFn.slice(0, markFn.indexOf('var triggerTestListener'));
assert.ok(!markBody.includes('onVoicePracticeWakeMatched()'), 'manual mark does not chain into wake→end');
assert.ok(!markBody.includes('onVoicePracticeEndMatched()'), 'manual mark does not auto-run end success');

assert.ok(i18n.includes('系统语音输入法转化的文字会出现在这里'), 'zh placeholder: IME only');
assert.ok(i18n.includes('口令已切换：请说结束词'), 'zh end hint: passphrase switched');
assert.ok(i18n.includes('qsVoicePanelGuideAfterWake'), 'after-wake guide key');
assert.ok(i18n.includes('点右侧') && i18n.includes('修改唤醒词'), 'zh next-step + customize hint');
assert.ok(js.includes('qsVoiceDualPanelGuideText'), 'dual panel guide helper');
assert.ok(css.includes('.habit-setup-voice-lessons[hidden]'), 'dual panels hide');

assert.ok(existsSync(mockPath), 'mock exists');

assert.ok(endRt.includes('pub fn send_wake_to_practice'), 'send_wake_to_practice exists');
assert.ok(endRt.includes('practice_local'), 'practice_local log marker');
assert.ok(endRt.includes('practice_hold_fg'), 'practice hold in send_wake');
assert.ok(!endRt.includes('no focus steal'), 'no global self-fg early block');

const sendFn = endRt.slice(endRt.indexOf('pub fn send_wake_to_target'));
const sendHead = sendFn.slice(0, sendFn.indexOf('pub fn send_wake_to_practice'));
assert.ok(sendHead.includes('voice_practice_hold_fg'), 'send_wake_to_target gated by practice hold');
assert.ok(sendHead.includes('return false'), 'hold_fg still blocks regular send');
assert.ok(!sendHead.includes('setup_interaction_active'), 'setup wizard does not blanket-block wake send');

const practiceFn = endRt.slice(endRt.indexOf('pub fn send_wake_to_practice'));
const practiceHead = practiceFn.slice(0, practiceFn.indexOf('pub struct VoiceWakeDispatchResult'));
assert.ok(!practiceHead.includes('restore_external_foreground'), 'practice path: no external FG restore');
assert.ok(!practiceHead.includes('focus_any_external_top_level'), 'practice path: no external focus');
assert.ok(practiceHead.includes('send_chord'), 'practice path sends chord');

assert.ok(appCmd.includes('cmd_voice_practice_activate_ime'), 'IPC command defined');
assert.ok(appCmd.includes('resolve_voice_input_target_key'), 'practice IME uses voice-input key');
assert.ok(buildRs.includes('cmd_voice_practice_activate_ime'), 'ACL lists practice activate');
assert.ok(buildRs.includes('cmd_voice_set_practice_hold_fg'), 'ACL lists practice hold');
assert.ok(appIpc.includes('allow-cmd-voice-practice-activate-ime'), 'app-ipc allows activate');
assert.ok(
  existsSync(join(root, 'src-tauri/permissions/autogenerated/cmd_voice_practice_activate_ime.toml')),
  'autogenerated permission'
);

const dispatch = readFileSync(join(root, 'src-tauri/src/ipc/runtime_dispatch.rs'), 'utf8');
const phys = dispatch.slice(dispatch.indexOf('pub fn dispatch_physical_event'));
const physHead = phys.slice(0, phys.indexOf('pub fn handle_physical_key'));
assert.ok(physHead.includes('voice_practice_hold_fg'), 'physical keys gated on practice stage');

const bridge = readFileSync(join(root, 'src/js/core/app-bridge.js'), 'utf8');
assert.ok(bridge.includes("w.engine==='kws'") || bridge.includes("fromKws"), 'practice heard supports kws');
assert.ok(bridge.includes('Engine label can lag') || bridge.includes('fromVosk(w.vosk)||fromKws'), 'heard fallback across engines');

const wakeJs = readFileSync(join(root, 'src/js/features/voice/voice-wake.js'), 'utf8');
assert.ok(wakeJs.includes('practicePhraseOpen'), 'status poll knows practice open');
assert.ok(wakeJs.includes('nudgeVoiceStatusPoll') || wakeJs.includes('nudgePoll'), 'practice can nudge poll');
assert.ok(wakeJs.includes('practiceOpen'), 'practice forces backend status probe');

const phraseJs = readFileSync(join(root, 'src/js/phrase-practice.js'), 'utf8');
assert.ok(phraseJs.includes('nudgePracticeVoicePoll'), 'phrase practice nudges voice poll');
assert.ok(phraseJs.includes('phrase-practice-section--say'), 'embedded say section');
assert.ok(phraseJs.includes('phrase-practice-section--hear'), 'embedded hear section');
assert.ok(phraseJs.includes('phrase-practice-section--alts'), 'embedded alts section');
const hearBlock = phraseJs.slice(phraseJs.indexOf('phrase-practice-section--hear'));
const hearHead = hearBlock.slice(0, hearBlock.indexOf('phrase-practice-section--alts'));
assert.ok(hearHead.includes('data-phrase-practice-preview-label'), 'preview-label lives in hear section');
assert.ok(!hearHead.includes('data-phrase-practice-phrase'), 'phrase hero not inside hear section');

assert.ok(i18n.includes('phrasePracticeSayLabel'), 'say label i18n');
assert.ok(i18n.includes('phrasePracticeAltsLabel'), 'alts label i18n');
assert.ok(i18n.includes("'请说'") || i18n.includes('请说'), 'zh say label');
assert.ok(css.includes('.phrase-practice-section--say') || css.includes('.phrase-practice-section'), 'section CSS');
assert.ok(css.includes('.phrase-practice-embedded .habit-setup-voice-preview'), 'embedded heard quieter than hero');
assert.ok(css.includes('.habit-setup-voice-practice-mark'), 'mark button spacing rule');

const sapiRt = readFileSync(join(root, 'src-tauri/src/voice_sapi_runtime.rs'), 'utf8');
assert.ok(
  sapiRt.includes('Feed PhrasePractice') || sapiRt.includes('voice_sapi_last_heard.lock() = phrase'),
  'sapi practice_hold still feeds lastHeard'
);

console.log('test-voice-practice-stage: ok');
