// P12b-6 单测：buildKeysTriggerModeModel + renderTriggerModeSegments 守卫 + 挂载入口
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
      triggerMode: 'tap',
    }],
  },
};
const uiState = { settingsPanel: 'keys', habitScenarioReturnId: '' };

globalThis.OneToneState = { state, ui: uiState };
globalThis.OneToneI18n = {
  t: (k) => String(k),
  dict: () => ({}),
  getLang: () => 'zh',
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
      disabled: false,
      dataset: {},
      classList: {
        toggle() {},
        add() {},
        remove() {},
        contains() { return false; },
      },
      setAttribute() {},
      removeAttribute() {},
      getAttribute() { return null; },
    };
  }
  return domNodes[id];
}
globalThis.OneToneDom = { $: (id) => fakeEl(id) };
fakeEl('keysTriggerModeHost');
fakeEl('settingsPanelKeys').hidden = false;

globalThis.OneToneMappingCore = {
  selected: () => state.config.mappings.find((m) => m.id === state.selectedMappingId) || null,
  byId: (id) => state.config.mappings.find((m) => m.id === id) || null,
  editorTrigger: (m) => (m && m.triggerKey) || '',
  editorTarget: (m) => (m && m.targetKey) || '',
};
globalThis.OneToneSettingsDrawer = { isKeysPanel: () => true };
globalThis.OneToneHomeWorkbenchCompat = {
  canUseHoldMode: () => ({ ok: false, reason: 'untested', messageKey: 'keysHoldGateUntested' }),
};
globalThis.OneToneMappingRecording = { mode: () => 'none' };
globalThis.__vp_bootstrap_hooks__ = {};

const src = readFileSync(join(root, 'src/js/features/settings/keys-panel-ui.js'), 'utf8').replace(/^\uFEFF/, '');
(0, eval)(src);
const API = globalThis.OneToneKeysPanelUi;

console.log('[keys-trigger-mode] 模型:');
check('buildKeysTriggerModeModel 已导出', typeof API.buildKeysTriggerModeModel === 'function');

let model = API.buildKeysTriggerModeModel();
check('有映射时有 modeHtml', typeof model.modeHtml === 'string' && model.modeHtml.includes('data-trigger-mode'));
check('triggerUi=tap', model.triggerUi === 'tap');
check('gateOk=false 时 hold gated', model.gateOk === false && model.modeHtml.includes('is-gated'));
check('sig 含 mappingId', typeof model.sig === 'string' && model.sig.indexOf('m1') === 0);

model = API.buildKeysTriggerModeModel(null);
check('空映射 modeHtml 为空', model.modeHtml === '' && model.sig === 'empty');

state.config.mappings[0].triggerMode = 'longpress';
globalThis.OneToneHomeWorkbenchCompat.canUseHoldMode = () => ({ ok: false, reason: 'untested' });
model = API.buildKeysTriggerModeModel();
check('hold+未通过 gate 含风险提示', model.triggerUi === 'hold' && model.modeHtml.includes('keys-hold-risk-hint'));

globalThis.OneToneHomeWorkbenchCompat.canUseHoldMode = () => ({ ok: true, reason: 'ok' });
model = API.buildKeysTriggerModeModel();
check('hold+通过 gate 含 is-hold-supported', model.gateOk === true && model.modeHtml.includes('is-hold-supported'));
state.config.mappings[0].triggerMode = 'tap';
globalThis.OneToneHomeWorkbenchCompat.canUseHoldMode = () => ({ ok: false, reason: 'untested' });

console.log('[keys-trigger-mode] render 守卫:');
globalThis.__otKeysTriggerModeMounted = false;
let syncCalls = 0;
globalThis.__otKeysTriggerModeSync = () => { syncCalls++; };

fakeEl('keysTriggerModeHost')._innerWrites = 0;
API.renderGestureUiOnly();
check('岛未挂时写 host innerHTML', fakeEl('keysTriggerModeHost')._innerWrites >= 1);
check('岛未挂时不调 sync', syncCalls === 0);

globalThis.__otKeysTriggerModeMounted = true;
syncCalls = 0;
fakeEl('keysTriggerModeHost')._innerWrites = 0;
const stale = 'STALE';
fakeEl('keysTriggerModeHost')._inner = stale;
API.renderGestureUiOnly();
check('岛挂载时不写 host innerHTML', fakeEl('keysTriggerModeHost')._innerWrites === 0 && fakeEl('keysTriggerModeHost')._inner === stale);
check('岛挂载时调 __otKeysTriggerModeSync', syncCalls === 1);

console.log('[keys-trigger-mode] 源码护栏:');
const mainSrc = readFileSync(join(root, 'src-islands/main.tsx'), 'utf8');
check('main 延迟挂载入口', mainSrc.includes('__otMountKeysTriggerModeIsland'));
check('挂载到 keysTriggerModeHost', mainSrc.includes("mountIsland('keysTriggerModeHost'"));

const drawerSrc = readFileSync(join(root, 'src/js/features/settings/settings-drawer.js'), 'utf8');
check('settings-drawer 接线挂载', drawerSrc.includes('__otMountKeysTriggerModeIsland'));

const panelSrc = readFileSync(join(root, 'src/js/features/settings/keys-panel-ui.js'), 'utf8');
check('导出 buildKeysTriggerModeModel', panelSrc.includes('buildKeysTriggerModeModel:buildKeysTriggerModeModel'));
check('render 检查岛挂载标志', panelSrc.includes('__otKeysTriggerModeMounted'));

console.log(`[keys-trigger-mode] ${pass} 通过 / ${fail} 失败`);
if (fail > 0) process.exit(1);
