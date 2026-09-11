// P12b-8 单测：buildKeysTriggerConflictModel + renderTriggerConflict 守卫 + 挂载入口
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
fakeEl('keysTriggerConflict');
fakeEl('settingsPanelKeys').hidden = false;

globalThis.OneToneMappingCore = {
  selected: () => state.config.mappings.find((m) => m.id === state.selectedMappingId) || null,
  byId: (id) => state.config.mappings.find((m) => m.id === id) || null,
  editorTrigger: (m) => (m && m.triggerKey) || '',
  editorTarget: (m) => (m && m.targetKey) || '',
  schemeHasConflict: () => false,
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

console.log('[keys-trigger-conflict] 模型:');
check('buildKeysTriggerConflictModel 已导出', typeof API.buildKeysTriggerConflictModel === 'function');

let model = API.buildKeysTriggerConflictModel();
check('无冲突时 hidden', model.hidden === true && model.sig === 'empty');

// Cross-app same key is OK.
state.config.mappings.push({
  id: 'm-other-app',
  appTargetId: 'codex-chat',
  triggerKey: 'F1',
  targetKey: 'Enter',
  enabled: true,
});
state.config.mappings[0].appTargetId = 'cursor-chat';
model = API.buildKeysTriggerConflictModel();
check('跨应用同键不冲突', model.hidden === true);

// Same app same key = conflict.
state.config.mappings.push({
  id: 'm-same-app',
  appTargetId: 'cursor-chat',
  triggerKey: 'F1',
  targetKey: 'RAlt',
  enabled: true,
  label: 'sibling',
});
model = API.buildKeysTriggerConflictModel();
check('同应用同键冲突可见', model.hidden === false);
check('html 含 recommend', typeof model.html === 'string' && model.html.includes('data-keys-conflict-recommend'));
check('html 含 view', model.html.includes('data-keys-conflict-view'));
check('recommend 主按钮带 is-primary', model.html.includes('is-primary'));
check('源码推荐文案含 {key}', src.includes("t('keysConflictRecommend')") && src.includes(".replace('{key}'"));
check('查看占用会 focus 占用方', src.includes('findTriggerConflictPeer') && /core\(\)\.focus\(peer\.id\)/.test(src));
check(
  '冲突仅同 appTargetId',
  /Different apps may share the same key/.test(src) &&
    /other\.appTargetId\|\|''\)\.trim\(\)!==app/.test(src)
);


console.log('[keys-trigger-conflict] 守卫:');
globalThis.__otKeysTriggerConflictMounted = false;
let syncCalls = 0;
globalThis.__otKeysTriggerConflictSync = () => { syncCalls++; };

const panelSrc = src;
check('renderTriggerConflict 岛守卫', panelSrc.includes('__otKeysTriggerConflictMounted') && panelSrc.includes('__otKeysTriggerConflictSync'));
check('导出 buildKeysTriggerConflictModel', panelSrc.includes('buildKeysTriggerConflictModel:buildKeysTriggerConflictModel'));

function simulateRenderConflict() {
  const box = fakeEl('keysTriggerConflict');
  const m = API.buildKeysTriggerConflictModel();
  if (globalThis.__otKeysTriggerConflictMounted && typeof globalThis.__otKeysTriggerConflictSync === 'function') {
    globalThis.__otKeysTriggerConflictSync();
    return;
  }
  box.hidden = !!m.hidden;
  box.innerHTML = m.html || '';
}

globalThis.__otKeysTriggerConflictMounted = false;
syncCalls = 0;
fakeEl('keysTriggerConflict')._innerWrites = 0;
simulateRenderConflict();
check('岛未挂时写 conflict innerHTML', fakeEl('keysTriggerConflict')._innerWrites >= 1);
check('岛未挂时不调 sync', syncCalls === 0);

globalThis.__otKeysTriggerConflictMounted = true;
syncCalls = 0;
fakeEl('keysTriggerConflict')._innerWrites = 0;
const stale = 'STALE';
fakeEl('keysTriggerConflict')._inner = stale;
simulateRenderConflict();
check('岛挂载时不写 conflict innerHTML', fakeEl('keysTriggerConflict')._innerWrites === 0 && fakeEl('keysTriggerConflict')._inner === stale);
check('岛挂载时调 sync', syncCalls === 1);

console.log('[keys-trigger-conflict] 源码护栏:');
const mainSrc = readFileSync(join(root, 'src-islands/main.tsx'), 'utf8');
check('main 延迟挂载入口', mainSrc.includes('__otMountKeysTriggerConflictIsland'));
check('挂载到 keysTriggerConflict', mainSrc.includes("mountIsland('keysTriggerConflict'"));

const drawerSrc = readFileSync(join(root, 'src/js/features/settings/settings-drawer.js'), 'utf8');
check('settings-drawer 接线挂载', drawerSrc.includes('__otMountKeysTriggerConflictIsland'));

const html = readFileSync(join(root, 'src/index.html'), 'utf8');
check('index 含 keysTriggerConflict', html.includes('id="keysTriggerConflict"'));

const islandTsx = readFileSync(join(root, 'src-islands/islands/keys-trigger-conflict-island.tsx'), 'utf8');
check('岛含 sync bridge', islandTsx.includes('__otKeysTriggerConflictSync'));
check('岛用 dangerouslySetInnerHTML', islandTsx.includes('dangerouslySetInnerHTML'));

console.log(`[keys-trigger-conflict] ${pass} 通过 / ${fail} 失败`);
if (fail > 0) process.exit(1);
