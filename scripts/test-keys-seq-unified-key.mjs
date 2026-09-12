// Guard: keys sequence uses one「按键」tile, not twin 录制+选键.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const home = readFileSync(join(root, 'src/js/features/home/home-live.js'), 'utf8');

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

console.log('[keys-seq-unified-key]');
check(
  'keys variant hides record twin',
  /showRecordBtn = \(mode === 'picker'\) && !isKeys/.test(home)
);
check(
  'empty recipe steps',
  /keysCaptureSeqEmptyStep1/.test(home) && /keys-seq-empty-recipe/.test(home)
);
check(
  'key add uses unified picker record path',
  /openWithRecordCallback/.test(home) && /data-add="key"/.test(home)
);
check(
  'seq-kinds three-up class',
  /is-seq-kinds/.test(home)
);

if (fail) {
  console.error(fail + ' failed');
  process.exit(1);
}
console.log(pass + ' passed');
