import { useEffect, useRef } from 'react';
import { useSyncExternalStore } from 'react';
import { useIslandRefresh } from '../island-runtime';
import {
  applyKeysFlowChromeHosts,
  buildKeysFlowChromeModel,
  keysFlowChromeReady,
  keysFlowChromeSignature,
  type KeysFlowChromeModel,
} from '../domain/keysFlowChrome';

// P12c-1: flow nodes active + hints sync-push（挂在 trigger hint，不拆 SVG 结构）。

const EMPTY: KeysFlowChromeModel = {
  activeStep: 'trigger',
  recordingMode: 'none',
  triggerHint: '',
  targetHint: '',
  finishHint: '',
  sig: 'empty',
};

type Win = Window & {
  __otKeysFlowChromeSync?: () => void;
  __otKeysFlowChromeMounted?: boolean;
};

let currentModel: KeysFlowChromeModel = EMPTY;
let currentSig = '';
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((l) => l());
}

function pullModel(): KeysFlowChromeModel {
  if (!keysFlowChromeReady()) return EMPTY;
  return buildKeysFlowChromeModel();
}

function syncFromLegacy(): void {
  const next = pullModel();
  applyKeysFlowChromeHosts(next);
  const sig = keysFlowChromeSignature(next);
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

function getSnapshot(): KeysFlowChromeModel {
  return currentModel;
}

function ensureBridge(): void {
  const w = window as Win;
  w.__otKeysFlowChromeSync = syncFromLegacy;
  w.__otKeysFlowChromeMounted = true;
}

function useFlowModel(): KeysFlowChromeModel {
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

export function KeysFlowChromeIsland(): JSX.Element {
  const model = useFlowModel();
  return <>{model.triggerHint}</>;
}

export function registerKeysFlowChromeBridge(): void {
  ensureBridge();
  syncFromLegacy();
}
