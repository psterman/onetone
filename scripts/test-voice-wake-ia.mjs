/**
 * Open page IA: two goal tabs + open-app inline acoustic rehost.
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
assert.ok(/data-phrase-kind="text"/.test(html), 'has data-phrase-kind=text');
assert.ok(/data-phrase-kind="app"/.test(html), 'has data-phrase-kind=app');
assert.ok(html.includes('id="voiceWakeAcousticHost"'), 'keeps voiceWakeAcousticHost');
assert.ok(html.includes('id="voiceWakeInputTarget"'), 'has voiceWakeInputTarget');
assert.ok(!html.includes('voiceWakePhraseSuggestions'), 'no suggestions');

const wakeRender = read('src/js/features/voice/voice-step-wake-render.js');
assert.ok(
  /kind===['"]sound['"][\s\S]{0,80}__vp_voice_wake_kind__\s*=\s*['"]text['"]/.test(wakeRender),
  'syncWakePhraseKind forces sound → text'
);
assert.ok(!/OneToneVoiceWakeAcoustic/.test(wakeRender), 'wake-render does not mount VoiceWakeAcoustic');
assert.ok(/data-open-app-acoustic-act/.test(wakeRender), 'cards emit data-open-app-acoustic-act');
assert.ok(/data-open-app-acoustic-host/.test(wakeRender), 'cards emit inline acoustic host marker');
assert.ok(!/voiceOpenAppKeysRecord/.test(wakeRender), 'no KeysRecord CTA in wake-render');
assert.ok(/findAppScenarioByAppId/.test(wakeRender), 'resolves app-scenario mappings');

const bindings = read('src/js/features/voice/voice-ui-bindings.js');
assert.ok(/data-open-app-acoustic-act/.test(bindings), 'bindings handle acoustic acts');
assert.ok(!/data-open-app-keys/.test(bindings), 'no open-app-keys jump binding');
assert.ok(/setInlineContext|mappingId/.test(bindings), 'bindings pass mapping context');
assert.ok(/testOnce/.test(bindings), 'open-app test uses testOnce IPC');
assert.ok(!/setMatchWatch\(\{[\s\S]*?scenarioId:mappingId/.test(bindings), 'open-app test does not use setMatchWatch');

const habitCmd = read('src/js/features/mapping/habit-scenario-voice-command.js');
assert.ok(/function setInlineContext/.test(habitCmd), 'has setInlineContext');
assert.ok(/clearInlineContext/.test(habitCmd), 'has clearInlineContext');
assert.ok(/inlineCtx/.test(habitCmd), 'scenarioContextId prefers inlineCtx');
assert.ok(
  /function updateRecordVis\(\)\{[\s\S]*?var host=ensureHost\(\);[\s\S]*?host\.querySelector\(['"]#habitAcousticRecordBars['"]\)/.test(habitCmd),
  'updateRecordVis scopes bars via ensureHost'
);
assert.ok(
  /function applyBarScales\([^)]*\)\{[\s\S]*?var host=ensureHost\(\);[\s\S]*?host\.querySelector\(['"]#habitAcousticRecordBars['"]\)/.test(habitCmd),
  'applyBarScales scopes bars via ensureHost'
);
assert.ok(
  !/\$\(\s*['"]habitAcousticRecordBars['"]\s*\)/.test(habitCmd),
  'no global $ habitAcousticRecordBars lookup'
);
assert.ok(
  /#habitAcousticRecordPanel[\s\S]*?data-ui-phase/.test(habitCmd)
    && /getAttribute\(['"]data-ui-phase['"]\)===phase/.test(habitCmd),
  'paint skips rebuild when record panel phase matches'
);
assert.ok(
  /habitAcousticRecordMeterHost \.habit-voice-cmd-meter/.test(habitCmd),
  'updateRecordVis uses MeterHost meter'
);
assert.ok(
  !/querySelector\(['"]#habitAcousticRecordMeter['"]\)/.test(habitCmd),
  'no missing #habitAcousticRecordMeter id lookup'
);
assert.ok(/function isBusy\(/.test(habitCmd), 'has isBusy');
assert.ok(/data-acoustic-app-badge/.test(habitCmd), 'record/done panels emit app badge');
assert.ok(/notifyChange\(\)/.test(habitCmd) && /function endSessionToIdle[\s\S]*?notifyChange\(\)/.test(habitCmd),
  'endSessionToIdle notifies for card refresh');

assert.ok(
  /isBusy[\s\S]*?data-open-app-acoustic-host[\s\S]*?return;/.test(wakeRender),
  'renderOutputSummon skips wipe while busy expanded host'
);
assert.ok(
  /cmdBusy[\s\S]*?OneToneHabitScenarioVoiceCommand\.render/.test(wakeRender)
    || /isBusy[\s\S]*?HabitScenarioVoiceCommand\.render/.test(wakeRender),
  'syncScenarioVoiceEditor skips command render when busy'
);

assert.ok(
  /isBusy\?cmd\.isBusy\(\)/.test(bindings),
  'open-app onChange skips refresh while busy'
);

assert.ok(
  /barsCls='habit-voice-cmd-rec-bars is-active'/.test(habitCmd)
    || /barsCls="habit-voice-cmd-rec-bars is-active"/.test(habitCmd),
  'record bars omit mic-level-bars'
);
assert.ok(!/mic-level-bars habit-voice-cmd-rec-bars/.test(habitCmd), 'no mic-level-bars on habit record bars');
assert.ok(/is-armed-idle/.test(habitCmd), 'armed adds is-armed-idle');
assert.ok(/Math\.max\(speech,\s*elapsed\)/.test(habitCmd), 'meter fill uses max(speech,elapsed)');
assert.ok(/Math\.pow\(norm\*/.test(habitCmd), 'levelToBarScales applies gain curve');
assert.ok(/ponytail:[\s\S]*no PCM|ceiling=no PCM/.test(habitCmd), 'recording breath notes PCM ceiling');
assert.ok(/habitAcousticCmdPhaseSpeakNow/.test(habitCmd), 'title follows waiting hint');
assert.ok(!/habit-voice-cmd-rec-ring/.test(habitCmd), 'record panel omits persistent ring');
assert.ok(/habit-voice-cmd-m3-spinner/.test(habitCmd), 'processing uses m3 spinner');
assert.ok(/habit-voice-cmd-meter-zone/.test(habitCmd), 'duration meter recommend zone');
assert.ok(!/Math\.sin\(elapsed/.test(habitCmd), 'no fake sine level while waiting for PCM');
assert.ok(/buildMicBars\(25\)/.test(habitCmd), 'center-wave uses denser bars');
assert.ok(/habitAcousticCmdRecordZoneRange/.test(habitCmd), 'meter uses recommend range label');
assert.ok(/habitAcousticCmdProcessingAi/.test(habitCmd), 'processing shows AI caption');
assert.ok(/habitAcousticCmdRecordTipLive/.test(habitCmd), 'recording tip matches prototype');
assert.ok(/is-m3/.test(habitCmd), 'record panel marks M3 layout');

const appCss = read('src/css/app.css');
assert.ok(
  /#habitAcousticRecordBars\.habit-voice-cmd-rec-bars span/.test(appCss),
  'CSS targets #habitAcousticRecordBars habit bars'
);
assert.ok(/habitVoiceCmdBarsIdle/.test(appCss), 'armed idle keyframes exist');
assert.ok(/is-armed-idle/.test(appCss), 'armed idle CSS class');
assert.ok(/transform-origin:\s*center/.test(appCss), 'bars use center transform-origin');
assert.ok(/--m3-primary:\s*var\(--primary\)/.test(appCss), 'recording card primary follows app theme');
assert.ok(!/--m3-success:\s*#6bcf8e/.test(appCss), 'no neon success green on dark recording card');
assert.ok(
  /#habitAcousticRecordBars\.habit-voice-cmd-rec-bars\.is-good span\{background:var\(--m3-primary\)\}/.test(appCss),
  'good bars use primary not success green'
);
assert.ok(/border-radius:\s*28px/.test(appCss), 'M3 extra-large card radius');
assert.ok(/habit-voice-cmd-m3-spinner/.test(appCss), 'spinner CSS present');
assert.ok(/habit-voice-cmd-meter-zone/.test(appCss), 'recommend zone CSS present');
assert.ok(
  /prefers-reduced-motion:reduce[\s\S]*habit-voice-cmd-m3-spinner/.test(appCss),
  'reduced-motion disables spinner'
);
assert.ok(/html\[data-theme="dark"\][\s\S]*--m3-surface:/.test(appCss), 'dark theme M3 surface tokens');
assert.ok(/habit-voice-cmd-meter-dot/.test(appCss), 'recommend zone dot marker');

const matcher = read('src/js/features/voice/voice-acoustic-matcher.js');
assert.ok(/setMatchWatch/.test(matcher), 'matcher has setMatchWatch');
assert.ok(/acoustic_voice_matched/.test(matcher), 'matcher listens for acoustic_voice_matched');
assert.ok(!/acoustic_voice_tested/.test(matcher), 'matcher ignores acoustic_voice_tested');

assert.ok(/voiceOpenAppCapLaunchable|capabilityLabel/.test(wakeRender), 'capability status on cards');
assert.ok(/data-open-app-acoustic-act="play"/.test(wakeRender), 'cards emit play/replay act');
assert.ok(/voiceOpenAppReplay/.test(wakeRender), 'cards use replay label key');
assert.ok(/voiceOpenAppNoteLbl/.test(wakeRender), 'note label for displayText');
assert.ok(/playOpenAppAcousticPreview|setSuspend\(true\)/.test(bindings), 'replay suspends matching');
assert.ok(/voiceOpenAppTestLaunchFailed|app_launch_failed/.test(bindings), 'test handles launch failure');
assert.ok(/habitAcousticCmdLaunchFailed|app_launch_failed/.test(matcher), 'matcher launch-fail toast');

const i18n = read('src/js/core/i18n.js');
assert.ok(/voiceOpenAppRecord:\s*['"]录制声音口令['"]/.test(i18n), 'record CTA');
assert.ok(/voiceOpenAppReplay:\s*['"]回听录音['"]/.test(i18n), 'replay CTA');
assert.ok(/voiceOpenAppTestPrompt:\s*['"]请说出口令，识别后会打开或切换到该应用['"]/.test(i18n), 'test prompt');
assert.ok(/habitAcousticCmdLaunchFailed:\s*['"]已识别口令，但找不到\/无法启动应用['"]/.test(i18n), 'launch fail toast');
assert.ok(!/voiceOpenAppKeysRecord:\s*['"]去按键页录口令['"]/.test(i18n), 'no KeysRecord primary CTA string');

const acousticCfg = read('src-tauri/src/config.rs');
assert.ok(/previewPcmB64/.test(acousticCfg), 'sample has previewPcmB64');
assert.ok(/ACOUSTIC_PREVIEW_MAX/.test(acousticCfg), 'preview max constant');
assert.ok(/normalize_preview_pcm_b64/.test(acousticCfg), 'preview normalize fn');

const chatWf = read('src-tauri/src/app_chat_workflow.rs');
assert.ok(/Programs\\\\Cursor\\\\Cursor\.exe/.test(chatWf), 'Cursor LocalAppData launch path');
assert.ok(/launch_codex_store_app|shell:AppsFolder|launch_start_menu_shortcut/.test(chatWf), 'Codex store launch path');
assert.ok(/resolve_launch_hint|probe_uninstall_exe|Qoder\.exe/.test(chatWf), 'Qoder launch probe');
assert.ok(/AppLaunchCapability|launchable|focus_only/.test(chatWf), 'launch capability enum');
assert.ok(!/WindowsApps\\\\OpenAI\.Codex.*ChatGPT\.exe/.test(chatWf) || /do not ShellExecute WindowsApps/.test(chatWf), 'Codex avoids raw WindowsApps exe as primary');

const catalog = read('src-tauri/src/builtin_app_catalog.rs');
assert.ok(/qoder-chat/.test(catalog), 'catalog includes qoder');
assert.ok(/text_summon_preset:\s*false/.test(catalog), 'qoder without text summon preset');

const endRt = read('src-tauri/src/voice_end_runtime.rs');
assert.ok(/AcousticExecuteMode/.test(endRt), 'Live/Test execute modes');
assert.ok(/open-app-acoustic/.test(endRt), 'open-app kind gate');

const acousticIpc = read('src/js/features/voice/voice-acoustic-ipc.js');
assert.ok(/cmd_acoustic_voice_command_test_once/.test(acousticIpc), 'FE invokes test_once');
assert.ok(/open-app-acoustic/.test(habitCmd), 'inline record writes open-app-acoustic kind');

const send = read('src/js/features/voice/voice-step-send-render.js');
assert.ok(/function syncPhraseKindTabs[\s\S]*?allowed\[/.test(send), 'whitelist syncPhraseKindTabs');

console.log('PASS voice-wake-ia');
