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
check('empty strip has no 添加步骤 lab', !/emptyPlus[\s\S]{0,120}keys-seq-add-lab/.test(home));
check(
  'applyAndRefresh paints only keysCaptureTargetActions',
  /getElementById\('keysCaptureTargetActions'\)/.test(home) &&
    !/\['keysCaptureTargetActions',\s*'keysSeqActions'\]/.test(home)
);
check('Mac step body nests kind+val', /keys-seq-kind[\s\S]*keys-seq-val/.test(home) || /class="keys-seq-kind"[\s\S]*class="keys-seq-val"/.test(home));
check('delay uses select not only pills', /data-inline-delay-select/.test(home) && /keys-seq-delay-sel/.test(home));
check('add strip uses 输入框 for aim/ime', /keysCaptureSeqAddAim/.test(home));
check('inline listen for key chip', /data-inline-rec/.test(home) && /startKeysInlineListen/.test(home));
check('CSS Mac step grid + delay select', /grid-template-columns:\s*28px minmax\(0,\s*1fr\) auto/.test(css) && /keys-seq-delay-sel/.test(css));

if (fail) {
  console.error(fail + ' failed');
  process.exit(1);
}
console.log(pass + ' passed');
