// P13 单测：habit-hub.js chrome model 契约 + 岛守卫 + scheduleHubPaint
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
  config: {
    activeSceneId: 'm1',
    mappings: [
      {
        id: 'm1',
        group: 'Test App Habit',
        enabled: true,
        appTargetId: 'notepad.exe',
        order: 0,
        updatedAt: Date.now(),
      },
    ],
  },
};
const uiState = {
  habitHubFilter: 'all',
  habitHubSort: 'manual',
  habitHubRenameId: '',
  habitHubConfirmDelId: '',
  habitHubCreating: false,
  habitHubSelectedIds: [],
  habitHubBatchConfirm: false,
};

globalThis.OneToneState = { state, ui: uiState };
globalThis.OneToneI18n = {
  t: (k) => String(k),
  dict: () => ({}),
  getLang: () => 'zh',
};
globalThis.OneToneDom = {
  $: (id) => {
    if (!domNodes[id]) {
      domNodes[id] = {
        id,
        hidden: false,
        _inner: '',
        _innerWrites: 0,
        classList: { toggle: () => {} },
        setAttribute: () => {},
        querySelectorAll: () => [],
        set innerHTML(v) { this._inner = v; this._innerWrites++; },
        get innerHTML() { return this._inner; },
      };
    }
    return domNodes[id];
  },
};
const domNodes = {};

globalThis.OneToneMappingCore = {
  ensureConfig: () => {},
  sorted: () => state.config.mappings,
  isSaved: (m) => !!(m && m.id),
};

globalThis.OneToneHabitProfile = {
  habitDisplayName: (m) => m.group || m.id,
  habitType: () => 'app',
  isLibraryHabit: () => true,
  project: () => ({ habitType: 'app', isActive: true, keyEnabled: true }),
  hasAppParts: () => true,
  configuredAppIds: () => ['notepad.exe'],
};

globalThis.OneToneHabitOverrideDiff = {
  isAppScenarioMapping: (m) => !!(m && m.appTargetId),
  findGlobalBaselineMapping: () => null,
};

globalThis.OneToneAppBehaviorRules = {
  customRulesForMapping: () => [],
  hydrateCustomRuleChipIcons: () => {},
  scheduleHydrateCustomRuleIcons: () => {},
};

globalThis.OneToneAppSession = {
  isBootSettling: () => false,
  whenBootSettled: (fn) => fn(),
};

globalThis.document = {
  querySelector: () => null,
  querySelectorAll: () => [],
};

globalThis.requestAnimationFrame = (fn) => {
  fn();
  return 0;
};

const src = readFileSync(join(root, 'src/js/features/mapping/habit-hub.js'), 'utf8').replace(/^\uFEFF/, '');
(0, eval)(src);
const Hub = globalThis.OneToneHabitHub;

console.log('[habit-hub-chrome-island] chrome 契约:');
check('guideView 已导出', typeof Hub.guideView === 'function');
check('buildHabitHubChromeModel 已导出', typeof Hub.buildHabitHubChromeModel === 'function');
check('afterHabitHubChromeCommit 已导出', typeof Hub.afterHabitHubChromeCommit === 'function');
check('scheduleHubPaint 已导出', typeof Hub.scheduleHubPaint === 'function');

const chrome = Hub.buildHabitHubChromeModel();
check('chrome model 含 guideHtml', typeof chrome.guideHtml === 'string' && chrome.guideHtml.includes('habit-hub-guide-steps'));
check('chrome model 含 sort.options', Array.isArray(chrome.sort.options) && chrome.sort.options.length === 4);
check('chrome model hasContent 与列表同源', chrome.hasContent === true);
check('empty.hidden 与 hasContent 一致', chrome.empty.hidden === chrome.hasContent);

const guide = Hub.guideView({ ready: true }, 1);
check('guideView 返回 HTML', typeof guide === 'string' && guide.includes('habit-hub-guide-step'));

console.log('[habit-hub-chrome-island] 岛守卫:');
globalThis.__otHabitHubChromeMounted = true;
let chromeSyncCalled = 0;
globalThis.__otHabitHubChromeSync = () => { chromeSyncCalled++; };
globalThis.OneToneIslands = { isMounted: (id) => id === 'habitHubList' };
const stepsHost = globalThis.OneToneDom.$('habitHubGuideSteps');
stepsHost._innerWrites = 0;
Hub.render();
check('chrome 岛挂载时 renderLabels 不写 guideSteps', stepsHost._innerWrites === 0);

globalThis.OneToneIslands = { isMounted: () => false };
let renderCalls = 0;
const origRender = Hub.render;
Hub.render = () => { renderCalls++; };
Hub.scheduleHubPaint();
check('scheduleHubPaint 不触发全量 render', renderCalls === 0);

console.log(`[habit-hub-chrome-island] ${pass} 通过 / ${fail} 失败`);
if (fail > 0) process.exit(1);
