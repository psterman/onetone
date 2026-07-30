// P14h 单测：buildSoftPadScopeHintModel + 守卫源码护栏 + 挂载入口
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
      codexMicroPad: {
        enabled: true,
        skin: 'graphite',
        overlayEnabled: true,
        presentation: 'full',
        keys: { a: {}, b: {} },
      },
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

console.log('[soft-pad-scope-hint] 模型:');
check('buildSoftPadScopeHintModel 已导出', typeof API.buildSoftPadScopeHintModel === 'function');

let model = API.buildSoftPadScopeHintModel();
check('text 非空', typeof model.text === 'string' && model.text.length > 0);
check('sig 非空', typeof model.sig === 'string' && model.sig.length > 0);
check('含应用名或绑定文案', model.text.includes('：') || model.text.includes('·'));

console.log('[soft-pad-scope-hint] 源码护栏:');
const softPadJs = src;
check('导出 buildSoftPadScopeHintModel', softPadJs.includes('buildSoftPadScopeHintModel: buildSoftPadScopeHintModel'));
check('updateScopeHint 岛守卫', /function updateScopeHint\([\s\S]*?__otSoftPadScopeHintMounted/.test(softPadJs));
check('updateScopeHint 调 sync', softPadJs.includes('__otSoftPadScopeHintSync'));
check('render 接线挂载', softPadJs.includes('__otMountSoftPadScopeHintIsland'));
check('model 抽出文案逻辑', softPadJs.includes('function buildSoftPadScopeHintModel'));

const islandTsx = readFileSync(join(root, 'src-islands/islands/soft-pad-scope-hint-island.tsx'), 'utf8');
check('岛含 __otSoftPadScopeHintSync', islandTsx.includes('__otSoftPadScopeHintSync'));
check('岛渲染 model.text', islandTsx.includes('model.text'));

const mainTsx = readFileSync(join(root, 'src-islands/main.tsx'), 'utf8');
check('main 暴露挂载入口', mainTsx.includes('__otMountSoftPadScopeHintIsland'));
check('main 挂载 softPadScopeHint', mainTsx.includes("mountIsland('softPadScopeHint'"));

const html = readFileSync(join(root, 'src/index.html'), 'utf8');
check('index 含 softPadScopeHint', html.includes('id="softPadScopeHint"'));

console.log('[soft-pad-scope-hint] ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
