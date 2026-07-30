import { useEffect, useRef } from 'react';
import { useSyncExternalStore } from 'react';
import { useIslandRefresh } from '../island-runtime';
import {
  applyKeysHubSchemeListHosts,
  buildKeysHubSchemeListModel,
  keysHubSchemeListReady,
  keysHubSchemeListSignature,
  type KeysHubSchemeListModel,
} from '../domain/keysHubSchemeList';

// P12c-4: #keysHubSchemeList sync-push；交互仍走 data-scheme-* 委托。

const EMPTY: KeysHubSchemeListModel = {
  html: '',
  count: 0,
  cardHidden: true,
  selected: '',
  sig: 'empty',
};

type Win = Window & {
  __otKeysHubSchemeListSync?: () => void;
  __otKeysHubSchemeListMounted?: boolean;
};

let currentModel: KeysHubSchemeListModel = EMPTY;
let currentSig = '';
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((l) => l());
}

function pullModel(): KeysHubSchemeListModel {
  if (!keysHubSchemeListReady()) return EMPTY;
  return buildKeysHubSchemeListModel();
}

function syncFromLegacy(): void {
  const next = pullModel();
  applyKeysHubSchemeListHosts(next);
  const sig = keysHubSchemeListSignature(next);
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

function getSnapshot(): KeysHubSchemeListModel {
  return currentModel;
}

function ensureBridge(): void {
  const w = window as Win;
  w.__otKeysHubSchemeListSync = syncFromLegacy;
  w.__otKeysHubSchemeListMounted = true;
}

function useHubModel(): KeysHubSchemeListModel {
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

export function KeysHubSchemeListIsland(): JSX.Element {
  const model = useHubModel();
  return <>{String(model.count || 0)}</>;
}

export function registerKeysHubSchemeListBridge(): void {
  ensureBridge();
  syncFromLegacy();
}
