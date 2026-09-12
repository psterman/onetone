// Guard: empty 我录的键 must not wipe IME / blank「说完后」.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const picker = readFileSync(
  join(root, 'src/js/features/mapping/keys-channel-command-picker.js'),
  'utf8'
);
const finish = readFileSync(
  join(root, 'src/js/features/mapping/key-finish-flow-render.js'),
  'utf8'
);

let pass = 0;
let fail = 0;
function check(name, cond) {
  if (cond) {
    pass++;
    console.log('  PASS ' + name);
  } else {
    fail++;
    console.error('  FAIL ' + name);
  }
}

console.log('[keys-finish-empty-customkey]');
check(
  'create does not auto-apply recognition',
  /Edit in library only/.test(picker) &&
    !/setActiveTab\('key'[\s\S]{0,120}applyCustomKeyMatchAsRecognition/.test(picker)
);
check(
  'empty acts early-return before wiping targetKey',
  /Empty sequence: library edit only/.test(picker) &&
    /if \(!acts\.length\)/.test(picker)
);
check(
  'finish gate allows trigger-only',
  /function canConfigureKeyFinish/.test(finish) &&
    /canConfigureKeyFinish\(m\)/.test(finish)
);

if (fail) {
  console.error(fail + ' failed');
  process.exit(1);
}
console.log(pass + ' passed');
