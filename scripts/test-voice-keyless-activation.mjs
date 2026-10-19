#!/usr/bin/env node
/**
 * Keyless voice (免按键语音) — config authority + tray/settings contracts.
 * Asserts: keyless off keeps PTT assist; mute path stops engines (source check);
 * activation migration; tray control exists; no second parallel state system.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const configRs = read('src-tauri/src/config.rs');
assert.match(configRs, /voice_activation/, 'VoiceConfig has voice_activation');
assert.match(configRs, /fn apply_voice_activation/, 'apply_voice_activation helper');
assert.match(configRs, /fn apply_keyless_wake/, 'apply_keyless_wake helper');
assert.match(
  configRs,
  /keyless_off_preserves_push_to_talk_assist/,
  'Rust test: keyless off preserves PTT'
);
assert.match(
  configRs,
  /Turning an engine strategy on implies assist; turning off must NOT kill PTT/,
  'strategy off must not clear assist'
);

const muteRs = read('src-tauri/src/ipc/commands/mic/mute.rs');
assert.match(muteRs, /stop_all_voice_engines/, 'mic mute stops all voice engines');
assert.match(muteRs, /mic_mute/, 'mute reason tagged');

const semanticRs = read('src-tauri/src/agent/semantic.rs');
assert.match(
  semanticRs,
  /ActionChannel::Voice, RiskLevel::Confirm \| RiskLevel::Dangerous/,
  'mid/high voice → PendingConfirmation'
);

const pendingRs = read('src-tauri/src/agent/pending_confirm.rs');
assert.match(
  pendingRs,
  /high_risk_requires_key_or_softpad/,
  'high-risk cannot complete via voice/camera'
);

const trayLayout = read('src/js/features/settings/tray-layout-v2.js');
assert.match(trayLayout, /id: 'voiceKeyless'/, 'tray catalog has voiceKeyless');
assert.match(trayLayout, /trayChVoiceKeyless/, 'tray label key for 免按键语音');

const trayCtrl = read('src/js/features/settings/tray-channel-controls.js');
assert.match(trayCtrl, /voiceKeyless/, 'tray controls handle voiceKeyless');
assert.match(trayCtrl, /cmd_voice_set_activation/, 'tray keyless uses activation IPC');
assert.match(
  trayCtrl,
  /Voice channel master: assist only/,
  'voiceMaster decoupled from KWS start'
);

const persist = read('src/js/core/config-persist.js');
assert.match(persist, /voiceActivation/, 'config-persist knows voiceActivation');
assert.match(persist, /pushToTalk/, 'default activation pushToTalk');

const island = read('src-islands/islands/voice-config-island.tsx');
assert.match(island, /wakeOrPushToTalk/, 'settings island activation radios');
assert.match(island, /ActivationSelector/, 'activation selector present');

const domain = read('src-islands/domain/voiceConfig.ts');
assert.match(domain, /setVoiceActivation/, 'domain setVoiceActivation');
assert.match(domain, /getVoiceActivation/, 'domain getVoiceActivation');

const typed = read('src-islands/ipc/typedIpc.ts');
assert.match(typed, /cmd_voice_set_activation/, 'typed IPC activation');

const i18n = read('src/js/core/i18n.js');
assert.match(i18n, /免按键语音/, 'i18n uses 免按键语音');
assert.doesNotMatch(
  i18n,
  /trayChVoiceMaster:'语音总开关'/,
  'avoid vague 语音总开关 for master'
);

const indexHtml = read('src/index.html');
assert.match(indexHtml, /免按键语音/, 'settings HTML label 免按键语音');
assert.match(indexHtml, /id="voiceWakeListeningOptInToggle"/, 'settings has keyless toggle');
{
  const troubleOpen = indexHtml.indexOf('class="voice-scheme-trouble-body"');
  const troubleClose = indexHtml.indexOf('</details>', troubleOpen);
  const troubleChunk =
    troubleOpen >= 0 && troubleClose > troubleOpen
      ? indexHtml.slice(troubleOpen, troubleClose)
      : '';
  assert.ok(troubleChunk, 'trouble body exists');
  assert.ok(
    !troubleChunk.includes('voiceWakeListeningOptInToggle'),
    'keyless toggle must not be buried under 听不准或太慢？'
  );
  assert.ok(
    indexHtml.indexOf('id="voiceWakeListeningOptInToggle"') <
      indexHtml.indexOf('id="voiceSchemeTrouble"'),
    'keyless toggle precedes trouble details on the strip'
  );
}

const semTest = read('src-tauri/tests/semantic_action.rs');
assert.match(semTest, /high_risk_voice_enters_awaiting_confirmation/, 'semantic high-risk voice test');
assert.match(semTest, /disallowed_channel_cannot_bind/, 'channel gate test');

const keylessJs = read('src/js/features/voice/voice-keyless-toggle.js');
assert.match(keylessJs, /OneToneVoiceKeyless/, 'shared keyless toggle API');
assert.match(keylessJs, /cmd_voice_set_activation/, 'shared toggle uses activation IPC');

const agentSlots = read('src/js/features/agent/agent-actions.js');
assert.match(agentSlots, /slotId: 'toggleVoiceKeyless'/, 'Soft Pad bindable slot toggleVoiceKeyless');

const padUi = read('src/js/features/agent/codex-micro-pad-ui.js');
assert.match(padUi, /toggleVoiceKeyless:\s*1/, 'Soft Pad slot allowlist includes toggleVoiceKeyless');
assert.match(padUi, /id: 'toggleVoiceKeyless'/, 'mini chrome tool includes 免按键语音');

const overlay = read('src/codex-micro-overlay.html');
assert.match(overlay, /toggleVoiceKeyless/, 'floating Soft Pad bar can toggle keyless');
assert.match(overlay, /toggleVoiceKeylessFromOverlay/, 'overlay FE toggles keyless');
assert.match(overlay, /withPinnedMiniSlots/, 'keyless is pinned on mini tools row');
assert.match(overlay, /overlay-mini__action-txt/, 'keyless shows 免按键 text on bar');

const dispatch = read('src-tauri/src/ipc/runtime_dispatch.rs');
assert.match(
  dispatch,
  /toggleVoiceKeyless/,
  'Soft Pad / hotkey fire path toggles keyless'
);

console.log('test-voice-keyless-activation.mjs ok');
