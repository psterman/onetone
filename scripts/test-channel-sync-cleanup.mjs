// Guard: channel sync cleanup — empty CTAs, dead voice bridges, claim channel, camera adapter.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

const picker = read('src/js/features/mapping/keys-channel-command-picker.js');
const i18n = read('src/js/core/i18n.js');
const voiceKeys = read('src/js/features/voice/voice-bridge-keys.js');
const voicePad = read('src/js/features/voice/voice-bridge-softpad.js');
const scene = read('src/js/features/mapping/keys-scene-actions-panel.js');
const adapters = read('src/js/features/agent/action-binding-adapters.js');
const camPicker = read('src/js/features/camera/camera-action-picker.js');
const finish = read('src/js/features/mapping/key-finish-flow-render.js');
const presets = read('src/js/features/agent/semantic-action-presets.js');
const padUi = read('src/js/features/agent/codex-micro-pad-ui.js');

const voiceEmpty = picker.slice(
  picker.indexOf('keysPickOnlySetEmptyVoice'),
  picker.indexOf('keysPickOnlySetEmptyVoice') + 800
);
assert.match(voiceEmpty, /data-go-voice/);
assert.doesNotMatch(voiceEmpty, /data-go-softpad/);
assert.match(picker, /function guideToVoiceSettings/);
assert.match(i18n, /keysVoicePickGoVoice/);

assert.match(i18n, /keysPickOnlySetEmptyCamera:'还没有配好动作的手势/);
assert.doesNotMatch(
  i18n,
  /keysPickOnlySetEmptyCamera:'还没有已设按键的手势/
);

assert.match(padUi, /data-layout-go-voice/);
assert.match(i18n, /softPadLayoutGoVoice/);

assert.doesNotMatch(voiceKeys, /function applyPhrase/);
assert.doesNotMatch(voiceKeys, /function openEditPopover/);
assert.doesNotMatch(voiceKeys, /function ensureVoiceBinding/);
assert.match(voiceKeys, /function claimChannelForRow/);
assert.match(voiceKeys, /claimChannelForRow\(r\)/);
assert.match(voicePad, /Soft Pad face is explain-only/);

assert.match(scene, /function normalizeClaimChannel/);
assert.match(scene, /normalizeClaimChannel\(channel, bindingRef, actionId\)/);

assert.match(adapters, /mappingScoped/);
assert.match(adapters, /UI must call this upsert/);
assert.match(camPicker, /adapters\.camera/);
assert.doesNotMatch(camPicker, /persistBindActionMappingScoped/);
assert.match(finish, /adapters\.camera\.upsert/);
assert.doesNotMatch(finish, /persistBindActionMappingScoped/);
assert.match(presets, /A\.camera\.upsert|adapters\(\).*camera/);
assert.doesNotMatch(
  presets.slice(presets.indexOf('function upsertCameraMappingScoped'), presets.indexOf('function upsertOne')),
  /persistBindActionMappingScoped/
);

console.log('ok channel-sync-cleanup');
