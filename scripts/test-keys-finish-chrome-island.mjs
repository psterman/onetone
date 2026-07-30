// P12b-7 单测：buildKeysFinishChromeModel + chrome 守卫 + 挂载入口
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
      open: false,
      _inner: '',
      _innerWrites: 0,
      set innerHTML(v) { this._inner = v; this._innerWrites++; },
      get innerHTML() { return this._inner; },
      textContent: '',
      className: '',
      classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } },
      querySelectorAll() { return []; },
      querySelector() { return null; },
      setAttribute() {},
    };
  }
  return domNodes[id];
}
globalThis.OneToneDom = { $: (id) => fakeEl(id) };

['voiceEndKeyModePanel', 'voiceEndCancelCard', 'voiceEndConfirmCard', 'keysFinishDelayHost', 'keysFinishCancelHost', 'keysFinishModeHost', 'keysFinishModeHint', 'keysFinishStrategyPreview', 'habitFlowFinishMore'].forEach(fakeEl);

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
    finishStrategyPreviewText: () => ({ text: 'preview-ok', saved: true }),
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

console.log('[keys-finish-chrome] 模型:');
check('buildKeysFinishChromeModel 已导出', typeof API.buildKeysFinishChromeModel === 'function');

let model = API.buildKeysFinishChromeModel();
check('confirm 时 moreHidden=false', model.moreHidden === false);
check('hintHidden=false', model.hintHidden === false);
check('hintText 非空', typeof model.hintText === 'string' && model.hintText.length > 0);
check('previewText', model.previewText === 'preview-ok');
check('previewClass is-set', String(model.previewClass).includes('is-set'));
check('sig 含 mappingId', typeof model.sig === 'string' && model.sig.indexOf('m1') === 0);

console.log('[keys-finish-chrome] 守卫:');
globalThis.__otKeysFinishChromeMounted = false;
let syncCalls = 0;
globalThis.__otKeysFinishChromeSync = () => { syncCalls++; };

fakeEl('keysFinishModeHint').textContent = '';
API.renderKeysFinishStrategyPreview(state.config.mappings[0]);
check('岛未挂时写 preview text', fakeEl('keysFinishStrategyPreview').textContent === 'preview-ok');
check('岛未挂时不调 sync', syncCalls === 0);

globalThis.__otKeysFinishChromeMounted = true;
syncCalls = 0;
const stale = 'STALE';
fakeEl('keysFinishStrategyPreview').textContent = stale;
API.renderKeysFinishStrategyPreview(state.config.mappings[0]);
check('岛挂载时不写 preview text', fakeEl('keysFinishStrategyPreview').textContent === stale);
check('岛挂载时调 sync', syncCalls === 1);

syncCalls = 0;
API.refreshFinishModeSegment(state.config.mappings[0]);
check('refresh 岛挂载时调 chrome sync', syncCalls >= 1);

console.log('[keys-finish-chrome] 源码护栏:');
const mainSrc = readFileSync(join(root, 'src-islands/main.tsx'), 'utf8');
check('main 延迟挂载入口', mainSrc.includes('__otMountKeysFinishChromeIsland'));
check('挂载到 keysFinishModeHint', mainSrc.includes("mountIsland('keysFinishModeHint'"));

const drawerSrc = readFileSync(join(root, 'src/js/features/settings/settings-drawer.js'), 'utf8');
check('settings-drawer 接线挂载', drawerSrc.includes('__otMountKeysFinishChromeIsland'));

const finishSrc = readFileSync(join(root, 'src/js/features/mapping/key-finish-flow-render.js'), 'utf8');
check('导出 buildKeysFinishChromeModel', finishSrc.includes('buildKeysFinishChromeModel:buildKeysFinishChromeModel'));
check('chrome 检查岛挂载标志', finishSrc.includes('__otKeysFinishChromeMounted'));

const html = readFileSync(join(root, 'src/index.html'), 'utf8');
check('index 含 keysFinishModeHint', html.includes('id="keysFinishModeHint"'));
check('index 含 keysFinishStrategyPreview', html.includes('id="keysFinishStrategyPreview"'));
check('index 含 habitFlowFinishMore', html.includes('id="habitFlowFinishMore"'));

console.log(`[keys-finish-chrome] ${pass} 通过 / ${fail} 失败`);
if (fail > 0) process.exit(1);
