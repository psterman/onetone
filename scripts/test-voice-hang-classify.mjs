/**
 * classifyHang priority: stall > busy > mismatch > healthy.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { classifyHang, STALL_GAP_MS } = require(join(root, 'src/js/features/debug/voice-hang-classify.js'));

assert.equal(STALL_GAP_MS, 2000);
assert.equal(classifyHang({}), 'healthy');
assert.equal(classifyHang({ localGapMs: 400, desiredEngine: 'vosk', activeEngine: 'vosk' }), 'healthy');
assert.equal(classifyHang({ localGapMs: 2500 }), 'stall');
assert.equal(classifyHang({ pingAgeMs: 2100, activateBusy: true }), 'stall');
assert.equal(classifyHang({ ipcHeldMs: 2000 }), 'stall');
assert.equal(classifyHang({ activateBusy: true }), 'busy');
assert.equal(classifyHang({ switchInFlight: true }), 'busy');
assert.equal(classifyHang({ openSettling: true }), 'busy');
assert.equal(classifyHang({ desiredEngine: 'vosk', activeEngine: 'none' }), 'mismatch');
assert.equal(classifyHang({ desiredEngine: 'none', activeEngine: '' }), 'healthy');
assert.equal(classifyHang({ desiredEngine: 'vosk', activeEngine: 'sapi', activateBusy: true }), 'busy');
assert.equal(classifyHang({ localGapMs: 500, desiredEngine: 'vosk', activeEngine: 'sapi' }), 'mismatch');

const html = readFileSync(join(root, 'src/index.html'), 'utf8');
assert.ok(html.includes('id="voiceHangLivePanel"'), 'live hang panel in body');
assert.ok(html.includes('voice-hang-classify.js'), 'classify script loaded');
assert.ok(html.includes('id="voiceHangDiagBlock"') === false || html.includes('voiceHangLivePanel'),
  'live panel present');

const diag = readFileSync(join(root, 'src/js/features/debug/voice-diag.js'), 'utf8');
assert.ok(/renderVoiceHangDiag/.test(diag), 'renderVoiceHangDiag present');
assert.ok(/cmd_ui_hb_snapshot/.test(diag), 'uses hb snapshot IPC');
assert.ok(/noteHangSpike/.test(diag), 'noteHangSpike');
assert.ok(/voiceHangDiagPeak/.test(html)||/voiceHangDiagPeak/.test(diag), 'peak row');
assert.ok(/longtask/.test(diag), 'longtask observer');
assert.ok(/formatHangEvents|hangEvents/.test(diag), 'event breadcrumb');

const boot = readFileSync(join(root, 'src/js/core/app-boot.js'), 'utf8');
assert.ok(/startLiveHangDiag/.test(boot), 'boot starts live hang diag');
assert.ok(/noteHangSpike/.test(boot), 'HB gap feeds hang spike');

const conf = readFileSync(join(root, 'src-tauri/tauri.conf.json'), 'utf8');
assert.ok(/"label":\s*"main"[\s\S]*?"alwaysOnTop":\s*true/.test(conf), 'main alwaysOnTop');

const wake = readFileSync(join(root, 'src/js/features/voice/voice-wake.js'), 'utf8');
assert.ok(/statusOpts=\{liveOnly:true\}/.test(wake), 'strategy/mode switch uses liveOnly');
assert.ok(/applyDesiredEngineResult\([^)]*liveOnly:true/.test(wake), 'applyDesiredEngineResult liveOnly');

const prefs = readFileSync(join(root, 'src-tauri/src/ipc/commands/shell/prefs.rs'), 'utf8');
assert.ok(/fn cmd_ui_hb_snapshot/.test(prefs), 'cmd_ui_hb_snapshot defined');

const win = readFileSync(join(root, 'src-tauri/src/ipc/commands/shell/window.rs'), 'utf8');
assert.ok(/fn cmd_window_set_always_on_top/.test(win), 'always-on-top command');

console.log('ok voice-hang-classify');
