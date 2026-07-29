// P12 单测：habit-hub.js 的 cardView 契约 + renderList 岛守卫
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
        classList: {
          toggle: () => {},
        },
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

const src = readFileSync(join(root, 'src/js/features/mapping/habit-hub.js'), 'utf8').replace(/^\uFEFF/, '');
(0, eval)(src);
const Hub = globalThis.OneToneHabitHub;

console.log('[habit-hub-island] cardView 契约:');
check('cardView 已导出', typeof Hub.cardView === 'function');
check('buildHabitHubListModel 已导出', typeof Hub.buildHabitHubListModel === 'function');
check('afterHabitHubListCommit 已导出', typeof Hub.afterHabitHubListCommit === 'function');

const item = {
  mapping: state.config.mappings[0],
  type: 'app',
  profile: { habitType: 'app', isActive: true, keyEnabled: true },
};
const card = Hub.cardView(item, { horizontal: true });
check('cardView 返回 HTML 字符串', typeof card === 'string' && card.length > 0);
check('含 data-habit-card', card.includes('data-habit-card="m1"'));
check('含 data-habit-open', card.includes('data-habit-open="m1"'));
check('含 data-habit-select', card.includes('data-habit-select="m1"'));
check('含 data-habit-enable', card.includes('data-habit-enable="m1"'));

const legacyItem = {
  mapping: { id: 'leg1', group: 'Legacy Voice', triggerKey: 'F1', targetKey: 'Enter' },
  type: 'combo',
  profile: null,
};
uiState.habitHubConfirmDelId = 'leg1';
const legacyCard = Hub.cardView(legacyItem, { legacy: true });
check('legacy 卡删除确认含 data-habit-del-confirm', legacyCard.includes('data-habit-del-confirm="leg1"'));
check('legacy 卡删除确认含 is-confirm-del', legacyCard.includes('is-confirm-del'));
uiState.habitHubConfirmDelId = '';

const model = Hub.buildHabitHubListModel();
check('buildHabitHubListModel 返回 blocks', Array.isArray(model.blocks) && model.blocks.length > 0);
check('含 section-global', model.blocks.some((b) => b.id === 'section-global'));
check('含 section-app 与 card 块', model.blocks.some((b) => b.id === 'section-app' && b.innerBlocks?.some((ib) => ib.id === 'card-m1')));

console.log('[habit-hub-island] 岛守卫:');
globalThis.OneToneIslands = { isMounted: () => false };
const listEl = globalThis.OneToneDom.$('habitHubList');
listEl._innerWrites = 0;
Hub.render();
check('岛未挂载时 legacy innerHTML 渲染', listEl._innerWrites >= 1 && listEl._inner.includes('data-habit-card="m1"'));

globalThis.OneToneIslands = { isMounted: (id) => id === 'habitHubList' };
let syncCalled = 0;
globalThis.__otHabitHubListSync = () => { syncCalled++; };
listEl._innerWrites = 0;
Hub.render();
check('岛挂载时 legacy 不再 innerHTML 重建', listEl._innerWrites === 0);
check('岛挂载时改调 __otHabitHubListSync', syncCalled >= 1);
check('empty.hidden 仍由 legacy 维护', globalThis.OneToneDom.$('habitHubEmpty').hidden === true);

globalThis.__otHabitHubChromeMounted = false;
globalThis.__otHabitHubChromeSync = undefined;

console.log(`[habit-hub-island] ${pass} 通过 / ${fail} 失败`);
if (fail > 0) process.exit(1);
