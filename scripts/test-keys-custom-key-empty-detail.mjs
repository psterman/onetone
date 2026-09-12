// Guard: empty「我录的键」must not fall back to habit targetActions (IME 右 Alt ghost panel).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(
  join(root, 'src/js/features/mapping/keys-channel-command-picker.js'),
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

console.log('[keys-custom-key-empty-detail]');
check(
  'no habit fallback in key tab',
  /Library mode: never fall back to habit/.test(src) &&
    /if \(!m && activeTab !== 'key'\)/.test(src)
);
check(
  'empty list clears edit id',
  /if \(activeTab === 'key' && !rows\.length\)/.test(src) &&
    /customKeyMatchEditId = ''/.test(src)
);
check(
  'split is-empty when no rows',
  /classList\.toggle\('is-empty',\s*activeTab === 'key' && !rows\.length\)/.test(src) ||
    /classList\.toggle\('is-empty',\s*!rows\.length\)/.test(src)
);
check(
  'detail hidden when empty or no match',
  /detail\.hidden = !rows\.length \|\| !m/.test(src)
);

if (fail) {
  console.error(fail + ' failed');
  process.exit(1);
}
console.log(pass + ' passed');
