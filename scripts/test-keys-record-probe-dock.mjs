// Guard: 录制检测 = bottom-right chip + sheet modal (not in-flow panel).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'src/index.html'), 'utf8');
const js = readFileSync(
  join(root, 'src/js/features/mapping/mapping-record-probe.js'),
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

console.log('[keys-record-probe-dock]');
check('chip in HTML', /record-probe-chip/.test(html) && /btnRecordProbeExpand/.test(html));
check('sheet + backdrop in HTML', /recordProbeSheet/.test(html) && /recordProbeBackdrop/.test(html));
check('diag strip in HTML', /recordProbeDiag/.test(html) && /record-probe-diag/.test(html));
check('JS opens sheet', /function openSheet|syncSheetOpen\(true\)/.test(js));
check('JS shows chip while recording', /setUiVisible\(true,\s*\{\s*expanded:\s*false/.test(js));
check('JS buildDiag + ipc-ok verdict', /function buildDiag/.test(js) && /ipc-ok/.test(js) && /pushDiagSnapshot/.test(js));
check('JS ignores post-commit ipc-fail', /function backendConfirmed/.test(js) && /oral-apply-fail/.test(js));
check('JS oral leak helper', /noteOralDuringRecord/.test(js) && /oral-during-record/.test(js));
check('inline probe link hidden', /link\.hidden\s*=\s*true/.test(js));
check('CSS fixed bottom-right', /position:\s*fixed\s*!important/.test(css) && /bottom:\s*16px/.test(css));
check('CSS sheet modal', /\.record-probe-sheet/.test(css) && /\.record-probe-backdrop/.test(css));
check('CSS diag strip', /\.record-probe-diag/.test(css) && /\.record-probe-diag\.is-bad/.test(css));

if (fail) {
  console.error(fail + ' failed');
  process.exit(1);
}
console.log(pass + ' passed');
