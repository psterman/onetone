// Guard: keys sequence「按键」is press-to-record only — no catalog twin.
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

console.log('[keys-seq-record-only]');
check(
  'keys tile is data-add=record labeled 按键',
  /if\(isKeys\)\{[\s\S]*?data-add="record"[\s\S]*?keysCaptureSeqAddKey/.test(home)
);
check(
  'keys record path uses pickKeyChordViaRecord',
  /if\(isKeys\)\{\s*pickKeyChordViaRecord/.test(home)
);
check(
  'keys edit key uses record not picker',
  /else if\(isKeys\)\{\s*pickKeyChordViaRecord\(function\(chord\)\{\s*if\(!chord\) return;\s*cur\[idx\]/.test(
    home
  )
);
check(
  'no keys twin data-add=key tile',
  !/isKeys[\s\S]{0,80}data-add="key"[\s\S]{0,120}keysCaptureSeqAddKey/.test(home)
);

if (fail) {
  console.error(fail + ' failed');
  process.exit(1);
}
console.log(pass + ' passed');
