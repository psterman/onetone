import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useIslandRefresh } from '../island-runtime';
import {
  afterHabitHubListCommit,
  blocksSignature,
  buildHabitHubBlocks,
  habitHubListReady,
  type HabitHubBlock,
  type HabitHubInnerBlock,
} from '../domain/habitHubList';

// P12: 习惯列表岛（挂载于 #habitHubList）
// - 渲染：legacy buildHabitHubListModel + cardView 单一来源，React keyed diff
// - 交互：#habitHubView 事件委托不变

const HtmlBlock = memo(function HtmlBlock({ html }: { html: string }) {
  return (
    <div
      style={{ display: 'contents' }}
      // eslint-disable-next-line react/no-danger -- markup 来自 legacy cardView / renderSection（非用户输入）
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}, (prev, next) => prev.html === next.html);

const InnerBlock = memo(function InnerBlock({ block }: { block: HabitHubInnerBlock }) {
  return <HtmlBlock html={block.html} />;
}, (prev, next) => prev.block.id === next.block.id && prev.block.html === next.block.html);

const SectionAppBlock = memo(function SectionAppBlock({ block }: { block: HabitHubBlock }) {
  const extra = block.extraClass ? ` habit-hub-section--${block.extraClass}` : '';
  return (
    <section className={`habit-hub-section${extra}`} aria-label={block.ariaLabel}>
      <div style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: block.headInner ?? '' }} />
      <div className="habit-hub-section-list habit-hub-section-list--cards">
        {(block.innerBlocks ?? []).map((ib) => (
          <InnerBlock key={ib.id} block={ib} />
        ))}
      </div>
    </section>
  );
}, (prev, next) => {
  if (prev.block.id !== next.block.id) return false;
  if (prev.block.headInner !== next.block.headInner) return false;
  if (prev.block.ariaLabel !== next.block.ariaLabel) return false;
  if (prev.block.extraClass !== next.block.extraClass) return false;
  const a = prev.block.innerBlocks ?? [];
  const b = next.block.innerBlocks ?? [];
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id || a[i].html !== b[i].html) return false;
  }
  return true;
});

const TopLevelBlock = memo(function TopLevelBlock({ block }: { block: HabitHubBlock }) {
  if (block.innerBlocks) {
    return <SectionAppBlock block={block} />;
  }
  return <HtmlBlock html={block.html ?? ''} />;
}, (prev, next) => {
  if (prev.block.id !== next.block.id) return false;
  if (prev.block.innerBlocks || next.block.innerBlocks) {
    return blocksSignature([prev.block]) === blocksSignature([next.block]);
  }
  return prev.block.html === next.block.html;
});

export function HabitHubListIsland(): JSX.Element {
  const [blocks, setBlocks] = useState<HabitHubBlock[]>(() => (habitHubListReady() ? buildHabitHubBlocks() : []));
  const lastSigRef = useRef<string>(blocksSignature(blocks));

  const sync = useCallback(() => {
    if (!habitHubListReady()) return;
    const next = buildHabitHubBlocks();
    const sig = blocksSignature(next);
    if (sig === lastSigRef.current) return;
    lastSigRef.current = sig;
    setBlocks(next);
  }, []);

  useEffect(() => {
    const win = window as unknown as {
      __otHabitHubListSync?: () => void;
      __otHabitHubListMounted?: boolean;
    };
    win.__otHabitHubListSync = sync;
    win.__otHabitHubListMounted = true;
    sync();
    return () => {
      if (win.__otHabitHubListSync === sync) delete win.__otHabitHubListSync;
      win.__otHabitHubListMounted = false;
    };
  }, [sync]);

  useIslandRefresh(sync);

  useEffect(() => {
    afterHabitHubListCommit();
  }, [blocks]);

  return (
    <>
      {blocks.map((block) => (
        <TopLevelBlock key={block.id} block={block} />
      ))}
    </>
  );
}
