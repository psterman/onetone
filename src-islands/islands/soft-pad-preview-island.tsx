import { useEffect, useRef } from 'react';
import { useSyncExternalStore } from 'react';
import { useIslandRefresh } from '../island-runtime';
import {
  buildSoftPadPreviewModel,
  getSelectedSoftPadMappingForPreview,
  paintSoftPadPreviewTarget,
  softPadPreviewReady,
  softPadPreviewSignature,
  type SoftPadPreviewModel,
} from '../domain/softPadPreview';

// P14e: #softPadPreviewHost paint-target handoff 岛。
// React 拥有外壳；Pad.renderSoftPadPreview 写入 [data-soft-pad-preview-paint]。

const EMPTY: SoftPadPreviewModel = {
  mappingId: '',
  hidden: true,
  collapsed: false,
  clear: true,
  force: false,
  skipPaint: true,
  view: 'hub',
  epoch: 0,
  sig: 'empty',
};

type Win = Window & {
  __otSoftPadPreviewSync?: () => void;
  __otSoftPadPreviewMounted?: boolean;
};

let currentModel: SoftPadPreviewModel = EMPTY;
let currentSig = '';
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((l) => l());
}

function applyHostAttrs(model: SoftPadPreviewModel): void {
  const host = document.getElementById('softPadPreviewHost');
  if (!host) return;
  host.hidden = !!model.hidden;
  host.classList.toggle('is-collapsed', !!model.collapsed);
}

function paintTarget(): HTMLElement | null {
  const host = document.getElementById('softPadPreviewHost');
  if (!host) return null;
  return host.querySelector('[data-soft-pad-preview-paint]') as HTMLElement | null;
}

function applyPaint(model: SoftPadPreviewModel): void {
  const el = paintTarget();
  if (!el) return;
  if (model.clear || !model.mappingId) {
    paintSoftPadPreviewTarget(el, null);
    return;
  }
  if (model.skipPaint) return;
  const mapping = getSelectedSoftPadMappingForPreview();
  paintSoftPadPreviewTarget(el, mapping, model.force ? { forceFull: true } : undefined);
}

function pullModel(): SoftPadPreviewModel {
  if (!softPadPreviewReady()) return EMPTY;
  return buildSoftPadPreviewModel();
}

function syncFromLegacy(): void {
  const next = pullModel();
  const sig = softPadPreviewSignature(next);
  applyHostAttrs(next);
  applyPaint(next);
  if (sig === currentSig) return;
  currentSig = sig;
  currentModel = next;
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): SoftPadPreviewModel {
  return currentModel;
}

function ensureBridge(): void {
  const w = window as Win;
  w.__otSoftPadPreviewSync = syncFromLegacy;
  w.__otSoftPadPreviewMounted = true;
}

function usePreviewModel(): SoftPadPreviewModel {
  const mountedOnce = useRef(false);

  useEffect(() => {
    ensureBridge();
    if (!mountedOnce.current) {
      mountedOnce.current = true;
      syncFromLegacy();
    }
  }, []);

  useIslandRefresh(syncFromLegacy);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function SoftPadPreviewIsland(): JSX.Element {
  usePreviewModel();
  return <div data-soft-pad-preview-paint="" className="soft-pad-preview-paint" />;
}

export function registerSoftPadPreviewBridge(): void {
  ensureBridge();
  syncFromLegacy();
}
