// Guard: 动作链页对齐 Mac Keys — left catalog / mid trigger+steps.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'src/index.html'), 'utf8');
const panel = readFileSync(join(root, 'src/js/features/mapping/keys-seq-panel.js'), 'utf8');
const css = readFileSync(join(root, 'src/css/keys-seq-panel.css'), 'utf8');
const i18n = readFileSync(join(root, 'src/js/core/i18n.js'), 'utf8');

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

console.log('[keys-seq-mac-catalog]');

const railStart = html.indexOf('id="keysSeqRail"');
const railEnd = html.indexOf('id="keysSeqMain"');
const mainEnd = html.indexOf('id="keysSeqSceneActionsPanel"');
const railChunk = railStart >= 0 && railEnd > railStart ? html.slice(railStart, railEnd) : '';
const mainChunk = railEnd >= 0 && mainEnd > railEnd ? html.slice(railEnd, mainEnd) : '';

check('rail has catalog list', /id="keysSeqSavedList"/.test(railChunk) && !/hidden/.test(railChunk.match(/id="keysSeqSavedList"[^>]*>/)?.[0] || 'hidden'));
check('rail has no trigger row', !/id="keysSeqTriggerRow"/.test(railChunk));
check('rail has no accordion toggle', !/id="keysSeqSavedToggle"/.test(railChunk));
check('mid hosts trigger row', /id="keysSeqTriggerRow"/.test(mainChunk));
check('mid hosts trigger cap', /id="keysSeqTriggerCap"/.test(mainChunk));
check('mid hosts summary + actions', /id="keysSeqMidSummary"/.test(mainChunk) && /id="keysSeqActions"/.test(mainChunk));
check('scene dock still hidden', /id="keysSeqSceneActionsPanel"[^>]*hidden/.test(html) && /display:none!important/.test(html));

check('JS no savedExpanded gate', !/savedExpanded/.test(panel));
check('JS no left flow expand', !/flowOpenId|stepFlowHtml|data-seq-flow/.test(panel));
check('JS paints mid summary', /keysSeqMidSummary/.test(panel));
check('CSS rail width 210', /grid-template-columns:\s*210px/.test(css));
check('i18n rail/mid labels', /keysSeqRailRole:/.test(i18n) && /keysSeqMidLabel:/.test(i18n));

if (fail) {
  console.error(fail + ' failed');
  process.exit(1);
}
console.log(pass + ' passed');
