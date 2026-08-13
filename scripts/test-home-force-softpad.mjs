/**
 * Guard: home sidebar force Soft Pad switch + config/persist wiring.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

const html = read('src/index.html');
assert.ok(html.includes('id="wbForceSoftPadToggle"'), 'home force Soft Pad toggle in DOM');
assert.ok(html.includes('wb-home-sidebar-foot'), 'toggle sits in sidebar foot above quick start');
assert.ok(
  html.indexOf('wbForceSoftPadToggle') < html.indexOf('wbBtnTestSend'),
  'force Soft Pad switch is above 快速入门'
);

const wb = read('src/js/features/home/home-workbench.js');
assert.ok(wb.includes('cmd_soft_pad_force_open'), 'home toggle uses quiet force IPC');
assert.ok(wb.includes('setForceSoftPadOpen'), 'home workbench can toggle force open');
assert.ok(wb.includes('ensureForceSoftPadReady'), 'force-on ensures Soft Pad mapping ready');

const persist = read('src/js/core/config-persist.js');
assert.ok(persist.includes('softPadForceOpen'), 'config persist round-trips softPadForceOpen');

const i18n = read('src/js/core/i18n.js');
assert.ok(i18n.includes("homeWbForceSoftPadLabel:'强制打开 Soft Pad'"), 'zh label');
assert.ok(i18n.includes("homeWbForceSoftPadLabel:'Force Soft Pad open'"), 'en label');

const cfg = read('src-tauri/src/config.rs');
assert.ok(cfg.includes('soft_pad_force_open'), 'Rust VoiceConfig has soft_pad_force_open');
assert.ok(cfg.includes('softPadForceOpen'), 'serde rename softPadForceOpen');

const overlay = read('src-tauri/src/codex_micro_overlay.rs');
assert.ok(overlay.includes('cfg.soft_pad_force_open'), 'overlay snapshot respects force open');
assert.ok(overlay.includes('force_open || overlay_should_be_visible_host()'), 'maybe_tick respects force open');
assert.ok(overlay.includes('ensure_force_soft_pad_ready'), 'ensure force Soft Pad ready exists');
assert.ok(overlay.includes('force_soft_pad_overlay_candidate'), 'force picks any Soft Pad agent');

const flags = read('src-tauri/src/ipc/commands/shell/codex_micro_pad_flags_cmd.rs');
assert.ok(flags.includes('cmd_soft_pad_force_open'), 'quiet force IPC command exists');

const ipcToml = read('src-tauri/permissions/app-ipc.toml');
assert.ok(ipcToml.includes('allow-cmd-soft-pad-force-open'), 'app-ipc allows force open');

console.log('ok home-force-softpad');
