import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useIslandRefresh } from '../island-runtime';
import {
  buildMappingRows,
  rowsSignature,
  afterRowsCommit,
  mappingListReady,
  type MappingRowView,
} from '../domain/mappingList';

// P7: 映射列表岛（挂载于 #mappingList）
//
// 设计要点（对应契约 §4 / P7 验收）：
// - 只接管「渲染」：行 markup 由 legacy OneToneMappingList.rowView 生成（单一来源，零偏差），
//   React 按 id 做 keyed diff —— 只有变化的行才重写 innerHTML，替代 legacy 每次整表
//   innerHTML 重建（remount storm 的直接根源）。
// - 不接管「交互」：legacy 的事件全部委托在 #mappingList 容器与 document 上
//   （mapping-list-ui.js bindEvents），React 子树内的点击/输入照常冒泡命中 data-* 契约，
//   增删复制重排 / 冲突检测 / 录制 / 浮动菜单等行为 100% 走 legacy 原路径。
// - 同步入口：legacy renderMappingList 在岛挂载后改调 window.__otMappingListSync()，
//   岛重建行视图；签名不变则跳过 setState（per-frame render 零开销）。
// - mvp_init / config reload：applyMvpInit 整体替换 config，岛不持旧引用 ——
//   每次 sync 都从 OneToneState 重读；useIslandRefresh 兜底。

const MappingRow = memo(function MappingRow({ row }: { row: MappingRowView }) {
  // eslint-disable-next-line react/no-danger -- markup 来自 legacy rowView（与 legacy 渲染同一来源，非用户输入拼接面扩大）
  return (
    <div
      className={row.cls}
      data-id={row.id}
      dangerouslySetInnerHTML={{ __html: row.inner }}
    />
  );
}, (prev, next) => prev.row.cls === next.row.cls && prev.row.inner === next.row.inner && prev.row.id === next.row.id);

export function MappingListIsland(): JSX.Element {
  const [rows, setRows] = useState<MappingRowView[]>(() => (mappingListReady() ? buildMappingRows() : []));
  const lastSigRef = useRef<string>(rowsSignature(rows));

  const sync = useCallback(() => {
    if (!mappingListReady()) return;
    const next = buildMappingRows();
    const sig = rowsSignature(next);
    if (sig === lastSigRef.current) return; // 无变化：跳过重渲染
    lastSigRef.current = sig;
    setRows(next);
  }, []);

  // legacy renderMappingList 的岛侧同步入口
  useEffect(() => {
    (window as unknown as { __otMappingListSync?: () => void }).__otMappingListSync = sync;
    // 挂载即同步一次（legacy 可能已在岛挂载前渲染过状态）
    sync();
    return () => {
      const w = window as unknown as { __otMappingListSync?: () => void };
      if (w.__otMappingListSync === sync) delete w.__otMappingListSync;
    };
  }, [sync]);

  // mvp_init / config reload 兜底刷新
  useIslandRefresh(sync);

  // React 提交 DOM 后恢复 legacy 的 timing range 滑条同步
  useEffect(() => {
    afterRowsCommit(document.getElementById('mappingList'));
  }, [rows]);

  return (
    <>
      {rows.map((row) => (
        <MappingRow key={row.id} row={row} />
      ))}
    </>
  );
}
