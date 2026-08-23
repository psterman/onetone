import { useEffect, useRef } from 'react';
import { useSyncExternalStore } from 'react';
import { useIslandRefresh } from '../island-runtime';
import {
  applyKeysAppContextStripHosts,
  buildKeysAppContextStripModel,
  keysAppContextStripReady,
  keysAppContextStripSignature,
  type KeysAppContextStripModel,
} from '../domain/keysAppContextStrip';

// P12c-5 → habit strip：#keysAppBindingStrip 可见性 sync-push；pill 点击 legacy 委托。

const EMPTY: KeysAppContextStripModel = {
  hidden: true,
  html: '',
  mappingId: '',
  contextId: '',
  sig: 'hidden',
};

type Win = Window & {
  __otKeysAppContextStripSync?: () => void;
  __otKeysAppContextStripMounted?: boolean;
};

let currentModel: KeysAppContextStripModel = EMPTY;
let currentSig = '';
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((l) => l());
}

function pullModel(): KeysAppContextStripModel {
  if (!keysAppContextStripReady()) return EMPTY;
  return buildKeysAppContextStripModel();
}

function syncFromLegacy(): void {
  const next = pullModel();
  applyKeysAppContextStripHosts(next);
  const sig = keysAppContextStripSignature(next);
  if (sig === currentSig) {
    if (!next.hidden) {
      const w = window as unknown as { __otKeysWorkflowSync?: () => void };
      w.__otKeysWorkflowSync?.();
    }
    return;
  }
  currentSig = sig;
  currentModel = next;
  emit();
  if (!next.hidden) {
    const w = window as unknown as { __otKeysWorkflowSync?: () => void };
    w.__otKeysWorkflowSync?.();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): KeysAppContextStripModel {
  return currentModel;
}

function ensureBridge(): void {
  const w = window as Win;
  w.__otKeysAppContextStripSync = syncFromLegacy;
  w.__otKeysAppContextStripMounted = true;
}

function useStripModel(): KeysAppContextStripModel {
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

export function KeysAppContextStripIsland(): JSX.Element {
  useStripModel();
  return <></>;
}

export function registerKeysAppContextStripBridge(): void {
  ensureBridge();
  syncFromLegacy();
}
