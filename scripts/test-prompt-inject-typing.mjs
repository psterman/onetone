/**
 * Prompt textarea debounce + faster inject settle.
 * Run: node scripts/test-prompt-inject-typing.mjs
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

const rail = read('src/js/features/voice/voice-intent-rail.js');
const kb = read('src-tauri/src/keyboard.rs');
const rt = read('src-tauri/src/voice_end_runtime.rs');
const html = read('src/index.html');

check('input uses light path', rail.includes('onPromptBodyInput()') && !/addEventListener\('input'[\s\S]{0,200}savePromptText\(\)/.test(rail));
check('debounced persist', rail.includes('schedulePromptPersist') && rail.includes('720'));
check('no syncPromptUi on keystroke path', /function onPromptBodyInput[\s\S]*?scheduleAutosavePromptScene\(640\)/.test(rail) && !/function onPromptBodyInput[\s\S]*?syncPromptUi\(/.test(rail));
check('faster key gap', /const KEY_GAP_MS:\s*u64\s*=\s*4/.test(kb));
check('prompt settle before Enter', /settle_ms[\s\S]*?Action::Delay[\s\S]*?Enter/.test(rt));
const picker = read('src/js/features/mapping/keys-channel-command-picker.js');
check('shared promptInjectActions settle', /function promptInjectActions[\s\S]*?type:\s*'delay'/.test(picker));
check('cache bust', html.includes('voice-intent-rail.js?v=prompt-one-b1'));

process.exit(fail ? 1 : 0);
