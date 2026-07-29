// P7 单测：mapping-list.js 的 rowView 单一来源契约 + 岛守卫行为
// 在 node 中以 stub 全局加载 legacy mapping-list.js，验证：
// 1) rowView 输出包含全部 data-* 交互契约（字段不丢、事件委托可命中）
// 2) 岛挂载时 renderMappingList 走 __otMappingListSync 且不再 innerHTML 重建
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

// ---- stub legacy globals ----
const state = {
  selectedMappingId: 'm2',
  config: {
    activeSceneId: 'm3',
    mappings: [],
  },
};
const dict = {
  triggerPlaceholder: '触发键',
  targetPlaceholder: '目标键',
  testShort: '测试',
};
const T = new Proxy({}, { get: (_, k) => String(k) });

globalThis.OneToneState = { state };
globalThis.OneToneI18n = { dict: () => dict, t: (k) => String(k), getLang: () => 'zh' };

const domNodes = {};
function fakeEl(id) {
  if (!domNodes[id]) {
    domNodes[id] = {
      id,
      hidden: false,
      _innerWrites: 0,
      _inner: '',
      set innerHTML(v) { this._inner = v; this._innerWrites++; },
      get innerHTML() { return this._inner; },
    };
  }
  return domNodes[id];
}
globalThis.OneToneDom = { $: (id) => fakeEl(id) };

globalThis.OneToneMappingCore = {
  isDraft: (m) => m.__draft === true,
  isSaved: (m) => !!(m.triggerKey && m.targetKey),
  sorted: () => state.config.mappings,
  hasDrafts: () => state.config.mappings.some((m) => m.__draft === true),
  conflictsFor: (id) => (id === 'm2' ? [{ a: 'm2', b: 'm3' }] : []),
  schemeHasConflict: (m) => m.id === 'm2',
  conflictHint: () => 'CONFLICT_HINT',
  editorTarget: (m) => m.targetKey,
  formatTriggerTrace: () => 'traceX',
};

globalThis.__vp_mapping_list_hooks__ = {
  ensureConfig: () => {},
  ensureMappingTiming: () => {},
  ensureMappingExtras: () => {},
  isAutoTriggerMapping: (m) => !!m.__auto,
  escHtml: (s) => String(s),
  friendlyKeyName: (k) => 'K(' + k + ')',
  friendlyPair: (a, b) => 'K(' + a + ')->K(' + b + ')',
  formatTimingSec: (ms) => String((ms || 0) / 1000),
  keyFinishPreviewText: () => ({ summary: 'SUMMARY' }),
  voiceUiSnapshot: () => ({ end: { state: 'idle', mappingId: '' } }),
  sessionActiveState: (s) => s === 'active',
  openMenuId: () => 'm3',
  testSendState: () => 'idle',
  testSendMappingId: () => '',
  recordingMode: () => 'none',
  recordingMappingId: () => '',
  syncAllTimingRanges: () => { globalThis.__syncedTimingRanges = true; },
};

// ---- load legacy mapping-list.js ----
const src = readFileSync(join(root, 'src/js/features/mapping/mapping-list.js'), 'utf8').replace(/^\uFEFF/, '');
(0, eval)(src);
const ML = globalThis.OneToneMappingList;

console.log('[mapping-island] rowView 契约:');
check('OneToneMappingList.rowView 已导出', typeof ML.rowView === 'function');
check('OneToneMappingList.listHasRows 已导出', typeof ML.listHasRows === 'function');
check('OneToneMappingList.syncTimingRanges 已导出', typeof ML.syncTimingRanges === 'function');

// 不完整（非草稿、未保存）→ null
check('未保存且非草稿的映射返回 null', ML.rowView({ id: 'x', triggerKey: '', targetKey: '' }) === null);

// 草稿行
const draft = ML.rowView({ id: 'd1', __draft: true, triggerKey: '', targetKey: '' });
check('草稿行 cls 含 map-row-draft', !!draft && draft.cls.includes('map-row-draft'));
check('草稿行含 data-menu 菜单契约', !!draft && draft.inner.includes('data-menu="d1"'));

// 已保存行（tap 模式、选中、冲突、带 switchKeys、auto-trigger）
const saved = {
  id: 'm2', triggerKey: 'F1', targetKey: 'Enter', enabled: true, triggerMode: 'tap',
  intervalMs: 1200, enterDelayMs: 5000, cancelEnabled: true, autoEnterEnabled: true,
  switchKeys: ['F9'], nativeKeyRestore: true, __auto: true,
};
const row = ML.rowView(saved);
check('保存行返回 {id,cls,inner}', !!row && row.id === 'm2' && typeof row.cls === 'string' && typeof row.inner === 'string');
check('选中态 cls 含 selected', !!row && row.cls.includes('selected'));
check('启用态 cls 含 is-on', !!row && row.cls.includes('is-on'));
check('开关契约 data-toggle', !!row && row.inner.includes('data-toggle="m2"'));
check('时序开关契约 data-list-timing-toggle（cancel/autoEnter）',
  !!row && row.inner.includes('data-list-timing-toggle="m2"') && row.inner.includes('data-field="cancelEnabled"') && row.inner.includes('data-field="autoEnterEnabled"'));
check('切换键契约 data-add-switch', !!row && row.inner.includes('data-add-switch="m2"'));
check('切换键移除契约 data-rm-switch + data-idx', !!row && row.inner.includes('data-rm-switch="m2"') && row.inner.includes('data-idx="0"'));
check('原生恢复契约 data-native-restore + 录制按钮', !!row && row.inner.includes('data-native-restore="m2"') && row.inner.includes('data-native-restore-record="m2"'));
check('冲突提示已渲染 map-conflict', !!row && row.inner.includes('map-conflict') && row.inner.includes('CONFLICT_HINT'));
check('菜单契约 data-menu', !!row && row.inner.includes('data-menu="m2"'));

// menu-open / active-scene 状态类
const row3 = ML.rowView({ id: 'm3', triggerKey: 'F2', targetKey: 'Tab', enabled: false, triggerMode: 'perpress' });
check('active-scene 行 cls 含 is-active-scene', !!row3 && row3.cls.includes('is-active-scene'));
check('menu-open 行 cls 含 menu-open', !!row3 && row3.cls.includes('menu-open'));

// ---- 岛守卫行为 ----
console.log('[mapping-island] 岛守卫:');
state.config.mappings = [saved];
// 岛未挂载 → legacy innerHTML 路径
globalThis.OneToneIslands = { isMounted: () => false };
const listEl = fakeEl('mappingList');
listEl._innerWrites = 0;
ML.renderList();
check('岛未挂载时 legacy 正常 innerHTML 渲染', listEl._innerWrites === 1 && listEl._inner.includes('data-toggle="m2"'));
check('legacy 渲染后同步 timing ranges', globalThis.__syncedTimingRanges === true);

// 岛已挂载 → 走 __otMappingListSync，不再 innerHTML
globalThis.OneToneIslands = { isMounted: (id) => id === 'mappingList' };
let syncCalled = 0;
globalThis.__otMappingListSync = () => { syncCalled++; };
listEl._innerWrites = 0;
ML.renderList();
check('岛挂载时 legacy 不再 innerHTML 重建', listEl._innerWrites === 0);
check('岛挂载时改调 __otMappingListSync', syncCalled === 1);
check('空态 placeholder 仍由 legacy 维护（empty.hidden）', fakeEl('mappingEmpty').hidden === true);

console.log(`[mapping-island] ${pass} 通过 / ${fail} 失败`);
if (fail > 0) process.exit(1);
