import { useEffect, useLayoutEffect, useRef } from 'react';
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

function runtimePanelMissingSkin(host: HTMLElement | null): boolean {
  if (!host) return false;
  // Skin options live on the right controls again — stale if showMode exists without skins.
  return (
    !!host.querySelector('button[data-act="showMode"][data-show-mode]') &&
    !host.querySelector('[data-pad-skin-opt]')
  );
}

function paintTargetLooksEmpty(host: HTMLElement | null, panel: string): boolean {
  if (!host) return true;
  if (panel === 'layout') {
    return !(
      host.querySelector('[data-soft-pad-action-library]') ||
      host.querySelector('[data-soft-pad-layout-editor]')
    );
  }
  if (panel === 'runtime' || panel === 'style') {
    return !(
      host.querySelector('.soft-pad-style-panel') ||
      host.querySelector('button[data-act="showMode"][data-show-mode]') ||
      host.querySelector('select[data-act="showMode"]') ||
      host.querySelector('.soft-pad-display-panel')
    );
  }
  if (panel === 'presentation') {
    return !host.querySelector('[data-pad-skin-opt]');
  }
  if (panel === 'purpose') {
    return !host.querySelector('[data-pad-purpose]');
  }
  if (panel === 'agent') {
    return !host.querySelector('[data-agent-workbench]');
  }
  return host.childNodes.length === 0;
}

function syncFromLegacy(): void {
  const next = pullModel();
  const sig = softPadSubpageSignature(next);
  const el = paintTarget();
  const staleRuntime =
    (next.panel === 'runtime' || next.panel === 'style') && runtimePanelMissingSkin(el);
  const wiped = !next.clear && !!next.panel && paintTargetLooksEmpty(el, next.panel);
  // Same sig → skip remount (避免 refresh 清掉 layout 内联编辑器)；
  // paintSubpage / clearSubpage 会改 model.sig（含 subpageToken）。
  // ponytail: stale runtime-only DOM (no skin) must repaint after appear+look merge.
  // Also: refreshAll remounts empty paint host — must refill even when sig unchanged.
  if (sig === currentSig && !staleRuntime && !wiped) return;
  // Paint-target not in DOM yet (createRoot lag) — don't lock sig or retries will no-op.
  if (!el && !next.clear) return;
  applyPaint(next);
  currentSig = sig;
  currentModel = next;
  // Do NOT emit(): JSX is an empty paint host; a React re-render can wipe
  // Pad.renderSoftPad*Panel HTML (键位 / 显示详情空白).
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

  // refreshAll / root.render 会换掉空 paint 节点；commit 后立刻回填。
  useLayoutEffect(() => {
    ensureBridge();
    syncFromLegacy();
  });

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
