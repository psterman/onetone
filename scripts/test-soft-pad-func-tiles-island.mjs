// P14c 单测：buildSoftPadFuncTilesModel + 守卫源码护栏 + 挂载入口
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
    domNodes[id] = {
      id,
      hidden: false,
      _inner: '',
      _innerWrites: 0,
      set innerHTML(v) { this._inner = v; this._innerWrites++; },
      get innerHTML() { return this._inner; },
      textContent: '',
      classList: {
        toggle() {},
        add() {},
        remove() {},
        contains() { return false; },
      },
      setAttribute(k, v) { attrs[k] = String(v); },
      getAttribute(k) { return attrs[k] == null ? null : attrs[k]; },
      removeAttribute(k) { delete attrs[k]; },
      querySelectorAll() { return []; },
      querySelector() { return null; },
      replaceChildren() {},
      addEventListener() {},
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
  resolveSoftPadShowMode: () => 'follow',
  softPadShowModeLabel: () => 'follow-label',
};
globalThis.OneToneAgentActions = {};
globalThis.OneToneHabitProfile = {};
globalThis.OneToneAppTargetPresets = { presets: [] };

const src = readFileSync(join(root, 'src/js/features/agent/soft-pad-hub-ui.js'), 'utf8').replace(/^\uFEFF/, '');
(0, eval)(src);
const API = globalThis.OneToneSoftPadHub;

const entry = {
  mapping: state.config.mappings[0],
  padEnabled: true,
  presentation: 'full',
  title: 'Codex',
  kind: 'codex',
  canPrepare: false,
  canEnable: true,
};

console.log('[soft-pad-func-tiles] 模型:');
check('buildSoftPadFourPanelModel 已导出', typeof API.buildSoftPadFourPanelModel === 'function');
check('buildSoftPadFuncTilesModel 已导出', typeof API.buildSoftPadFuncTilesModel === 'function');

const fourPanel = API.buildSoftPadFourPanelModel(entry);
check('fourPanel 含 4 个 panel', Array.isArray(fourPanel.panels) && fourPanel.panels.length === 4);
check('fourPanel agent 映射 advanced alias', fourPanel.panels.some((p) => p.id === 'agent' && p.aliasId === 'advanced'));
check('fourPanel panelOrder', Array.isArray(fourPanel.panelOrder) && fourPanel.panelOrder[0] === 'runtime');
check('fourPanel landingView', fourPanel.landingView === 'runtime');
check('fourPanel runtime recommended', fourPanel.panels.some((p) => p.id === 'runtime' && p.recommended));

let model = API.buildSoftPadFuncTilesModel(entry);
check('有 entry 时 hidden=false', model.hidden === false);
check('有 tilesHtml 与 data-tile', typeof model.tilesHtml === 'string' && model.tilesHtml.includes('data-tile'));
check('ready=true', model.ready === true);
check('含四块瓷砖', model.tilesHtml.includes('data-tile="runtime"') && model.tilesHtml.includes('data-tile="agent"'));
check('含 recommended 瓷砖', model.tilesHtml.includes('data-recommended="1"'));
check('sig 非空', typeof model.sig === 'string' && model.sig.length > 0);

model = API.buildSoftPadFuncTilesModel(null);
check('无 entry 时 hidden', model.hidden === true && model.tilesHtml === '');

console.log('[soft-pad-func-tiles] 源码护栏:');
const softPadJs = src;
check('导出 buildSoftPadFourPanelModel', softPadJs.includes('buildSoftPadFourPanelModel: buildSoftPadFourPanelModel'));
check('导出 buildSoftPadFuncTilesModel', softPadJs.includes('buildSoftPadFuncTilesModel: buildSoftPadFuncTilesModel'));
check('func tiles 读 fourPanel model', /function buildSoftPadFuncTilesModel\([\s\S]*?buildSoftPadFourPanelModel/.test(softPadJs));
check('applySoftPadFuncTilesHost 岛守卫', softPadJs.includes('function applySoftPadFuncTilesHost') && softPadJs.includes('__otSoftPadFuncTilesSync'));
check('patchActiveTiles 岛守卫', /function patchActiveTiles\([\s\S]*?__otSoftPadFuncTilesSync/.test(softPadJs));
check('syncHubChrome 岛守卫', /function syncHubChrome\([\s\S]*?__otSoftPadFuncTilesMounted/.test(softPadJs));
check('clearMain 不摧毁岛 root', /function clearMain\([\s\S]*?__otSoftPadFuncTilesMounted/.test(softPadJs));
check('render 接线挂载', softPadJs.includes('__otMountSoftPadFuncTilesIsland'));

const mainSrc = readFileSync(join(root, 'src-islands/main.tsx'), 'utf8');
check('main 延迟挂载入口', mainSrc.includes('__otMountSoftPadFuncTilesIsland'));
check('挂载到 softPadFuncTiles', mainSrc.includes("mountIsland('softPadFuncTiles'"));
check('registerSoftPadFuncTilesBridge', mainSrc.includes('registerSoftPadFuncTilesBridge'));

console.log(`[soft-pad-func-tiles] ${pass} 通过 / ${fail} 失败`);
if (fail > 0) process.exit(1);
