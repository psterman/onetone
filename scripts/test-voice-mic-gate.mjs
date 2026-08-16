/**
 * Voice lesson no-mic soft skip: calm single panel + continue / auto-advance.
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
const mock = readFileSync(join(root, 'design-mock/voice-mic-soft-skip-preview.html'), 'utf8');

assert.ok(html.includes('id="habitSetupVoiceMicGate"'), 'gate markup');
assert.ok(html.includes('habit-setup-voice-mic-soft'), 'soft panel');
assert.ok(html.includes('id="btnHabitSetupVoiceMicContinue"'), 'continue button');
assert.ok(html.includes('id="btnHabitSetupVoiceMicRecheck"'), 'recheck weak link');
assert.ok(!html.includes('habit-setup-voice-mic-parallel'), 'dual parallel removed');
assert.ok(!html.includes('id="btnHabitSetupVoiceMicSkip"'), 'skip dual button removed');

assert.ok(js.includes("voiceMicGate:'pending'"), 'state init');
assert.ok(js.includes('function finishVoiceMicSoftSkip'), 'finishVoiceMicSoftSkip');
assert.ok(js.includes('function scheduleVoiceMicSoftSkip'), 'scheduleVoiceMicSoftSkip');
assert.ok(js.includes('VOICE_MIC_SOFT_SKIP_MS'), 'auto-advance ms');
assert.ok(js.includes('saveVoiceLesson()'), 'continues via saveVoiceLesson');
assert.ok(js.includes("setupState.voiceMicGate!=='ready'"), 'openVoiceLesson guard');
assert.ok(js.includes('cmd_acoustic_voice_command_preflight'), 'acoustic preflight');
assert.ok(!js.includes('function chooseVoiceMicSkip'), 'old skip chooser removed');

assert.ok(i18n.includes("habitSetupVoiceMicGateTitle:'暂时跳过语音测试'"), 'zh title');
assert.ok(i18n.includes("habitSetupVoiceMicGateTitle:'Skipping voice practice for now'"), 'en title');
assert.ok(i18n.includes('habitSetupVoiceMicContinue'), 'continue i18n');
assert.ok(i18n.includes("habitSetupVoiceMicRecheck:'我已接好麦克风'"), 'recheck weak link i18n');

assert.ok(css.includes('.habit-setup-voice-mic-soft'), 'soft styles');
assert.ok(css.includes('vmgSoftProgress'), 'progress animation');
assert.ok(!css.includes('.habit-setup-voice-mic-parallel'), 'parallel css removed');

assert.ok(mock.includes('暂时跳过语音测试'), 'mock title');
assert.ok(mock.includes('即将继续'), 'mock auto status');
assert.ok(existsSync(join(root, 'design-mock/voice-mic-soft-skip-preview.html')), 'mock file');

console.log('test-voice-mic-gate: ok');
