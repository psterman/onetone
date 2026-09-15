// Guard: Cursor「软件自带」grouped by scenario (not 常用/更多 dump).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const picker = readFileSync(
  join(root, 'src/js/features/mapping/keys-channel-command-picker.js'),
  'utf8'
);
const css = readFileSync(join(root, 'src/css/keys-workflow.css'), 'utf8');
const i18n = readFileSync(join(root, 'src/js/core/i18n.js'), 'utf8');

const renderBody = picker
  .split('function renderCursorPickHtml')[1]
  .split('function renderCursorCommandsPanel')[0];

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

console.log('[keys-cursor-pick-groups]');
check('CURSOR_PICK_GROUPS defined', /var CURSOR_PICK_GROUPS\s*=/.test(picker));
check('talk/chat/mode/find/diff groups', /keysCursorPickGroupTalk/.test(picker) && /keysCursorPickGroupDiff/.test(picker));
check('render uses horizontal subtabs', /keys-pick-subtabs|renderPickSubtabsHtml/.test(renderBody));
check('no 常用/更多 optgroups in render', !/keysCursorPickGroupCommon/.test(renderBody) && !/optgroup/.test(renderBody));
check('filters by active subtab', /cursorPickSubtabId/.test(renderBody));
check('row click binds', /data-cursor-pick-row/.test(renderBody) || /data-cursor-pick-row/.test(picker));
check('CSS for cursor groups', /keys-cursor-pick-group/.test(css) && /keys-cursor-pick-chord/.test(css));
check('i18n group titles', /keysCursorPickGroupTalk:'听写'/.test(i18n));

if (fail) {
  console.error(fail + ' failed');
  process.exit(1);
}
console.log(pass + ' passed');
