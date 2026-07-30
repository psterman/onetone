// P14e 单测：buildSoftPadPreviewModel + 守卫源码护栏 + 挂载入口
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
  t: (k) => String(k),
  dict: () => ({}),
  getLang: () => 'zh',
};
globalThis.window = globalThis;

const domNodes = {};
function fakeEl(id) {
  if (!domNodes[id]) {
    const attrs = {};
    const children = [];
    domNodes[id] = {
      id,
      hidden: false,
      _inner: '',
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
      replaceChildren() { this._inner = ''; children.length = 0; },
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
globalThis.OneToneCodexMicroPadUi = {
  renderSoftPadPreview() {},
  resolveSoftPadPreviewPaintHost(h) { return h || fakeEl('softPadPreviewHost'); },
};
globalThis.OneToneAgentActions = {};
globalThis.OneToneHabitProfile = {};
globalThis.OneToneAppTargetPresets = { presets: [] };

const src = readFileSync(join(root, 'src/js/features/agent/soft-pad-hub-ui.js'), 'utf8').replace(/^\uFEFF/, '');
(0, eval)(src);
const API = globalThis.OneToneSoftPadHub;

console.log('[soft-pad-preview] 模型:');
check('buildSoftPadPreviewModel 已导出', typeof API.buildSoftPadPreviewModel === 'function');
check('getSelectedSoftPadMappingForPreview 已导出', typeof API.getSelectedSoftPadMappingForPreview === 'function');

let model = API.buildSoftPadPreviewModel();
check('有选中 mapping 时 mappingId', model.mappingId === 'm1');
check('有 mapping 时 clear=false', model.clear === false);
check('sig 非空', typeof model.sig === 'string' && model.sig.length > 0);

state.selectedMappingId = null;
model = API.buildSoftPadPreviewModel();
check('无选中时 clear+hidden', model.clear === true && model.hidden === true);

const map = API.getSelectedSoftPadMappingForPreview();
check('无选中时 mapping 读桥为 null', map == null);

state.selectedMappingId = 'm1';
check('有选中时 mapping 读桥有 id', API.getSelectedSoftPadMappingForPreview() && API.getSelectedSoftPadMappingForPreview().id === 'm1');

console.log('[soft-pad-preview] 源码护栏:');
const softPadJs = src;
check('导出 buildSoftPadPreviewModel', softPadJs.includes('buildSoftPadPreviewModel: buildSoftPadPreviewModel'));
check('applySoftPadPreviewHost 岛守卫', softPadJs.includes('function applySoftPadPreviewHost') && softPadJs.includes('__otSoftPadPreviewSync'));
check('paintPreview 岛守卫', /function paintPreview\([\s\S]*?__otSoftPadPreviewMounted/.test(softPadJs));
check('clearMain 不摧毁岛 root', /function clearMain\([\s\S]*?__otSoftPadPreviewMounted/.test(softPadJs));
check('showPrepareMain 岛守卫', /function showPrepareMain\([\s\S]*?__otSoftPadPreviewMounted/.test(softPadJs));
check('syncHubChrome preview 岛守卫', /function syncHubChrome\([\s\S]*?__otSoftPadPreviewMounted/.test(softPadJs));
check('render 接线挂载', softPadJs.includes('__otMountSoftPadPreviewIsland'));

const padJs = readFileSync(join(root, 'src/js/features/agent/codex-micro-pad-ui.js'), 'utf8');
check('resolveSoftPadPreviewPaintHost 存在', padJs.includes('function resolveSoftPadPreviewPaintHost'));
check('renderSoftPadPreview 归一 paint host', /function renderSoftPadPreview\([\s\S]*?resolveSoftPadPreviewPaintHost/.test(padJs));
check('导出 resolveSoftPadPreviewPaintHost', padJs.includes('resolveSoftPadPreviewPaintHost: resolveSoftPadPreviewPaintHost'));

const islandTsx = readFileSync(join(root, 'src-islands/islands/soft-pad-preview-island.tsx'), 'utf8');
check('岛含 paint 节点', islandTsx.includes('data-soft-pad-preview-paint'));
check('岛调 Pad paint', islandTsx.includes('paintSoftPadPreviewTarget'));

const mainTsx = readFileSync(join(root, 'src-islands/main.tsx'), 'utf8');
check('main 暴露挂载入口', mainTsx.includes('__otMountSoftPadPreviewIsland'));

console.log('[soft-pad-preview] ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
