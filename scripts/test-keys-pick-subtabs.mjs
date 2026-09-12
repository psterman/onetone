// Guard: voice / cursor / softPad picks use horizontal subtabs for long lists.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const picker = readFileSync(
  join(root, 'src/js/features/mapping/keys-channel-command-picker.js'),
  'utf8'
);
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

console.log('[keys-pick-subtabs]');
check('renderPickSubtabsHtml helper', /function renderPickSubtabsHtml/.test(picker));
check('voice uses subtabs', /renderPickSubtabsHtml\(tabs, voicePickSubtabId, 'voice'\)/.test(picker));
check('cursor uses subtabs', /renderPickSubtabsHtml\(tabs, cursorPickSubtabId, 'cursor'\)/.test(picker));
check('softPad uses subtabs', /renderPickSubtabsHtml\(tabs, softPadPickSubtabId, 'softPad'\)/.test(picker));
check('subtab click wired', /data-pick-subtab/.test(picker) && /voicePickSubtabId = subId/.test(picker));
check('softPad row bind', /data-softpad-pick-row/.test(picker));
check('no softPad select in renderSoftPadPickHtml', !/keysSoftPadPickSelect/.test(picker.split('function renderSoftPadPickHtml')[1].split('function render')[1] || picker.split('function renderSoftPadPickHtml')[1].slice(0, 3500)));
check('CSS horizontal chips', /keys-pick-subtabs/.test(css) && /keys-pick-subtab\.is-active/.test(css));

if (fail) {
  console.error(fail + ' failed');
  process.exit(1);
}
console.log(pass + ' passed');
