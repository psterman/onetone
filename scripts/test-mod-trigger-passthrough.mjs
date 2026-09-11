// Guard: lone-modifier triggers must not steal Ctrl+V from apps.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const hotkey = readFileSync(join(root, 'src-tauri/src/hotkey_win.rs'), 'utf8');
const dispatch = readFileSync(join(root, 'src-tauri/src/ipc/runtime_dispatch.rs'), 'utf8');
const gesture = readFileSync(join(root, 'src-tauri/src/press_gesture.rs'), 'utf8');

let pass = 0;
let fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.error('  FAIL ' + name); }
}

console.log('[mod-trigger-passthrough]');
check('RegisterHotKey skips lone modifiers', hotkey.includes('is_modifier_only_chord(name)') && hotkey.includes('RegisterHotKey(Ctrl)'));
check('LL hook CallNextHookEx for modifiers', hotkey.includes('Lone modifiers must reach the focused app') && hotkey.includes('CallNextHookEx'));
check('Double/LongPress allowed on modifier keydown', dispatch.includes('TriggerMode::Double') && dispatch.includes('allow_keydown_gesture'));
check('Ctrl+V clears modifier double wait', dispatch.includes('cancel_modifier_double_waits') && gesture.includes('fn cancel_modifier_double_waits'));

console.log(`[mod-trigger-passthrough] ${pass} 通过 / ${fail} 失败`);
if (fail > 0) process.exit(1);
