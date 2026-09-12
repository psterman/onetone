// Guard: Soft Pad pick rows use slot/keycap title, not generic「应用快捷键」.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const picker = readFileSync(
  join(root, 'src/js/features/mapping/keys-channel-command-picker.js'),
  'utf8'
);

const catalogFn = picker
  .split('function softPadPickCatalog')[1]
  .split('function findSoftPadPick')[0];

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

console.log('[keys-softpad-pick-names]');
check('softPadCursorSlotTitle helper', /function softPadCursorSlotTitle/.test(picker));
check('prefers capabilityCardCopy title', /copy\.title/.test(catalogFn));
check('skips generic app.shortcut label', /aid !== 'app\.shortcut'/.test(catalogFn));
check('falls back to keycap / chord', /softPadCursorSlotTitle\(slotId\)/.test(catalogFn));

if (fail) {
  console.error(fail + ' failed');
  process.exit(1);
}
console.log(pass + ' passed');
