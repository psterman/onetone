// P12b-3 单测：buildRecordCancelBarModel + renderRecordCancelBar / syncCancelButtonHost 守卫
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
    mappings: [{ id: 'm1', triggerKey: 'F1', targetKey: 'Enter', enabled: true }],
  },
};

globalThis.OneToneState = { state };
globalThis.OneToneI18n = {
  t: (k) => String(k),
  dict: () => ({}),
  getLang: () => 'zh',
};

const domNodes = {};
function fakeEl(id) {
  if (!domNodes[id]) {
    domNodes[id] = {
      id,
      textContent: '',
      parentNode: null,
      classList: {
        _set: new Set(),
        toggle(name, on) {
          if (on) this._set.add(name);
          else this._set.delete(name);
        },
        contains(name) { return this._set.has(name); },
      },
    };
  }
  return domNodes[id];
}
globalThis.OneToneDom = { $: (id) => fakeEl(id) };

globalThis.OneToneMappingCore = {
  selected: () => state.config.mappings.find((m) => m.id === state.selectedMappingId) || null,
  isDraft: (m) => !!(m && m.__draft),
  isSaved: (m) => !!(m && m.triggerKey && m.targetKey),
  sorted: () => state.config.mappings,
  formatTriggerTrace: () => '',
};

// Minimal stubs so mapping-recording.js can eval
globalThis.__vp_mapping_recording_hooks__ = {
  getEditorTriggerKey: () => '',
  getEditorTargetKey: () => '',
  friendlyKeyName: (k) => 'K(' + k + ')',
  ensureConfig: () => {},
  resetTargetCapture: () => {},
  save: () => {},
  renderMappingList: () => {},
  pushLog: () => {},
  ui: () => ({ drawerOpen: false }),
  uiBootstrapping: () => false,
  updatePrimaryCTA: () => {},
  renderHeroBadges: () => {},
  renderHome: () => {},
  renderMicDevices: () => {},
  renderAddButton: () => {},
  normalizeTriggerKey: (k) => k,
  normalizeMediaTargetKey: () => '',
  sanitizeTargetCombo: (k) => k,
  isAllowedTriggerKey: () => true,
  shouldIgnoreTriggerLeftClickCapture: () => false,
  setEditorTriggerKey: () => {},
  toast: () => {},
  getAppLang: () => 'zh',
  abandonDraftIfPristine: () => false,
  render: () => {},
  schemeStepFocus: () => '',
  syncKeySchemeTimeline: () => {},
};

const bar = fakeEl('recordCancelBar');
const btn = fakeEl('btnCancelRecord');
btn.parentNode = bar;

const src = readFileSync(join(root, 'src/js/features/mapping/mapping-recording.js'), 'utf8').replace(/^\uFEFF/, '');
(0, eval)(src);
const REC = globalThis.OneToneMappingRecording;

console.log('[record-cancel-bar] 模型:');
check('buildRecordCancelBarModel 已导出', typeof REC.buildRecordCancelBarModel === 'function');

let model = REC.buildRecordCancelBarModel();
check('空闲态 show=false', model.show === false && model.mode === 'none');
check('空闲态 label=cancelDraft', model.label === 'cancelDraft');

REC.setMode('trigger');
model = REC.buildRecordCancelBarModel();
check('录制态 show=true', model.show === true && model.mode === 'trigger');
check('录制态 label=cancelRecord', model.label === 'cancelRecord');
REC.setMode('none');

state.config.mappings[0].__draft = true;
model = REC.buildRecordCancelBarModel();
check('草稿态 show=true', model.show === true);
state.config.mappings[0].__draft = false;

console.log('[record-cancel-bar] render 守卫:');
globalThis.__otRecordCancelBarMounted = false;
let syncCalls = 0;
globalThis.__otRecordCancelBarSync = () => { syncCalls++; };
btn.textContent = '';
bar.classList._set.clear();

REC.setMode('trigger');
REC.renderCancelBar();
check('岛未挂时写 textContent', btn.textContent === 'cancelRecord');
check('岛未挂时 toggle show', bar.classList.contains('show') === true);
check('岛未挂时不调 sync', syncCalls === 0);

globalThis.__otRecordCancelBarMounted = true;
syncCalls = 0;
btn.textContent = 'STALE';
REC.renderCancelBar();
check('岛挂载时不写 textContent', btn.textContent === 'STALE');
check('岛挂载时调 __otRecordCancelBarSync', syncCalls === 1);
REC.setMode('none');

console.log('[record-cancel-bar] syncCancelButtonHost:');
const keysSrc = readFileSync(join(root, 'src/js/features/settings/keys-panel-ui.js'), 'utf8');
check('syncCancelButtonHost 检查岛挂载', keysSrc.includes('__otRecordCancelBarMounted') && keysSrc.includes('if(global.__otRecordCancelBarMounted) return'));

console.log('[record-cancel-bar] 源码护栏:');
const mainSrc = readFileSync(join(root, 'src-islands/main.tsx'), 'utf8');
check('main 延迟挂载入口', mainSrc.includes('__otMountRecordCancelBarIsland'));
check("挂载到 recordCancelBar", mainSrc.includes("mountIsland('recordCancelBar'"));

const drawerSrc = readFileSync(join(root, 'src/js/features/settings/settings-drawer.js'), 'utf8');
check('settings-drawer 接线挂载', drawerSrc.includes('__otMountRecordCancelBarIsland'));

const recSrc = readFileSync(join(root, 'src/js/features/mapping/mapping-recording.js'), 'utf8');
check('导出 buildRecordCancelBarModel', recSrc.includes('buildRecordCancelBarModel:buildRecordCancelBarModel'));

const inputSrc = readFileSync(join(root, 'src/js/features/mapping/mapping-recording-input.js'), 'utf8');
check('mousedown 取消走 composedPath', inputSrc.includes('function isCancelRecordEvent') && inputSrc.includes('composedPath'));
check('mousedown 直接 cancelDraftOrRecording', inputSrc.includes('cancelFromUiEvent') && inputSrc.includes('cancelDraftOrRecording'));

console.log(`[record-cancel-bar] ${pass} 通过 / ${fail} 失败`);
if (fail > 0) process.exit(1);
