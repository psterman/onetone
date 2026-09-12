// Guard: keys sequence uses inline row editors (no sheet / catalog tiles).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const home = readFileSync(join(root, 'src/js/features/home/home-live.js'), 'utf8');
const css = readFileSync(join(root, 'src/css/keys-workflow.css'), 'utf8');

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

console.log('[keys-seq-inline]');
check('buildKeysInlineRowHtml exists', /function buildKeysInlineRowHtml/.test(home));
check('wireKeysInlineHandlers exists', /function wireKeysInlineHandlers/.test(home));
check('keys variant uses is-keys-inline', /classList\.toggle\('is-keys-inline',\s*isKeys\)/.test(home));
check('add strip not tile row', /keys-seq-add-strip/.test(home) && !/isKeys[\s\S]{0,200}is-tile/.test(home));
check('inline listen for key chip', /data-inline-rec/.test(home) && /startKeysInlineListen/.test(home));
check('CSS for key chip + delay pills', /keys-seq-key-chip/.test(css) && /keys-seq-delay-pill/.test(css));

if (fail) {
  console.error(fail + ' failed');
  process.exit(1);
}
console.log(pass + ' passed');
