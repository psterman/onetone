// 单测：habit-hub.js 的 cardView 契约 + workspace 轻量刷新
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
  habitHubBatchMode: false,
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
check('应用场景卡使用快速属性入口', card.includes('data-habit-peek="m1"'));
check('普通模式无复选框', !card.includes('data-habit-select="m1"'));
check('含 data-habit-enable', card.includes('data-habit-enable="m1"'));
check('通道门在配置菜单', card.includes('habit-hub-config-menu') && card.includes('data-habit-scenario-keys="m1"'));
check('管理动作在更多菜单', card.includes('habit-hub-more-menu') && card.includes('data-habit-dup="m1"'));
check('当前习惯无设为正在使用按钮', !card.includes('data-habit-scenario-use="m1"'));
uiState.habitHubBatchMode = true;
const cardBatch = Hub.cardView(item, { horizontal: true });
check('批量模式出现复选框', cardBatch.includes('data-habit-select="m1"'));
uiState.habitHubBatchMode = false;

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
check('含 section-app 与 table 块', model.blocks.some((b) => b.id === 'section-app' && b.innerBlocks?.some((ib) => ib.id === 'table-wrap')));

console.log('[habit-hub-island] workspace 刷新:');
let workspacePaint = 0;
globalThis.OneToneHabitWorkspace = { render: () => { workspacePaint++; } };
globalThis.requestAnimationFrame = (fn) => { fn(); };
const origSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn) => { fn(); return 0; };
Hub.scheduleHubPaint();
globalThis.setTimeout = origSetTimeout;
check('scheduleHubPaint 委托 Workspace.render', workspacePaint >= 1);

globalThis.OneToneIslands = { isMounted: () => false };
const listEl = globalThis.OneToneDom.$('habitHubList');
Hub.render();
check('render 隐藏 legacy #habitHubList', listEl.hidden === true);

globalThis.__otHabitHubChromeMounted = false;
globalThis.__otHabitHubChromeSync = undefined;

console.log(`[habit-hub-island] ${pass} 通过 / ${fail} 失败`);
if (fail > 0) process.exit(1);
