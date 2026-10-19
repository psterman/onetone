/**
 * Smoke: P2 channel naming (rail / intent / L1 tray).
 * Run: node scripts/smoke-p2-channel-names.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const i18n = read('src/js/core/i18n.js');
assert.ok(i18n.includes("keysChannelTabKey:'自定义快捷键'"), 'zh Custom Shortcuts');
assert.ok(i18n.includes("keysChannelTabVoice:'口头命令'"), 'zh Oral commands channel');
assert.ok(i18n.includes("keysChannelTabCursor:'应用快捷键'"), 'zh App Shortcuts');
assert.ok(i18n.includes("keysChannelTabSoftPad:'软键盘'"), 'zh Soft Pad');
assert.ok(i18n.includes("keysChannelTabIme:'输入法'"), 'zh IME channel');
assert.ok(i18n.includes("voiceIntentIme:'输入法'"), 'zh voice intent IME');
assert.ok(i18n.includes("voiceIntentPrompt:'模板'"), 'zh Snippets');
assert.ok(i18n.includes("voiceIntentOral:'口头命令'"), 'zh oral = Oral commands');
assert.ok(i18n.includes("voiceStartBadgeOral:'口头起点'"), 'zh oral start badge');
assert.ok(
  read('src/js/features/voice/voice-intent-rail.js').includes("kind:'command'"),
  'rail start surface has command kind'
);
assert.ok(
  read('src/index.html').includes('id="voiceMatchChainWake"'),
  'match chain has wake prefix node'
);
assert.ok(i18n.includes("keysChannelTabKey:'Custom Shortcuts'"), 'en Custom Shortcuts');
assert.ok(i18n.includes("keysChannelTabVoice:'Oral'"), 'en Oral channel');
assert.ok(i18n.includes("keysChannelTabCursor:'App Shortcuts'"), 'en App Shortcuts');
assert.ok(i18n.includes("keysChannelTabSoftPad:'Soft Pad'"), 'en Soft Pad');
assert.ok(i18n.includes("keysChannelTabIme:'IME'"), 'en IME channel');
assert.ok(i18n.includes("voiceIntentPrompt:'Snippets'"), 'en Snippets');
assert.ok(i18n.includes("voiceIntentOral:'Oral commands'"), 'en oral intent');
assert.ok(!/keysChannelTabIme:'听写'/.test(i18n), 'zh ime no longer 听写');
assert.ok(!/keysChannelTabIme:'Dictation'/.test(i18n), 'en ime no longer Dictation');

const html = read('src/index.html');
assert.ok(html.includes('data-i18n="keysChannelTabKey">自定义快捷键'), 'keys rail key label');
assert.ok(html.includes('data-i18n="keysChannelTabVoice">口头命令'), 'keys rail voice label');
assert.ok(html.includes('data-i18n="keysChannelTabIme">输入法'), 'keys rail ime label');
assert.ok(/data-voice-intent="prompt"[\s\S]{0,120}>模板/.test(html), 'voice rail prompt');
assert.ok(/data-voice-intent="oral"[\s\S]{0,120}>口头命令/.test(html), 'voice rail oral');
assert.ok(/data-voice-intent="ime"[\s\S]{0,120}>输入法/.test(html), 'voice rail ime');
assert.ok(html.includes('data-start-kind="wake"'), 'start slim defaults to wake kind');

const tray = read('src/js/features/settings/tray-channel-controls.js');
assert.ok(
  tray.includes("softPad: '软键盘'") && tray.includes("camera: '手势'"),
  'tray L1 Soft Pad / Gestures'
);

const scene = read('src/js/features/mapping/keys-scene-actions-panel.js');
assert.ok(scene.includes("customKey: '自定义快捷键'"), 'scene dock customKey');
assert.ok(scene.includes("prompt: '模板'"), 'scene dock prompt');

console.log('smoke-p2-channel-names: ok');
