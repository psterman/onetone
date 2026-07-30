// P12b-5 单测：buildKeysFinishModeModel + panel/refresh 守卫 + 挂载入口
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
      id: 'm1', triggerKey: 'F1', targetKey: 'Enter', enabled: true,
      triggerMode: 'tap', enterDelayMs: 1200, intervalMs: 800,
      cancelEnabled: true, autoEnterEnabled: true,
    }],
  },
};

globalThis.OneToneState = { state };
globalThis.OneToneI18n = {
  t: (k) => String(k),
  dict: () => ({}),
};
globalThis.window = globalThis;

const domNodes = {};
function fakeEl(id) {
  if (!domNodes[id]) {
    domNodes[id] = {
      id,
      hidden: false,
      _inner: '',
      _innerWrites: 0,
      set innerHTML(v) { this._inner = v; this._innerWrites++; },
      get innerHTML() { return this._inner; },
      textContent: '',
      classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } },
      querySelectorAll() { return []; },
      querySelector() { return null; },
      setAttribute() {},
    };
  }
  return domNodes[id];
}
globalThis.OneToneDom = { $: (id) => fakeEl(id) };

['voiceEndKeyModePanel', 'voiceEndCancelCard', 'voiceEndConfirmCard', 'keysFinishDelayHost', 'keysFinishCancelHost', 'keysFinishModeHost'].forEach(fakeEl);

globalThis.OneToneMappingCore = {
  selected: () => state.config.mappings.find((m) => m.id === state.selectedMappingId) || null,
  isSaved: (m) => !!(m && m.triggerKey && m.targetKey),
  ensureMappingTiming: (m) => m,
};

globalThis.OneToneSceneFlowSummary = new Proxy(
  {
    resolveFinishMode: () => 'confirm',
    finishModesForGesture: () => ['confirm', 'manual'],
    resolveStartGesture: () => 'tap',
    finishStrategyPreviewText: () => ({ text: '—', saved: false }),
  },
  {
    get(target, prop) {
      if (prop in target) return target[prop];
      return () => {};
    },
  },
);

globalThis.OneToneMappingRecording = { mode: () => 'none' };
globalThis.OneToneHabitKeyMappingTable = { syncRowStatus: () => {} };
globalThis.OneToneHabitCompatibility = { render: () => {} };

globalThis.__vp_key_finish_flow_render_hooks__ = {
  ensureConfig: () => {},
  selectedMapping: () => globalThis.OneToneMappingCore.selected(),
  isSavedMapping: (m) => globalThis.OneToneMappingCore.isSaved(m),
  isDraftMapping: () => false,
  ensureMappingTiming: (m) => m,
  escHtml: (s) => String(s),
  selectedDisplayTriggerKey: () => 'F1',
  selectedDisplayTargetKey: () => 'Enter',
  friendlyKeyName: (k) => 'K(' + k + ')',
  homeSchemeLabel: () => 'lbl',
  schemeMappingHasConflict: () => false,
  isCurrentDraftComplete: () => true,
  keyFinishPreviewText: () => ({ summary: 's' }),
  renderHomeKeyFinishPreview: () => {},
  renderMappingList: () => {},
  voiceUiSnapshot: () => ({ end: {} }),
  save: () => {},
};

const src = readFileSync(join(root, 'src/js/features/mapping/key-finish-flow-render.js'), 'utf8').replace(/^\uFEFF/, '');
(0, eval)(src);
const API = globalThis.OneToneKeyFinishFlowRender;

console.log('[keys-finish-mode] 模型:');
check('buildKeysFinishModeModel 已导出', typeof API.buildKeysFinishModeModel === 'function');

let model = API.buildKeysFinishModeModel();
check('有映射时 variant=segmented', model.variant === 'segmented');
check('有映射时 modeHtml 含 data-finish-mode', typeof model.modeHtml === 'string' && model.modeHtml.includes('data-finish-mode'));
check('finishMode=confirm', model.finishMode === 'confirm');
check('sig 含 mappingId', typeof model.sig === 'string' && model.sig.indexOf('m1') === 0);

state.config.mappings[0].triggerKey = '';
state.config.mappings[0].targetKey = '';
model = API.buildKeysFinishModeModel();
check('未保存时 variant=empty', model.variant === 'empty' && model.sig === 'empty');
check('未保存时有空态文案', model.modeHtml.includes('key-finish-empty'));
state.config.mappings[0].triggerKey = 'F1';
state.config.mappings[0].targetKey = 'Enter';

console.log('[keys-finish-mode] panel 守卫:');
globalThis.__otKeysFinishModeMounted = false;
let syncCalls = 0;
globalThis.__otKeysFinishModeSync = () => { syncCalls++; };

fakeEl('voiceEndKeyModePanel')._innerWrites = 0;
API.renderKeyFinishFlowPanel();
check('岛未挂时写 modePanel innerHTML', fakeEl('voiceEndKeyModePanel')._innerWrites >= 1);
check('岛未挂时不调 sync', syncCalls === 0);

globalThis.__otKeysFinishModeMounted = true;
syncCalls = 0;
fakeEl('voiceEndKeyModePanel')._innerWrites = 0;
const stale = 'STALE';
fakeEl('voiceEndKeyModePanel')._inner = stale;
API.renderKeyFinishFlowPanel();
check('岛挂载时不写 modePanel innerHTML', fakeEl('voiceEndKeyModePanel')._innerWrites === 0 && fakeEl('voiceEndKeyModePanel')._inner === stale);
check('岛挂载时调 __otKeysFinishModeSync', syncCalls === 1);

console.log('[keys-finish-mode] refresh 守卫:');
syncCalls = 0;
let toggled = false;
fakeEl('voiceEndKeyModePanel').querySelectorAll = () => [{
  dataset: { finishMode: 'confirm' },
  classList: { toggle() { toggled = true; } },
  setAttribute() {},
}];
API.refreshFinishModeSegment(state.config.mappings[0]);
check('岛挂载时 refresh 调 sync', syncCalls === 1);
check('岛挂载时 refresh 不直接 toggle class', toggled === false);

globalThis.__otKeysFinishModeMounted = false;
syncCalls = 0;
toggled = false;
API.refreshFinishModeSegment(state.config.mappings[0]);
check('岛未挂时 refresh 不调 sync', syncCalls === 0);
check('岛未挂时 refresh 直接 toggle class', toggled === true);

console.log('[keys-finish-mode] 源码护栏:');
const mainSrc = readFileSync(join(root, 'src-islands/main.tsx'), 'utf8');
check('main 延迟挂载入口', mainSrc.includes('__otMountKeysFinishModeIsland'));
check('挂载到 voiceEndKeyModePanel', mainSrc.includes("mountIsland('voiceEndKeyModePanel'"));

const drawerSrc = readFileSync(join(root, 'src/js/features/settings/settings-drawer.js'), 'utf8');
check('settings-drawer 接线挂载', drawerSrc.includes('__otMountKeysFinishModeIsland'));

const finishSrc = readFileSync(join(root, 'src/js/features/mapping/key-finish-flow-render.js'), 'utf8');
check('导出 buildKeysFinishModeModel', finishSrc.includes('buildKeysFinishModeModel:buildKeysFinishModeModel'));
check('panel 检查岛挂载标志', finishSrc.includes('__otKeysFinishModeMounted'));

console.log(`[keys-finish-mode] ${pass} 通过 / ${fail} 失败`);
if (fail > 0) process.exit(1);
