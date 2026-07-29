// P7: 映射列表岛的领域读取层。
// 单一数据源原则：行视图完全来自 legacy 的 OneToneMappingList.rowView（与 legacy 渲染共用同一函数），
// 岛不复制任何 markup 逻辑，不 fork mappings 数据 —— 因此「字段不丢」由 legacy buildSavePayload 与
// rowView 的单一来源共同保证。

export interface MappingRowView {
  id: string;
  cls: string;
  inner: string;
}

interface LegacyMappingList {
  rowView?: (m: unknown) => MappingRowView | null;
  listHasRows?: () => boolean;
  syncTimingRanges?: (list?: HTMLElement | null) => void;
}

interface LegacyMappingCore {
  sorted?: () => unknown[];
}

function legacyList(): LegacyMappingList {
  return ((window as unknown as { OneToneMappingList?: LegacyMappingList }).OneToneMappingList) ?? {};
}

function legacyCore(): LegacyMappingCore {
  return ((window as unknown as { OneToneMappingCore?: LegacyMappingCore }).OneToneMappingCore) ?? {};
}

/** legacy 依赖是否就绪（rowView 抽取自 mapping-list.js，需其已加载）。 */
export function mappingListReady(): boolean {
  const list = legacyList();
  const core = legacyCore();
  return typeof list.rowView === 'function' && typeof core.sorted === 'function';
}

/** 从 OneToneState 单一数据源构建当前行视图数组（顺序 = legacy sortedMappings）。 */
export function buildMappingRows(): MappingRowView[] {
  const list = legacyList();
  const core = legacyCore();
  if (!list.rowView || !core.sorted) return [];
  const rows: MappingRowView[] = [];
  for (const m of core.sorted()) {
    try {
      const row = list.rowView(m);
      if (row) rows.push(row);
    } catch (err) {
      // 单行构建失败不拖垮整表（保守：跳过该行，legacy 控制台可见）
      console.error('[islands] mapping rowView failed', err);
    }
  }
  return rows;
}

/** 行数组签名 —— 用于跳过无变化的 setState，避免 per-frame render 触发无谓重渲染。 */
export function rowsSignature(rows: MappingRowView[]): string {
  let sig = '';
  for (const r of rows) {
    sig += r.id + '\u0001' + r.cls + '\u0001' + r.inner + '\u0002';
  }
  return sig;
}

/** React 提交 DOM 后调用：恢复 legacy 的 timing range 滑条状态同步。 */
export function afterRowsCommit(listEl: HTMLElement | null): void {
  const list = legacyList();
  if (list.syncTimingRanges) {
    try {
      list.syncTimingRanges(listEl);
    } catch (err) {
      console.error('[islands] syncTimingRanges failed', err);
    }
  }
}
