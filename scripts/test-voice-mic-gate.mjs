/**
 * Voice lesson no-mic soft skip: calm breath panel + continue / help link.
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
const mock = readFileSync(join(root, 'design-mock/quick-start-mic-skip-preview.html'), 'utf8');

assert.ok(html.includes('id="habitSetupVoiceMicGate"'), 'gate markup');
assert.ok(html.includes('habit-setup-voice-mic-soft'), 'soft panel');
assert.ok(html.includes('habit-setup-voice-mic-breath'), 'breath stage');
assert.ok(html.includes('habit-setup-voice-mic-breath__ring'), 'breath rings');
assert.ok(html.includes('habit-setup-voice-mic-copy__title'), 'in-panel title');
assert.ok(html.includes('id="btnHabitSetupVoiceMicContinue"'), 'continue button');
assert.ok(html.includes('id="btnHabitSetupVoiceMicRecheck"'), 'help link keeps recheck id');
assert.ok(html.includes('habit-setup-voice-mic-help-link'), 'help link class');
assert.ok(!html.includes('habit-setup-voice-mic-icon__slash'), 'slash mic removed');
assert.ok(!html.includes('habit-setup-voice-mic-soft-progress'), 'progress chrome removed');
assert.ok(!html.includes('habit-setup-voice-mic-parallel'), 'dual parallel removed');

assert.ok(js.includes("voiceMicGate:'pending'"), 'state init');
assert.ok(js.includes('function finishVoiceMicSoftSkip'), 'finishVoiceMicSoftSkip');
assert.ok(js.includes('function scheduleVoiceMicSoftSkip'), 'scheduleVoiceMicSoftSkip');
assert.ok(js.includes('VOICE_MIC_SOFT_SKIP_MS'), 'auto-advance ms');
assert.ok(js.includes('saveVoiceLesson()'), 'continues via saveVoiceLesson');
assert.ok(js.includes("setupState.voiceMicGate!=='ready'"), 'openVoiceLesson guard');
assert.ok(js.includes('habitSetupVoiceMicCopyTitle'), 'fills in-panel copy');
assert.ok(js.includes('habitSetupVoiceMicHelpTip'), 'help tip toast');
assert.ok(!js.includes('function chooseVoiceMicSkip'), 'old skip chooser removed');

assert.ok(i18n.includes("habitSetupVoiceMicGateTitle:'没找到麦克风'"), 'zh title');
assert.ok(i18n.includes("habitSetupVoiceMicGateTitle:'No microphone found'"), 'en title');
assert.ok(i18n.includes("habitSetupVoiceMicGateDesc:'用键盘和按键路径就好"), 'zh desc');
assert.ok(i18n.includes('habitSetupVoiceMicContinue'), 'continue i18n');
assert.ok(i18n.includes("habitSetupVoiceMicHelpLink:'如何接入麦克风？'"), 'help link i18n');

assert.ok(css.includes('.habit-setup-voice-mic-breath'), 'breath styles');
assert.ok(css.includes('vmgBreathRing'), 'ring animation');
assert.ok(css.includes('vmgCoreBreathe'), 'core breathe');
assert.ok(!css.includes('vmgSoftProgress'), 'old progress animation removed');
assert.ok(!css.includes('.habit-setup-voice-mic-parallel'), 'parallel css removed');

assert.ok(mock.includes('没找到麦克风'), 'mock title');
assert.ok(mock.includes('如何接入麦克风？'), 'mock help link');
assert.ok(existsSync(join(root, 'design-mock/quick-start-mic-skip-preview.html')), 'mock file');

console.log('test-voice-mic-gate: ok');
