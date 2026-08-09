/**
 * Status / supervisor must not FS-probe on the hot path (hung ipc ~60s → 未响应).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const kws = read('src-tauri/src/voice_kws_runtime.rs');
assert.ok(/fn kws_readiness_cached/.test(kws), 'kws_readiness_cached');
assert.ok(/allow_fs: bool/.test(kws), 'cached_kws_probe allow_fs');
assert.ok(/probe_pending/.test(kws), 'probe_pending reason');

const boot = read('src-tauri/src/voice_bootstrap.rs');
assert.ok(/kws_readiness_cached/.test(boot), 'supervisor uses cached readiness');
assert.ok(/Never FS-probe here/.test(boot), 'supervisor no-FS comment');
assert.ok(
  /"resourceSaver" => \{[\s\S]*?EffectiveVoiceEngine::Vosk[\s\S]*?\}/.test(boot),
  'resourceSaver !kws → vosk (not none)'
);

const voskRt = read('src-tauri/src/voice_vosk_runtime.rs');
assert.ok(/cached_vosk_probe_opts[\s\S]*false\)/.test(voskRt), 'vosk status cache-only probe');

const voskCmd = read('src-tauri/src/ipc/commands/voice/vosk.rs');
assert.ok(/timeout\(std::time::Duration::from_millis\(1500\)/.test(voskCmd), 'vosk status timeout');
const sapiCmd = read('src-tauri/src/ipc/commands/voice/sapi.rs');
assert.ok(/timeout\(std::time::Duration::from_millis\(1500\)/.test(sapiCmd), 'sapi status timeout');

const runtimeInit = read('src-tauri/src/ipc/commands/runtime/init.rs');
assert.ok(/pub async fn cmd_request_runtime/.test(runtimeInit), 'request_runtime async');
assert.ok(/spawn_blocking/.test(runtimeInit), 'request_runtime spawn_blocking');
assert.ok(/timeout\(std::time::Duration::from_millis\(2000\)/.test(runtimeInit), 'request_runtime timeout');

const session = read('src/js/core/app-session.js');
assert.ok(/feWakeAlreadyMatchesStrategy/.test(session), 'fe wake skip request_runtime');
assert.ok(/falls back to Vosk when KWS/.test(session), 'resourceSaver vosk fallback match');

console.log('ok voice-status-no-fs-hang');
