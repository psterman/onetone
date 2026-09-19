/**
 * RAlt pushToTalk must not re-inject when the physical key already reached the IME.
 * Run: node scripts/test-ralt-passthrough-skip.mjs
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

const lib = read('src-tauri/src/lib.rs');
const rt = read('src-tauri/src/voice_end_runtime.rs');
const disp = read('src-tauri/src/ipc/runtime_dispatch.rs');
const layer = read('src-tauri/src/agent/layer1_native.rs');

check('state field', /voice_key_passthrough_armed/.test(lib));
check('arm helper', /fn arm_voice_key_passthrough/.test(rt));
check('take helper', /fn take_voice_key_passthrough/.test(rt));
check('keyup arms when startDictation', /startDictation[\s\S]*?arm_voice_key_passthrough/.test(disp));
check('cursor skips inject on passthrough', /take_voice_key_passthrough[\s\S]*?passthrough/.test(layer));
check('soft pad still injects path exists', /send_chord\(&voice_key/.test(layer));

process.exit(fail ? 1 : 0);
