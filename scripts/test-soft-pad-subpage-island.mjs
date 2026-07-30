// P14f 单测：buildSoftPadSubpageModel + 守卫源码护栏 + 挂载入口
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
  renderSoftPadLayoutPanel() {},
  renderSoftPadPresentationPanel() {},
  renderSoftPadRuntimePanel() {},
  renderSoftPadAgentPanel() {},
  resolveSoftPadSubpagePaintHost(h) { return h || fakeEl('softPadSubpageBody'); },
  closeEditKeycap() {},
};
globalThis.OneToneAgentActions = {};
globalThis.OneToneHabitProfile = {};
globalThis.OneToneAppTargetPresets = { presets: [] };

const src = readFileSync(join(root, 'src/js/features/agent/soft-pad-hub-ui.js'), 'utf8').replace(/^\uFEFF/, '');
(0, eval)(src);
const API = globalThis.OneToneSoftPadHub;

console.log('[soft-pad-subpage] 模型:');
check('buildSoftPadFourPanelModel 已导出', typeof API.buildSoftPadFourPanelModel === 'function');
check('buildSoftPadSubpageModel 已导出', typeof API.buildSoftPadSubpageModel === 'function');
check('getSelectedSoftPadMappingForSubpage 已导出', typeof API.getSelectedSoftPadMappingForSubpage === 'function');
check('getSoftPadSubpagePaintOpts 已导出', typeof API.getSoftPadSubpagePaintOpts === 'function');
check('writeSoftPadSubpageAgentPick 已导出', typeof API.writeSoftPadSubpageAgentPick === 'function');

let model = API.buildSoftPadSubpageModel();
check('hub 时 clear=true', model.clear === true && model.mode === 'clear');
check('hub 时 panel 空', !model.panel);
check('sig 非空', typeof model.sig === 'string' && model.sig.length > 0);

const fourPanel = API.buildSoftPadFourPanelModel();
check('fourPanel defaultView 存在', typeof fourPanel.defaultView === 'string' && fourPanel.defaultView.length > 0);

// openSubpage is not easily callable without full UI; poke softPadView via paint path after select.
// Simulate view by calling openSubpage if available, else inspect source guards.
check('有选中时 mapping 读桥有 id', API.getSelectedSoftPadMappingForSubpage() && API.getSelectedSoftPadMappingForSubpage().id === 'm1');

state.selectedMappingId = null;
model = API.buildSoftPadSubpageModel();
check('无选中时 clear', model.clear === true);
check('无选中时 mapping 读桥为 null', API.getSelectedSoftPadMappingForSubpage() == null);

state.selectedMappingId = 'm1';

console.log('[soft-pad-subpage] 源码护栏:');
const softPadJs = src;
check('导出 buildSoftPadFourPanelModel', softPadJs.includes('buildSoftPadFourPanelModel: buildSoftPadFourPanelModel'));
check('导出 buildSoftPadSubpageModel', softPadJs.includes('buildSoftPadSubpageModel: buildSoftPadSubpageModel'));
check('subpage model 读 fourPanel model', /function buildSoftPadSubpageModel\([\s\S]*?buildSoftPadFourPanelModel/.test(softPadJs));
check('applySoftPadSubpageHost 岛守卫', softPadJs.includes('function applySoftPadSubpageHost') && softPadJs.includes('__otSoftPadSubpageSync'));
check('paintSubpage 岛守卫', /function paintSubpage\([\s\S]*?__otSoftPadSubpageMounted/.test(softPadJs));
check('clearSubpage 不摧毁岛 root', /function clearSubpage\([\s\S]*?__otSoftPadSubpageMounted/.test(softPadJs) && /function clearSubpage\([\s\S]*?replaceChildren/.test(softPadJs));
check('clearSubpage 岛路径无 replaceChildren 于 body', (() => {
  const m = softPadJs.match(/function clearSubpage\(\) \{[\s\S]*?\n  \}/);
  if (!m) return false;
  const body = m[0];
  // island path clears attrs then sync; replaceChildren only in else
  return body.includes('__otSoftPadSubpageMounted') && body.includes('else') && body.includes('replaceChildren');
})());
check('render 接线挂载', softPadJs.includes('__otMountSoftPadSubpageIsland'));
check('clearMain 先 hub 再 clearSubpage', /softPadView = 'hub';\s*clearSubpage\(\);/.test(softPadJs));

const padJs = readFileSync(join(root, 'src/js/features/agent/codex-micro-pad-ui.js'), 'utf8');
check('resolveSoftPadSubpagePaintHost 存在', padJs.includes('function resolveSoftPadSubpagePaintHost'));
check('mirrorSoftPadSubpageChrome 存在', padJs.includes('function mirrorSoftPadSubpageChrome'));
check('layout 归一 paint host', /function renderSoftPadLayoutPanel\([\s\S]*?resolveSoftPadSubpagePaintHost/.test(padJs));
check('presentation 归一 paint host', /function renderSoftPadPresentationPanel\([\s\S]*?resolveSoftPadSubpagePaintHost/.test(padJs));
check('runtime 归一 paint host', /function renderSoftPadRuntimePanel\([\s\S]*?resolveSoftPadSubpagePaintHost/.test(padJs));
check('agent 归一 paint host', /function renderSoftPadAgentPanel\([\s\S]*?resolveSoftPadSubpagePaintHost/.test(padJs));
check('导出 resolveSoftPadSubpagePaintHost', padJs.includes('resolveSoftPadSubpagePaintHost: resolveSoftPadSubpagePaintHost'));
check('softPadLayoutEditorHost 读外层 panel', /function softPadLayoutEditorHost\([\s\S]*?data-soft-pad-panel/.test(padJs));

const islandTsx = readFileSync(join(root, 'src-islands/islands/soft-pad-subpage-island.tsx'), 'utf8');
check('岛含 paint 节点', islandTsx.includes('data-soft-pad-subpage-paint'));
check('岛调 paintSoftPadSubpageTarget', islandTsx.includes('paintSoftPadSubpageTarget'));

const domainTs = readFileSync(join(root, 'src-islands/domain/softPadSubpage.ts'), 'utf8');
check('domain 调四面板', domainTs.includes('renderSoftPadLayoutPanel') && domainTs.includes('renderSoftPadAgentPanel'));
check('domain agent-pick', domainTs.includes('writeSoftPadSubpageAgentPick'));

const mainTsx = readFileSync(join(root, 'src-islands/main.tsx'), 'utf8');
check('main 暴露挂载入口', mainTsx.includes('__otMountSoftPadSubpageIsland'));

console.log('[soft-pad-subpage] ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
