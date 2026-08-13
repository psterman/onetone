/**
 * Primary mouse buttons must not be voice/IME triggers.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'src/js/core/app-key-utils.js'), 'utf8');
const rust = readFileSync(join(root, 'src-tauri/src/config.rs'), 'utf8');

assert.ok(/rbutton/.test(src) && /mbutton/.test(src), 'JS blocks R/M mouse triggers');
assert.ok(/contains_blocked_mouse_token/.test(rust), 'Rust blocked-mouse helper');
assert.ok(
  /"RButton"/.test(rust) && /"MButton"/.test(rust) && /primary_mouse_buttons_blocked/.test(rust),
  'Rust blocks RButton/MButton + regression test'
);

const sandbox = { console };
vm.runInNewContext(src, sandbox);
const api = sandbox.OneToneAppKeyUtils;
assert.ok(api, 'OneToneAppKeyUtils export');
assert.equal(api.isAllowedTriggerKey('RButton'), false);
assert.equal(api.isAllowedTriggerKey('LButton'), false);
assert.equal(api.isAllowedTriggerKey('MButton'), false);
assert.equal(api.isAllowedTriggerKey('XButton1'), true);

console.log('ok blocked-mouse-triggers');
