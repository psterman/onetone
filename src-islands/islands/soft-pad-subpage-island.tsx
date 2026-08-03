import { useEffect, useRef } from 'react';
import { useSyncExternalStore } from 'react';
import { useIslandRefresh } from '../island-runtime';
import {
  applySoftPadSubpageOuterAttrs,
  buildSoftPadSubpageModel,
  paintSoftPadSubpageTarget,
  softPadSubpageReady,
  softPadSubpageSignature,
  type SoftPadSubpageModel,
} from '../domain/softPadSubpage';

// P14f: #softPadSubpageBody paint-target handoff 岛。
// React 拥有外壳；Pad.renderSoftPad*Panel 写入 [data-soft-pad-subpage-paint]。

const EMPTY: SoftPadSubpageModel = {
  mappingId: '',
  view: 'hub',
  clear: true,
  panel: '',
  mode: 'clear',
  agentLoadToken: '',
  editingKey: false,
  sig: 'empty',
};

type Win = Window & {
  __otSoftPadSubpageSync?: () => void;
  __otSoftPadSubpageMounted?: boolean;
};

let currentModel: SoftPadSubpageModel = EMPTY;
let currentSig = '';
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((l) => l());
}

function paintTarget(): HTMLElement | null {
  const host = document.getElementById('softPadSubpageBody');
  if (!host) return null;
  return host.querySelector('[data-soft-pad-subpage-paint]') as HTMLElement | null;
}

function applyPaint(model: SoftPadSubpageModel): void {
  applySoftPadSubpageOuterAttrs(model);
  const el = paintTarget();
  if (!el) return;
  paintSoftPadSubpageTarget(el, model);
}

function pullModel(): SoftPadSubpageModel {
  if (!softPadSubpageReady()) return EMPTY;
  return buildSoftPadSubpageModel();
}

  function syncFromLegacy(): void {
  const next = pullModel();
  const sig = softPadSubpageSignature(next);
  // Same sig → skip remount (避免 refresh 清掉 layout 内联编辑器)；
  // paintSubpage / clearSubpage 会改 model.sig（含 subpageToken）。
  if (sig === currentSig) return;
  const el = paintTarget();
  // Paint-target not in DOM yet (createRoot lag) — don't lock sig or retries will no-op.
  if (!el && !next.clear) return;
  applyPaint(next);
  currentSig = sig;
  currentModel = next;
  // Do NOT emit(): JSX is an empty paint host; a React re-render can wipe
  // Pad.renderSoftPad*Panel HTML (状态灯 / 何时显示详情空白).
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): SoftPadSubpageModel {
  return currentModel;
}

function ensureBridge(): void {
  const w = window as Win;
  w.__otSoftPadSubpageSync = syncFromLegacy;
  w.__otSoftPadSubpageMounted = true;
}

function useSubpageModel(): SoftPadSubpageModel {
  const mountedOnce = useRef(false);

  useEffect(() => {
    ensureBridge();
    if (!mountedOnce.current) {
      mountedOnce.current = true;
      // 强制首刷：挂载前可能已有 sync（无 paint 节点），需在 paint 节点就绪后重绘。
      currentSig = '';
      syncFromLegacy();
    }
  }, []);

  useIslandRefresh(syncFromLegacy);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function SoftPadSubpageIsland(): JSX.Element {
  useSubpageModel();
  return <div data-soft-pad-subpage-paint="" className="soft-pad-subpage-paint" />;
}

export function registerSoftPadSubpageBridge(): void {
  ensureBridge();
}
