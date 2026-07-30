import { useEffect, useRef } from 'react';
import { useSyncExternalStore } from 'react';
import { useIslandRefresh } from '../island-runtime';
import {
  applyDebugOverviewHosts,
  buildDebugOverviewModel,
  debugOverviewReady,
  debugOverviewSignature,
  type DebugOverviewModel,
} from '../domain/debugOverview';

const EMPTY: DebugOverviewModel = {
  heroCls: 'debug-status-hero',
  heroTitle: '—',
  heroSub: '',
  cardsHtml: '',
  actionsHtml: '',
  sig: 'empty',
};

type Win = Window & {
  __otDebugOverviewSync?: () => void;
  __otDebugOverviewMounted?: boolean;
};

let currentModel: DebugOverviewModel = EMPTY;
let currentSig = '';
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((l) => l());
}

function pullModel(): DebugOverviewModel {
  if (!debugOverviewReady()) return EMPTY;
  return buildDebugOverviewModel();
}

function syncFromLegacy(): void {
  const next = pullModel();
  applyDebugOverviewHosts(next);
  const sig = debugOverviewSignature(next);
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

function getSnapshot(): DebugOverviewModel {
  return currentModel;
}

function ensureBridge(): void {
  const w = window as Win;
  w.__otDebugOverviewSync = syncFromLegacy;
  w.__otDebugOverviewMounted = true;
}

function useModel(): DebugOverviewModel {
  const mountedOnce = useRef(false);
  useEffect(() => {
    ensureBridge();
    if (!mountedOnce.current) {
      mountedOnce.current = true;
      currentSig = '';
      syncFromLegacy();
    }
  }, []);
  useIslandRefresh(syncFromLegacy);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function DebugOverviewIsland(): JSX.Element {
  const model = useModel();
  return <>{model.heroTitle}</>;
}

export function registerDebugOverviewBridge(): void {
  ensureBridge();
  syncFromLegacy();
}
