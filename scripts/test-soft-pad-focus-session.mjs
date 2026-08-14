/**
 * Smoke check for Soft Pad focus_session / ambient helpers (no Tauri).
 * Run: node scripts/test-soft-pad-focus-session.mjs
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const focus = readFileSync(join(root, 'src-tauri/src/agent_lane/focus_session.rs'), 'utf8');
const overlay = readFileSync(join(root, 'src/codex-micro-overlay.html'), 'utf8');
const cmd = readFileSync(join(root, 'src-tauri/src/ipc/commands/shell/codex_micro_overlay_cmd.rs'), 'utf8');
const lights = readFileSync(join(root, 'scripts/onetone-lights.mjs'), 'utf8');
const coreDoc = readFileSync(join(root, 'docs/pad-status-core.md'), 'utf8');

assert.match(focus, /RECENT_ATTENTION_MS/);
assert.match(focus, /status_host_click_gate/);
assert.match(focus, /ambient_ui_status/);
assert.match(focus, /fn resolve_focus_target/);
assert.match(cmd, /cmd_soft_pad_focus_session/);
assert.match(overlay, /cmd_soft_pad_focus_session/);
assert.match(overlay, /clickKind:'status_host'/);
assert.match(overlay, /clickKind:'soft_rgb'/);
assert.match(overlay, /ambientStatus/);
assert.match(lights, /onetone-lights focus/);
assert.match(coreDoc, /Soft RGB 聚合契约/);
assert.match(coreDoc, /Attention → Focus Session/);

console.log('[soft-pad-focus-session] smoke assertions passed');
