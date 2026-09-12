// Guard: text/delay steps use in-app sheet, not native prompt.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
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

const home = readFileSync(join(root, 'src/js/features/home/home-live.js'), 'utf8');
const sheet = readFileSync(
  join(root, 'src/js/features/mapping/keys-action-input-sheet.js'),
  'utf8'
);
const html = readFileSync(join(root, 'src/index.html'), 'utf8');

console.log('[keys-action-input-sheet]');
check('sheet module exports openText/openDelay', /openText:\s*openText/.test(sheet) && /openDelay:\s*openDelay/.test(sheet));
check('home-live uses pickInjectText', /function pickInjectText/.test(home) && /pickInjectText\(''/.test(home));
check('home-live uses pickDelayMs', /function pickDelayMs/.test(home) && /pickDelayMs\(200/.test(home));
check('add=text no longer direct prompt', !/add==='text'\)\{\s*var v=\(global\.prompt/.test(home));
check('overlay markup present', /id="keysActionInputOverlay"/.test(html));
check('script tag wired', /keys-action-input-sheet\.js/.test(html));

if (fail) {
  console.error(fail + ' failed');
  process.exit(1);
}
console.log(pass + ' passed');
