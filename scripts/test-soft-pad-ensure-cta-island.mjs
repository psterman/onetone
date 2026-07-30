// P14j 单测：buildSoftPadEnsureCtaModel + 守卫源码护栏 + 挂载入口
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
    mappings: [{
      id: 'm1',
      triggerKey: 'F1',
      targetKey: 'Enter',
      enabled: true,
      appTargetId: 'codex-chat',
      agentTemplateId: 'codex',
      softPadKind: 'codex',
      name: '我的 Codex',
      codexMicroPad: { enabled: true, skin: 'graphite', keys: {} },
    }],
  },
};

globalThis.OneToneState = { state, ui: {} };
globalThis.OneToneI18n = {
  t: (k, fallback) => (fallback != null ? String(fallback) : String(k)),
  dict: () => ({}),
  getLang: () => 'zh',
};
globalThis.window = globalThis;

const domNodes = {};
function fakeEl(id) {
  if (!domNodes[id]) {
    const attrs = {};
    domNodes[id] = {
      id,
      hidden: false,
      textContent: '',
      classList: {
        toggle() {},
        add() {},
        remove() {},
        contains() { return false; },
      },
      setAttribute(k, v) { attrs[k] = String(v); },
      getAttribute(k) { return attrs[k] == null ? null : attrs[k]; },
      hasAttribute(k) { return attrs[k] != null; },
      removeAttribute(k) { delete attrs[k]; },
      querySelectorAll() { return []; },
      querySelector() { return null; },
      replaceChildren() {},
      addEventListener() {},
      contains() { return false; },
    };
  }
  return domNodes[id];
}

globalThis.document = {
  getElementById: (id) => fakeEl(id),
  querySelector() { return null; },
};
globalThis.OneToneDom = { $: (id) => fakeEl(id) };
globalThis.OneToneCodexMicroPadUi = { closeEditKeycap() {} };
globalThis.OneToneAgentActions = {};
globalThis.OneToneHabitProfile = {};
globalThis.OneToneAppTargetPresets = { presets: [] };

const src = readFileSync(join(root, 'src/js/features/agent/soft-pad-hub-ui.js'), 'utf8').replace(/^\uFEFF/, '');
(0, eval)(src);
const API = globalThis.OneToneSoftPadHub;

console.log('[soft-pad-ensure-cta] 模型:');
check('buildSoftPadEnsureCtaModel 已导出', typeof API.buildSoftPadEnsureCtaModel === 'function');
check('ensureCodex 已导出', typeof API.ensureCodex === 'function');

let model = API.buildSoftPadEnsureCtaModel();
check('label 非空', typeof model.label === 'string' && model.label.length > 0);
check('sig 非空', typeof model.sig === 'string' && model.sig.length > 0);
check('label 含准备 Codex', model.label.includes('准备 Codex') || model.label.includes('Ensure'));

console.log('[soft-pad-ensure-cta] 源码护栏:');
const softPadJs = src;
check('导出 buildSoftPadEnsureCtaModel', softPadJs.includes('buildSoftPadEnsureCtaModel: buildSoftPadEnsureCtaModel'));
check('applySoftPadEnsureCtaHost 岛守卫', softPadJs.includes('__otSoftPadEnsureCtaMounted') && softPadJs.includes('__otSoftPadEnsureCtaSync'));
check('bindChrome 跳过岛挂载后的 ensureBtn', /ensureBtn[\s\S]*?__otSoftPadEnsureCtaMounted/.test(softPadJs));
check('render 接线挂载', softPadJs.includes('__otMountSoftPadEnsureCtaIsland'));

const islandTsx = readFileSync(join(root, 'src-islands/islands/soft-pad-ensure-cta-island.tsx'), 'utf8');
check('岛含 __otSoftPadEnsureCtaSync', islandTsx.includes('__otSoftPadEnsureCtaSync'));
check('岛渲染 model.label', islandTsx.includes('model.label'));
check('岛绑 click → runSoftPadEnsureCodex', islandTsx.includes('runSoftPadEnsureCodex'));

const mainTsx = readFileSync(join(root, 'src-islands/main.tsx'), 'utf8');
check('main 暴露挂载入口', mainTsx.includes('__otMountSoftPadEnsureCtaIsland'));
check('main 挂载 btnSoftPadEnsureCodex', mainTsx.includes("mountIsland('btnSoftPadEnsureCodex'"));

const html = readFileSync(join(root, 'src/index.html'), 'utf8');
check('index 含 btnSoftPadEnsureCodex', html.includes('id="btnSoftPadEnsureCodex"'));

console.log('[soft-pad-ensure-cta] ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
