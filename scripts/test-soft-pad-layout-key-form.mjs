// Guard: Soft Pad「改按键」= left preview + right four-field inline form (no modal cap list).
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

const pad = readFileSync(join(root, 'src/js/features/agent/codex-micro-pad-ui.js'), 'utf8');
const css = readFileSync(join(root, 'src/css/soft-pad-hub.css'), 'utf8');
const i18n = readFileSync(join(root, 'src/js/core/i18n.js'), 'utf8');

console.log('[soft-pad-layout-key-form]');
check('shell mounts layout-editor sibling', /soft-pad-layout-split[\s\S]*data-soft-pad-layout-editor/.test(pad));
check('softPadLayoutEditorHost returns node', pad.includes('function softPadLayoutEditorHost') &&
  /querySelector\('\[[^\]]*data-soft-pad-layout-editor[^\]]*\]'\)/.test(pad.slice(pad.indexOf('function softPadLayoutEditorHost'))));
check('previewEdit uses inline', /function softPadPreviewEditKey[\s\S]*?mode:\s*'inline'/.test(pad));
check('softPad panel never falls back to capability modal',
  /Soft Pad settings: always left preview[\s\S]*never capability modal/.test(pad) &&
  /softPadPanelActive\(\)[\s\S]*softPadPreviewEditKey\(m, id\)/.test(pad));
check('inline HTML is four-field form', pad.includes('function buildLayoutKeyFormHtml') &&
  pad.includes('layoutKeySlot') && pad.includes('layoutKeyPhrases') &&
  pad.includes('layoutKeyChord') && pad.includes('layoutKeyFocus'));
check('inline skips capability card list', /function buildEditKeycapInnerHtml\(mode\)[\s\S]*?if \(mode === 'inline'\) return buildLayoutKeyFormHtml\(\)/.test(pad));
check('no mapping test console', pad.indexOf('映射测试控制台') < 0 && pad.indexOf('mapping-test-console') < 0);
check('commit writes layout bindings', /function commitEditKeycapDraft[\s\S]*?applyLayoutKeyBindings\(m, slotId, editDraft\)/.test(pad));
check('CSS left-right split', css.includes('.soft-pad-layout-split') && css.includes('.soft-pad-layout-form'));
check('i18n four-field labels zh', i18n.includes("softPadLayoutFieldSlot:'动作分类'") &&
  i18n.includes("softPadLayoutFocusEditor:'送到当前正在用的编辑器'"));
check('i18n four-field labels en', i18n.includes("softPadLayoutFieldSlot:'Action category'") &&
  i18n.includes("softPadLayoutFocusEditor:'Send to the currently used editor'"));

console.log(`[soft-pad-layout-key-form] ${pass} passed / ${fail} failed`);
if (fail > 0) process.exit(1);
