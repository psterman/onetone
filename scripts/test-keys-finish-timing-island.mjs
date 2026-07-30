// P12b-2 单测：buildKeysFinishTimingModel + renderKeyFinishFlowPanel 岛守卫
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
    };
  }
  return domNodes[id];
}
globalThis.OneToneDom = { $: (id) => fakeEl(id) };

// Ensure hosts exist before panel render
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

globalThis.OneToneMappingRecording = {
  mode: () => 'none',
};

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

console.log('[keys-finish-timing] 模型:');
check('buildKeysFinishTimingModel 已导出', typeof API.buildKeysFinishTimingModel === 'function');
check('syncAllTimingRanges 已导出', typeof API.syncAllTimingRanges === 'function');

const model = API.buildKeysFinishTimingModel();
check('confirm 模式有 delayHtml', typeof model.delayHtml === 'string' && model.delayHtml.includes('data-timing-range'));
check('confirm 模式有 cancelHtml', typeof model.cancelHtml === 'string' && model.cancelHtml.length > 0);
check('confirm 模式 hosts 可见', model.delayHidden === false && model.cancelHidden === false);
check('sig 含 mappingId', typeof model.sig === 'string' && model.sig.indexOf('m1') === 0);

globalThis.OneToneSceneFlowSummary.resolveFinishMode = () => 'manual';
const hiddenModel = API.buildKeysFinishTimingModel();
check('非 confirm 时 hidden', hiddenModel.delayHidden === true && hiddenModel.cancelHidden === true && !hiddenModel.delayHtml);
globalThis.OneToneSceneFlowSummary.resolveFinishMode = () => 'confirm';

console.log('[keys-finish-timing] panel 守卫:');
globalThis.__otKeysFinishTimingMounted = false;
let syncCalls = 0;
globalThis.__otKeysFinishTimingSync = () => { syncCalls++; };

fakeEl('keysFinishDelayHost')._innerWrites = 0;
fakeEl('keysFinishCancelHost')._innerWrites = 0;
API.renderKeyFinishFlowPanel();
check('岛未挂时写 delayHost innerHTML', fakeEl('keysFinishDelayHost')._innerWrites >= 1);
check('岛未挂时不调 sync', syncCalls === 0);

globalThis.__otKeysFinishTimingMounted = true;
syncCalls = 0;
fakeEl('keysFinishDelayHost')._innerWrites = 0;
fakeEl('keysFinishCancelHost')._innerWrites = 0;
const staleDelay = 'STALE';
fakeEl('keysFinishDelayHost')._inner = staleDelay;
API.renderKeyFinishFlowPanel();
check('岛挂载时不写 delayHost innerHTML', fakeEl('keysFinishDelayHost')._innerWrites === 0 && fakeEl('keysFinishDelayHost')._inner === staleDelay);
check('岛挂载时调 __otKeysFinishTimingSync', syncCalls === 1);

console.log('[keys-finish-timing] 源码护栏:');
const mainSrc = readFileSync(join(root, 'src-islands/main.tsx'), 'utf8');
check('main 延迟挂载入口', mainSrc.includes('__otMountKeysFinishTimingIsland'));
check('挂载到 keysFinishDelayHost/CancelHost', mainSrc.includes("mountIsland('keysFinishDelayHost'") && mainSrc.includes("mountIsland('keysFinishCancelHost'"));

const drawerSrc = readFileSync(join(root, 'src/js/features/settings/settings-drawer.js'), 'utf8');
check('settings-drawer 接线挂载', drawerSrc.includes('__otMountKeysFinishTimingIsland'));

const finishSrc = readFileSync(join(root, 'src/js/features/mapping/key-finish-flow-render.js'), 'utf8');
check('导出 buildKeysFinishTimingModel', finishSrc.includes('buildKeysFinishTimingModel:buildKeysFinishTimingModel'));
check('panel 检查岛挂载标志', finishSrc.includes('__otKeysFinishTimingMounted'));

console.log(`[keys-finish-timing] ${pass} 通过 / ${fail} 失败`);
if (fail > 0) process.exit(1);
