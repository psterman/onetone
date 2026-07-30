// P12b-1 单测：buildEditorDisplayModel + renderEditor / 录音预览岛守卫
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
const dict = {
  triggerPlaceholder: '触发键',
  targetPlaceholder: '目标键',
};

globalThis.OneToneState = { state };
globalThis.OneToneI18n = { dict: () => dict, t: (k) => String(k), getLang: () => 'zh' };

const domNodes = {};
function fakeEl(id) {
  if (!domNodes[id]) {
    domNodes[id] = {
      id,
      hidden: false,
      textContent: '',
      classList: {
        _set: new Set(),
        toggle(name, on) {
          if (on) this._set.add(name);
          else this._set.delete(name);
        },
        add(name) { this._set.add(name); },
        remove(name) { this._set.delete(name); },
        contains(name) { return this._set.has(name); },
      },
    };
  }
  return domNodes[id];
}
globalThis.OneToneDom = { $: (id) => fakeEl(id) };

globalThis.OneToneMappingCore = {
  selected: () => state.config.mappings.find((m) => m.id === state.selectedMappingId) || null,
  isDraft: () => false,
  isSaved: (m) => !!(m && m.triggerKey && m.targetKey),
  sorted: () => state.config.mappings,
  formatTriggerTrace: () => '',
};

globalThis.OneToneKeyLabels = {
  triggerDisplayLabel: (m) => (m.triggerKey ? 'LBL(' + m.triggerKey + ')' : ''),
};

let recMode = 'none';
let recPreview = '';
globalThis.OneToneMappingRecording = {
  mode: () => recMode,
  previewKey: () => recPreview,
};

globalThis.__vp_mapping_list_hooks__ = {
  selectedDisplayTriggerKey: () => {
    const m = globalThis.OneToneMappingCore.selected();
    return (m && m.triggerKey) || '';
  },
  selectedDisplayTargetKey: () => {
    const m = globalThis.OneToneMappingCore.selected();
    return (m && m.targetKey) || '';
  },
  friendlyKeyName: (k) => 'K(' + k + ')',
  updatePrimaryCTA: () => {},
  applyKeyWakeRecordingUi: () => {},
  renderKeySchemeCardHeader: () => {},
  syncKeySchemeTimeline: () => {},
  schemeStepFocus: () => '',
  renderHome: () => {},
  renderRecordCancelBar: () => {},
  recordingMode: () => 'none',
  recordingMappingId: () => '',
  ensureConfig: () => {},
  ensureMappingTiming: () => {},
  ensureMappingExtras: () => {},
  isAutoTriggerMapping: () => false,
  escHtml: (s) => String(s),
  syncAllTimingRanges: () => {},
};

const listSrc = readFileSync(join(root, 'src/js/features/mapping/mapping-list.js'), 'utf8').replace(/^\uFEFF/, '');
(0, eval)(listSrc);
const ML = globalThis.OneToneMappingList;

console.log('[mapping-editor-display] 模型:');
check('buildEditorDisplayModel 已导出', typeof ML.buildEditorDisplayModel === 'function');

const model = ML.buildEditorDisplayModel();
check('triggerLabel 来自 KeyLabels', model.triggerLabel === 'LBL(F1)');
check('targetLabel 友好名', model.targetLabel === 'K(Enter)');
check('triggerEmpty/targetEmpty false', model.triggerEmpty === false && model.targetEmpty === false);
check('sig 非空', typeof model.sig === 'string' && model.sig.length > 0);

recMode = 'trigger';
recPreview = 'F8';
const previewModel = ML.buildEditorDisplayModel();
check('录音预览覆盖 trigger', previewModel.triggerLabel === 'K(F8)' && previewModel.triggerRaw === 'F8');
recMode = 'none';
recPreview = '';

console.log('[mapping-editor-display] renderEditor 守卫:');
fakeEl('triggerView').textContent = '';
fakeEl('targetView').textContent = '';
globalThis.__otMappingEditorDisplayMounted = false;
let syncCalls = 0;
globalThis.__otMappingEditorDisplaySync = () => { syncCalls++; };

ML.renderEditor();
check('岛未挂时写 textContent', fakeEl('triggerView').textContent === 'LBL(F1)' && fakeEl('targetView').textContent === 'K(Enter)');
check('岛未挂时不调 sync', syncCalls === 0);

fakeEl('triggerView').textContent = 'STALE';
fakeEl('targetView').textContent = 'STALE';
globalThis.__otMappingEditorDisplayMounted = true;
syncCalls = 0;
ML.renderEditor();
check('岛挂载时不写 textContent', fakeEl('triggerView').textContent === 'STALE' && fakeEl('targetView').textContent === 'STALE');
check('岛挂载时调 __otMappingEditorDisplaySync', syncCalls === 1);
check('empty class 仍由 legacy 维护', fakeEl('triggerDisplay').classList.contains('empty') === false);

console.log('[mapping-editor-display] 源码护栏:');
const recSrc = readFileSync(join(root, 'src/js/features/mapping/mapping-recording.js'), 'utf8');
check('updateRecordingPreview 检查岛挂载', recSrc.includes('__otMappingEditorDisplayMounted'));
check('录音预览走 sync', recSrc.includes('__otMappingEditorDisplaySync'));
check('previewKey 已导出', recSrc.includes('previewKey:function()'));

const mainSrc = readFileSync(join(root, 'src-islands/main.tsx'), 'utf8');
check('main 延迟挂载入口', mainSrc.includes('__otMountMappingEditorDisplayIsland'));
check('挂载到 triggerView/targetView', mainSrc.includes("mountIsland('triggerView'") && mainSrc.includes("mountIsland('targetView'"));

const drawerSrc = readFileSync(join(root, 'src/js/features/settings/settings-drawer.js'), 'utf8');
check('settings-drawer 接线挂载', drawerSrc.includes('__otMountMappingEditorDisplayIsland'));

console.log(`[mapping-editor-display] ${pass} 通过 / ${fail} 失败`);
if (fail > 0) process.exit(1);
