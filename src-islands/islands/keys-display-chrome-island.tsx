import { useEffect, useRef } from 'react';
import { useSyncExternalStore } from 'react';
import { useIslandRefresh } from '../island-runtime';
import {
  applyKeysDisplayChromeHosts,
  buildKeysDisplayChromeModel,
  keysDisplayChromeReady,
  keysDisplayChromeSignature,
  type KeysDisplayChromeModel,
} from '../domain/keysDisplayChrome';

// P12c-6: display chrome sync-push（挂 triggerTrace，不接管 P12b-1 文案岛）。

const EMPTY: KeysDisplayChromeModel = {
  triggerEmpty: true,
  targetEmpty: true,
  triggerRaw: '',
  targetRaw: '',
  triggerRecording: false,
  targetRecording: false,
  traceText: '',
  traceShow: false,
  mappingId: '',
  recMode: 'none',
  sig: 'empty',
};

type Win = Window & {
  __otKeysDisplayChromeSync?: () => void;
  __otKeysDisplayChromeMounted?: boolean;
};

let currentModel: KeysDisplayChromeModel = EMPTY;
let currentSig = '';
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((l) => l());
}

function pullModel(): KeysDisplayChromeModel {
  if (!keysDisplayChromeReady()) return EMPTY;
  return buildKeysDisplayChromeModel();
}

function syncFromLegacy(): void {
  const next = pullModel();
  applyKeysDisplayChromeHosts(next);
  const sig = keysDisplayChromeSignature(next);
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

function getSnapshot(): KeysDisplayChromeModel {
  return currentModel;
}

function ensureBridge(): void {
  const w = window as Win;
  w.__otKeysDisplayChromeSync = syncFromLegacy;
  w.__otKeysDisplayChromeMounted = true;
}

function useDisplayChromeModel(): KeysDisplayChromeModel {
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

export function KeysDisplayChromeIsland(): JSX.Element {
  const model = useDisplayChromeModel();
  return <>{model.traceShow ? model.traceText : ''}</>;
}

export function registerKeysDisplayChromeBridge(): void {
  ensureBridge();
  syncFromLegacy();
}
