// SoftPad #3c：四面板体验模型（顺序 / landing / primaryCta / panelEmpty）
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

const hiddenPad = {
  id: 'm1',
  triggerKey: 'F1',
  targetKey: 'Enter',
  enabled: true,
  appTargetId: 'codex-chat',
  agentTemplateId: 'codex',
  codexMicroPad: {
    enabled: true,
    skin: 'graphite',
    overlayEnabled: false,
    presentation: 'full',
    keys: [],
  },
};

const state = {
  selectedMappingId: 'm1',
  config: { mappings: [hiddenPad] },
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
      _inner: '',
      set innerHTML(v) { this._inner = v; },
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
  resolveSoftPadShowMode: (pad) => (pad && pad.overlayEnabled ? 'follow' : 'hidden'),
  softPadShowModeLabel: (mode) => String(mode),
};
globalThis.OneToneAgentActions = {};
globalThis.OneToneHabitProfile = {};
globalThis.OneToneAppTargetPresets = { presets: [] };

const hubSrc = readFileSync(join(root, 'src/js/features/agent/soft-pad-hub-ui.js'), 'utf8').replace(/^\uFEFF/, '');
(0, eval)(hubSrc);
const API = globalThis.OneToneSoftPadHub;

const entry = {
  mapping: hiddenPad,
  padEnabled: true,
  presentation: 'full',
  title: 'Codex',
  kind: 'codex',
  canPrepare: false,
  canEnable: true,
};

console.log('[soft-pad-3c] fourPanel experience:');
check('buildSoftPadFourPanelModel 已导出', typeof API.buildSoftPadFourPanelModel === 'function');
check('softPadPanelExperienceHtml 已导出', typeof API.softPadPanelExperienceHtml === 'function');

const model = API.buildSoftPadFourPanelModel(entry);
check('panelOrder 固定四面板', Array.isArray(model.panelOrder) &&
  model.panelOrder.join(',') === 'runtime,layout,presentation,agent');
check('landingView 默认 runtime', model.landingView === 'runtime');
check('landingHint 非空', typeof model.landingHint === 'string' && model.landingHint.length > 0);
check('每面板有且仅有一个 primaryCta.act', model.panels.every((p) =>
  p.primaryCta && typeof p.primaryCta.act === 'string' && p.primaryCta.act.length > 0));
const acts = model.panels.map((p) => p.primaryCta.act);
check('CTA acts 为四类', acts.join(',') === 'showMode,focusLayoutKey,focusSkin,focusAgent');
check('layout 0 keys → needsAction', model.panels.find((p) => p.id === 'layout').panelEmpty.mode === 'needsAction');
check('runtime hidden overlay → needsAction',
  model.panels.find((p) => p.id === 'runtime').panelEmpty.mode === 'needsAction');
check('presentation ready', model.panels.find((p) => p.id === 'presentation').panelEmpty.mode === 'ready');
check('runtime tile recommended', model.panels.find((p) => p.id === 'runtime').recommended === true);

const tiles = API.buildSoftPadFuncTilesModel(entry);
check('tiles 含 data-recommended', tiles.tilesHtml.includes('data-recommended="1"'));
check('tiles landingView=runtime', tiles.landingView === 'runtime');

const chrome = API.softPadPanelExperienceHtml('layout', entry);
check('layout chrome 含主 CTA', chrome.includes('data-act="focusLayoutKey"') && chrome.includes('is-primary'));
check('layout chrome 空态块', chrome.includes('soft-pad-panel-empty'));

hiddenPad.codexMicroPad.overlayEnabled = true;
hiddenPad.codexMicroPad.keys = [{ enabled: true, slotId: 'AG00' }];
const ready = API.buildSoftPadFourPanelModel(entry);
check('有键后 layout ready', ready.panels.find((p) => p.id === 'layout').panelEmpty.mode === 'ready');
check('浮窗开后 runtime ready', ready.panels.find((p) => p.id === 'runtime').panelEmpty.mode === 'ready');
const readyChrome = API.softPadPanelExperienceHtml('runtime', entry);
check('runtime ready 为 slim primary', readyChrome.includes('soft-pad-panel-primary') &&
  !readyChrome.includes('soft-pad-panel-empty'));

state.selectedMappingId = null;
const keptMaps = state.config.mappings.slice();
state.config.mappings = [];
const previewEmpty = API.buildSoftPadPreviewModel();
check('无 Soft Pad 方案 previewEmpty=noMapping', previewEmpty.previewEmpty === 'noMapping');
check('无 Soft Pad 方案 emptyHtml 非空', typeof previewEmpty.emptyHtml === 'string' &&
  previewEmpty.emptyHtml.includes('soft-pad-preview-empty'));
state.config.mappings = keptMaps;

console.log('[soft-pad-3c] 源码护栏:');
check('SOFT_PAD_PANEL_ORDER 常量', hubSrc.includes("SOFT_PAD_PANEL_ORDER = ['runtime', 'layout', 'presentation', 'agent']"));
check('Pad 用 softPadExperienceChrome', readFileSync(join(root, 'src/js/features/agent/codex-micro-pad-ui.js'), 'utf8')
  .includes('softPadExperienceChrome('));
check('Pad 绑 focusLayoutKey', readFileSync(join(root, 'src/js/features/agent/codex-micro-pad-ui.js'), 'utf8')
  .includes('focusLayoutKey'));

console.log(`[soft-pad-3c] ${pass} 通过 / ${fail} 失败`);
if (fail > 0) process.exit(1);
