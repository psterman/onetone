/**
 * Guard: send_right_alt must be one vk+scan pulse (not vk then scancode).
 * Dual pulses toggle Typeless on then off on a single side-button wake.
 * Run: node scripts/test-ralt-single-pulse.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

let fail = 0;
function check(name, ok) {
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name);
  if (!ok) fail++;
}

const kb = read('src-tauri/src/keyboard.rs');
const start = kb.indexOf('pub fn send_right_alt');
check('send_right_alt present', start >= 0);
const slice = kb.slice(start, start + 900);
const end = slice.indexOf('pub fn send_left_alt');
const body = end >= 0 ? slice.slice(0, end) : slice;
check('uses send_vk_scan', /send_vk_scan/.test(body));
check('no second scancode-only pulse', !/send_scancode/.test(body));
check('exactly down+up', (body.match(/send_vk_scan/g) || []).length === 2);

const hot = read('src-tauri/src/hotkey_win.rs');
check('xbutton claim helper', /fn claim_xbutton_down\(/.test(hot));
check(
  'Raw XButton uses first-wins dedupe (not hard mouse_hook suppress)',
  /raw_mouse_xbutton[\s\S]{0,500}claim_xbutton_down/.test(hot)
);
check(
  'no hard suppress of Raw while mouse hook active',
  !/raw_mouse_xbutton[\s\S]{0,400}mouse_hook_active\(\)/.test(hot)
);

if (fail) process.exit(1);
console.log('test-ralt-single-pulse: ok');
