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
// Soft Pad falls back to current app scope (codex) when habit selection is empty.
check('无习惯选中时仍落到 scope Soft Pad', model.mappingId === 'm1' && model.clear === false);
check('无习惯选中时 preview 读桥仍有 mapping', API.getSelectedSoftPadMappingForPreview() && API.getSelectedSoftPadMappingForPreview().id === 'm1');

state.config.mappings = state.config.mappings.filter(function (m) { return m.id !== 'm1'; });
model = API.buildSoftPadPreviewModel();
check('无 Soft Pad 方案时 clear=true', model.clear === true);
check('无 Soft Pad 方案时 previewEmpty=noMapping', model.previewEmpty === 'noMapping');
check('无 Soft Pad 方案时 emptyHtml', typeof model.emptyHtml === 'string' && model.emptyHtml.includes('soft-pad-preview-empty'));
check('无 Soft Pad 方案时 mapping 读桥为 null', API.getSelectedSoftPadMappingForPreview() == null);

state.config.mappings.unshift({
  id: 'm1',
  triggerKey: 'F1',
  targetKey: 'Enter',
  enabled: true,
  appTargetId: 'codex-chat',
  agentTemplateId: 'codex',
  softPadKind: 'codex',
  codexMicroPad: {
    enabled: true,
    skin: 'graphite',
    overlayEnabled: true,
    presentation: 'full',
    keys: { a: {}, b: {} },
  },
});
state.selectedMappingId = 'm1';
check('有选中时 mapping 读桥有 id', API.getSelectedSoftPadMappingForPreview() && API.getSelectedSoftPadMappingForPreview().id === 'm1');

// Habit editor often parks selectedMappingId on a non-Soft-Pad habit (「通用设置」).
state.selectedMappingId = 'universal-settings';
state.config.mappings.push({
  id: 'universal-settings',
  triggerKey: 'F2',
  targetKey: 'Tab',
  enabled: true,
  group: '通用设置',
});
check('通用设置选中时仍 resolve 到 Soft Pad mapping', API.resolveSoftPadEntry && API.resolveSoftPadEntry().mapping.id === 'm1');
check('通用设置选中时 preview model 仍有 mappingId', API.buildSoftPadPreviewModel().mappingId === 'm1');
check('通用设置选中时 clear=false', API.buildSoftPadPreviewModel().clear === false);
check('render 采用 Soft Pad 方案', src.includes('resolveSoftPadEntry') && src.includes('adoptSoftPadSelection'));
check('setSoftPadFace 走 resolveSoftPadEntry', /function setSoftPadFace\([\s\S]*?resolveSoftPadEntry\(/.test(src));
check('setSoftPadFace 会 adopt Soft Pad', /function setSoftPadFace\([\s\S]*?adoptSoftPadSelection\(/.test(src));
globalThis.OneToneCodexMicroPadUi.renderSoftPadAgentPanel = function () {};
globalThis.OneToneCodexMicroPadUi.renderSoftPadRuntimePanel = function () {};
API.openSubpage('agent');
check('通用设置下点状态灯会 adopt Soft Pad id', state.selectedMappingId === 'm1');
check('通用设置下点状态灯四面板为 agent', API.buildSoftPadFourPanelModel().activeView === 'agent');
check('agent face 不走 pad detail 壳', API.buildSoftPadFourPanelModel().detailOpen === false && API.getFace() === 'agent');
state.selectedMappingId = 'm1';
API.setSoftPadFace('pad', { padMode: 'appear' });

console.log('[soft-pad-preview] 源码护栏:');
const softPadJs = src;
check('导出 buildSoftPadPreviewModel', softPadJs.includes('buildSoftPadPreviewModel: buildSoftPadPreviewModel'));
check('applySoftPadPreviewHost 岛守卫', softPadJs.includes('function applySoftPadPreviewHost') && softPadJs.includes('__otSoftPadPreviewSync'));
check('paintPreview 岛守卫', /function paintPreview\([\s\S]*?__otSoftPadPreviewMounted/.test(softPadJs));
check('clearMain 不摧毁岛 root', /function clearMain\([\s\S]*?__otSoftPadPreviewMounted/.test(softPadJs));
check('showPrepareMain 岛守卫', /function showPrepareMain\([\s\S]*?__otSoftPadPreviewMounted/.test(softPadJs));
check('syncFaceChrome preview 岛守卫', /function syncFaceChrome\([\s\S]*?__otSoftPadPreviewMounted/.test(softPadJs));
check('render 接线挂载', softPadJs.includes('__otMountSoftPadPreviewIsland'));

const padJs = readFileSync(join(root, 'src/js/features/agent/codex-micro-pad-ui.js'), 'utf8');
check('resolveSoftPadPreviewPaintHost 存在', padJs.includes('function resolveSoftPadPreviewPaintHost'));
check('renderSoftPadPreview 归一 paint host', /function renderSoftPadPreview\([\s\S]*?resolveSoftPadPreviewPaintHost/.test(padJs));
check('导出 resolveSoftPadPreviewPaintHost', padJs.includes('resolveSoftPadPreviewPaintHost: resolveSoftPadPreviewPaintHost'));

const islandTsx = readFileSync(join(root, 'src-islands/islands/soft-pad-preview-island.tsx'), 'utf8');
check('岛含 paint 节点', islandTsx.includes('data-soft-pad-preview-paint'));
check('岛调 Pad paint', islandTsx.includes('paintSoftPadPreviewTarget'));
check('首挂强制清 sig', /mountedOnce[\s\S]*?currentSig = ''/.test(islandTsx));
check('paintPreview 等键盘落地再记 paintedMappingId', /soft-pad-preview[\s\S]*?paintedMappingId = String\(entry\.mapping\.id\)/.test(softPadJs));

const mainTsx = readFileSync(join(root, 'src-islands/main.tsx'), 'utf8');
check('main 暴露挂载入口', mainTsx.includes('__otMountSoftPadPreviewIsland'));

console.log('[soft-pad-preview] ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
