#!/usr/bin/env node
/**
 * Guard: Soft Pad black-slab fix — restore_overlay_transparency must re-assert
 * WebView2 clear color after WS_EX_LAYERED strip/restore (drag / click-through).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const rs = readFileSync(join(root, 'src-tauri/src/codex_micro_overlay.rs'), 'utf8');
const css = readFileSync(join(root, 'src/css/codex-micro-overlay.css'), 'utf8');
const opts = readFileSync(join(root, 'src-tauri/src/overlay_window.rs'), 'utf8');

assert.match(rs, /fn restore_overlay_transparency\s*\(/, 'helper exists');
assert.match(
  rs,
  /set_background_color\(Some\(tauri::webview::Color\(0,\s*0,\s*0,\s*0\)\)\)/,
  'clear color is fully transparent',
);
assert.match(rs, /finish_overlay_drag[\s\S]*?restore_overlay_transparency\(win\)/, 'drag end restores');
assert.match(
  rs,
  /set_overlay_click_through_impl\(pass,\s*true,\s*true\);[\s\S]*?restore_overlay_transparency\(win\)/,
  'reconcile restores after EXSTYLE',
);
assert.match(
  rs,
  /if !already_visible \{\s*restore_overlay_transparency\(&win\);/,
  'first show restores',
);
assert.match(opts, /\.transparent\(true\)/, 'overlay window created transparent');
assert.match(css, /background:\s*transparent\s*!important/, 'page CSS stays transparent');

console.log('ok: soft-pad overlay transparency restore guards');
