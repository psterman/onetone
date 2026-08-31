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
  ensurePad: (mapping) => {
    if (!mapping.codexMicroPad) {
      mapping.codexMicroPad = {
        enabled: true,
        skin: 'graphite',
        overlayEnabled: true,
        presentation: 'full',
        keys: [],
      };
    }
    return mapping.codexMicroPad;
  },
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
check('panelOrder 固定三面板', Array.isArray(model.panelOrder) &&
  model.panelOrder.join(',') === 'runtime,layout,presentation');
check('landingView 默认 layout', model.landingView === 'layout');
check('landingHint 非空', typeof model.landingHint === 'string' && model.landingHint.length > 0);
check('每面板有且仅有一个 primaryCta.act', model.panels.every((p) =>
  p.primaryCta && typeof p.primaryCta.act === 'string' && p.primaryCta.act.length > 0));
const acts = model.panels.map((p) => p.primaryCta.act);
check('CTA acts 为三类', acts.join(',') === 'showMode,focusLayoutKey,focusSkin');
check('layout 0 keys → needsAction', model.panels.find((p) => p.id === 'layout').panelEmpty.mode === 'needsAction');
check('runtime hidden overlay → needsAction',
  model.panels.find((p) => p.id === 'runtime').panelEmpty.mode === 'needsAction');
check('presentation ready', model.panels.find((p) => p.id === 'presentation').panelEmpty.mode === 'ready');
check('layout tile recommended', model.panels.find((p) => p.id === 'layout').recommended === true);

const tiles = API.buildSoftPadFuncTilesModel(entry);
check('func tiles 已隐藏（pad tabs 接管）', tiles.hidden === true && !tiles.tilesHtml);
check('pad ring 已退役', typeof API.buildSoftPadPadRingModel === 'function');
const ringPad = API.buildSoftPadPadRingModel('pad', entry);
const ringAgent = API.buildSoftPadPadRingModel('agent', entry);
const ringTm = API.buildSoftPadPadRingModel('timeline', entry);
check('pad ring 已退役（空芯片）', ringPad.chipsHtml === '' && Array.isArray(ringPad.chips) && ringPad.chips.length === 0);
check('agent/timeline ring 同样退役', ringAgent.chipsHtml === '' && ringTm.chipsHtml === '');
check('无 agent tile', !model.panelOrder.includes('agent'));
check('fourPanel 含 face/padMode', model.face === 'pad' && model.padMode === 'keys');

const chrome = API.softPadPanelExperienceHtml('layout', entry);
check('layout chrome 含主 CTA', chrome.includes('data-act="focusLayoutKey"') && chrome.includes('is-primary'));
check('layout chrome 空态块', chrome.includes('soft-pad-panel-empty'));

hiddenPad.codexMicroPad.overlayEnabled = true;
hiddenPad.codexMicroPad.keys = [{ enabled: true, slotId: 'AG00' }];
const ready = API.buildSoftPadFourPanelModel(entry);
check('有键后 layout ready', ready.panels.find((p) => p.id === 'layout').panelEmpty.mode === 'ready');
check('浮窗开后 runtime ready', ready.panels.find((p) => p.id === 'runtime').panelEmpty.mode === 'ready');
const readyChrome = API.softPadPanelExperienceHtml('runtime', entry);
check('runtime ready 无空壳 primary', readyChrome === '' ||
  (!readyChrome.includes('soft-pad-panel-primary') && !readyChrome.includes('soft-pad-panel-empty')));
const layoutReadyChrome = API.softPadPanelExperienceHtml('layout', entry);
check('layout ready 无空壳 primary', layoutReadyChrome === '');
const lookReadyChrome = API.softPadPanelExperienceHtml('presentation', entry);
check('presentation ready 无空壳 primary', lookReadyChrome === '');

state.selectedMappingId = null;
const keptMaps = state.config.mappings.slice();
state.config.mappings = [];
const previewEmpty = API.buildSoftPadPreviewModel();
check('无 Soft Pad 方案 previewEmpty=noMapping', previewEmpty.previewEmpty === 'noMapping');
check('无 Soft Pad 方案 emptyHtml 非空', typeof previewEmpty.emptyHtml === 'string' &&
  previewEmpty.emptyHtml.includes('soft-pad-preview-empty'));
state.config.mappings = keptMaps;

const shellPadless = {
  id: 'm-shell',
  enabled: true,
  appTargetId: 'qoder-chat',
  agentTemplateId: 'qoder',
};
state.selectedMappingId = 'm-shell';
state.config.mappings = [shellPadless];
const shellEntry = API.resolveSoftPadEntry();
const shellModel = API.buildSoftPadFourPanelModel(shellEntry);
check('Shell Hook mapping 缺 pad 时会补齐配置', !!shellPadless.codexMicroPad);
check('Shell Hook mapping 补齐后三面板可进入', shellModel.hasMapping === true &&
  shellModel.panels.every((p) => p.disabled === false));
state.selectedMappingId = 'm1';
state.config.mappings = keptMaps;

const shellPlaceholder = {
  mapping: null,
  padEnabled: false,
  presentation: 'full',
  title: 'WorkBuddy',
  kind: 'workbuddy',
  appId: 'workbuddy-chat',
  canPrepare: true,
  canEnable: false,
};
const placeholderModel = API.buildSoftPadFourPanelModel(shellPlaceholder);
const placeholderTiles = API.buildSoftPadFuncTilesModel(shellPlaceholder);
check('未准备的内置应用三面板仍可点击', placeholderModel.hasMapping === false &&
  placeholderModel.panels.every((p) => p.disabled === false));
check('未准备的内置应用页签已隐藏', placeholderTiles.hidden === true);

console.log('[soft-pad-3c] 源码护栏:');
check('SOFT_PAD_PANEL_ORDER 常量', hubSrc.includes("SOFT_PAD_PANEL_ORDER = ['runtime', 'layout', 'presentation']"));
check('Pad 用 softPadExperienceChrome', readFileSync(join(root, 'src/js/features/agent/codex-micro-pad-ui.js'), 'utf8')
  .includes('softPadExperienceChrome('));
check('Pad 绑 focusLayoutKey', readFileSync(join(root, 'src/js/features/agent/codex-micro-pad-ui.js'), 'utf8')
  .includes('focusLayoutKey'));
check('pad ring sync 存在', hubSrc.includes('function syncSoftPadPadRing') && hubSrc.includes('function buildSoftPadPadRingModel'));
check('isLandLocked 已导出', typeof API.isLandLocked === 'function' && hubSrc.includes('isLandLocked: isLandLocked'));
const padSrc = readFileSync(join(root, 'src/js/features/agent/codex-micro-pad-ui.js'), 'utf8');
check('preview key 尊重 isLandLocked', padSrc.includes('Hub.isLandLocked()') &&
  /function softPadPreviewEditKey\([\s\S]*?isLandLocked/.test(padSrc));
check('pad ring 落地锁忽略', /function handlePadRingAct\([\s\S]*?isLandLocked\(\)/.test(hubSrc));

console.log(`[soft-pad-3c] ${pass} 通过 / ${fail} 失败`);
if (fail > 0) process.exit(1);
