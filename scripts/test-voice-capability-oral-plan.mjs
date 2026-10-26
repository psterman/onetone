/**
 * Soft Pad oral capability plan: Vosk STT only (no SAPI/KWS fallback).
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const plan = require(join(root, 'src/js/features/voice/voice-capability-plan.js'));
const dock = readFileSync(join(root, 'src/js/features/now/home-agent-v2-dock.js'), 'utf8');
const wake = readFileSync(join(root, 'src/js/features/voice/voice-wake.js'), 'utf8');
const sess = readFileSync(join(root, 'src-tauri/src/voice_command_session.rs'), 'utf8');
const i18n = readFileSync(join(root, 'src/js/core/i18n.js'), 'utf8');
const html = readFileSync(join(root, 'src/index.html'), 'utf8');

assert.equal(plan.oralVoicePlan({ voskInstalled: true }).action, 'switch_auto');
assert.equal(
  plan.oralVoicePlan({ voskInstalled: false, recommendedSoftPad: 'sapi_fallback' }).action,
  'download'
);
assert.equal(
  plan.oralVoicePlan({ voskInstalled: false, sapiZhAvailable: true }).action,
  'download'
);
assert.equal(plan.oralVoicePlan({ voskInstalled: false, sapiZhAvailable: false }).action, 'download');
assert.equal(plan.oralVoicePlan(null).action, 'switch_auto');
assert.ok(!wake.includes("action==='use_sapi'"), 'wake must not route Soft Pad oral to SAPI');
assert.ok(
  wake.includes('Vosk STT only') || wake.includes('needVoskDownload'),
  'wake Soft Pad oral is Vosk-only'
);
assert.ok(
  /no sapi\/kws fallback/.test(sess) && /borrow auto\/vosk/.test(sess),
  'rust oral_temp_engine is vosk-only'
);
assert.ok(!/advanced\/sapi/.test(sess), 'rust oral must not borrow SAPI');

const strip = plan.capabilityStripPlan({
  recommendedWake: 'none',
  needVoskDownload: true,
  reasons: [{ code: 'vosk_model_missing', messageKey: 'voiceCapReasonVoskMissing' }]
});
assert.equal(strip.summaryKey, 'voiceCapSummaryWakeNone');
assert.equal(strip.showDownload, true);

assert.ok(dock.includes('oralVoicePlan') || dock.includes('ensureOralWithCapability') || dock.includes('probeVoiceCapability'), 'dock uses capability path');
assert.ok(wake.includes('probeVoiceCapability') || wake.includes('ensureOralWithCapability'), 'wake exports probe');
assert.ok(html.includes('id="voiceCapabilityStrip"'), 'capability strip markup');
assert.ok(i18n.includes('voiceCapReasonVoskMissing'), 'i18n vosk missing');
assert.ok(i18n.includes('voiceCapDownloadCta'), 'i18n download cta');

console.log('test-voice-capability-oral-plan: ok');
