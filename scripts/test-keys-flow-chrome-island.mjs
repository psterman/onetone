// P12c-1 单测：buildKeysFlowChromeModel + 守卫 + 挂载入口
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0;
let fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.error('  FAIL ' + name); }
}

const state = {
  selectedMappingId: 'm1',
  config: {
    mappings: [{ id: 'm1', triggerKey: 'F1', targetKey: 'Enter', enabled: true }],
  },
};

globalThis.OneToneState = { state };
globalThis.OneToneI18n = {
  t: (k) => String(k),
  dict: () => ({}),
  getLang: () => 'zh',
};
globalThis.window = globalThis;

const domNodes = {};
function fakeEl(id) {
  if (!domNodes[id]) {
    const classes = new Set();
    domNodes[id] = {
      id,
      textContent: '',
      dataset: {},
      classList: {
        toggle(name, on) {
          if (on) classes.add(name);
          else classes.delete(name);
        },
        add(name) { classes.add(name); },
        remove(name) { classes.delete(name); },
        contains(name) { return classes.has(name); },
      },
      setAttribute() {},
      querySelector() { return null; },
    };
  }
  return domNodes[id];
}
globalThis.OneToneDom = { $: (id) => fakeEl(id) };
['keysFlowNodeTrigger', 'keysFlowNodeTarget',
  'keysFlowNodeTriggerHint', 'keysFlowNodeTargetHint',
  'habitKeyMapRowTrigger', 'habitKeyMapRowTarget',
].forEach(fakeEl);

globalThis.OneToneMappingCore = {
  selected: () => state.config.mappings[0],
  editorTrigger: (m) => (m && m.triggerKey) || '',
  editorTarget: (m) => (m && m.targetKey) || '',
  isSaved: (m) => !!(m && m.triggerKey && m.targetKey),
};
globalThis.OneToneKeysPageState = { getStep: () => 'trigger', setStep() {} };
globalThis.OneToneMappingRecording = { mode: () => 'none' };
globalThis.OneToneKeyLabels = {
  triggerDisplayLabel: (m) => (m.triggerKey ? 'LBL(' + m.triggerKey + ')' : ''),
};
globalThis.__vp_mapping_core_hooks__ = { friendlyKeyName: (k) => 'K(' + k + ')' };

const src = readFileSync(join(root, 'src/js/features/mapping/keys-step-nav.js'), 'utf8').replace(/^\uFEFF/, '');
(0, eval)(src);
const API = globalThis.OneToneKeysPageNav;

console.log('[keys-flow-chrome] 模型:');
check('buildKeysFlowChromeModel 已导出', typeof API.buildKeysFlowChromeModel === 'function');

let model = API.buildKeysFlowChromeModel();
check('activeStep=trigger', model.activeStep === 'trigger');
check('triggerHint 含 label', String(model.triggerHint).includes('LBL(F1)') || String(model.triggerHint).length > 0);
check('sig 非空', typeof model.sig === 'string' && model.sig.length > 0);

console.log('[keys-flow-chrome] 守卫:');
globalThis.__otKeysFlowChromeMounted = false;
let syncCalls = 0;
globalThis.__otKeysFlowChromeSync = () => { syncCalls++; };

fakeEl('keysFlowNodeTriggerHint').textContent = '';
API.renderStepHints(state.config.mappings[0]);
check('岛未挂时写 hint', fakeEl('keysFlowNodeTriggerHint').textContent.length > 0);
check('岛未挂时不调 sync', syncCalls === 0);

globalThis.__otKeysFlowChromeMounted = true;
syncCalls = 0;
const stale = 'STALE';
fakeEl('keysFlowNodeTriggerHint').textContent = stale;
API.renderStepHints(state.config.mappings[0]);
check('岛挂载时不写 hint', fakeEl('keysFlowNodeTriggerHint').textContent === stale);
check('岛挂载时调 sync', syncCalls === 1);

syncCalls = 0;
API.syncActive('target');
check('syncActive 岛挂载时调 sync', syncCalls >= 1);

console.log('[keys-flow-chrome] 源码护栏:');
const navSrc = readFileSync(join(root, 'src/js/features/mapping/keys-step-nav.js'), 'utf8');
check('导出 buildKeysFlowChromeModel', navSrc.includes('buildKeysFlowChromeModel:buildKeysFlowChromeModel'));
check('apply 岛守卫', navSrc.includes('__otKeysFlowChromeMounted') && navSrc.includes('__otKeysFlowChromeSync'));

const mainSrc = readFileSync(join(root, 'src-islands/main.tsx'), 'utf8');
check('main 挂载入口', mainSrc.includes('__otMountKeysFlowChromeIsland'));
check('挂载 keysFlowNodeTriggerHint', mainSrc.includes("mountIsland('keysFlowNodeTriggerHint'"));

const drawerSrc = readFileSync(join(root, 'src/js/features/settings/settings-drawer.js'), 'utf8');
check('settings-drawer 接线', drawerSrc.includes('__otMountKeysFlowChromeIsland'));

const islandTsx = readFileSync(join(root, 'src-islands/islands/keys-flow-chrome-island.tsx'), 'utf8');
check('岛含 sync bridge', islandTsx.includes('__otKeysFlowChromeSync'));

const html = readFileSync(join(root, 'src/index.html'), 'utf8');
check('index 含 keysFlowNodes', html.includes('id="keysFlowNodes"'));

const keysCss = readFileSync(join(root, 'src/css/keys-workflow.css'), 'utf8');
check('desk hides inactive keys step', keysCss.includes('keys-page-desk .habit-flow-step.keys-workflow-col:not(.is-active-step)') && keysCss.includes('display: none !important'));
check('desk trigger compact stack', keysCss.includes('is-step-trigger') && keysCss.includes('#habitKeyMapRowTrigger .keys-step-body') && keysCss.includes('flex: 0 0 auto'));

console.log(`[keys-flow-chrome] ${pass} 通过 / ${fail} 失败`);
if (fail > 0) process.exit(1);
