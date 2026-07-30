import { useEffect, useRef } from 'react';
import { useSyncExternalStore } from 'react';
import { useIslandRefresh } from '../island-runtime';
import {
  applyKeysFinishChromeHosts,
  buildKeysFinishChromeModel,
  finishChromeSignature,
  keysFinishChromeReady,
  type KeysFinishChromeModel,
} from '../domain/keysFinishChrome';

// P12b-7: #keysFinishModeHint + preview/more sync-push。

const EMPTY: KeysFinishChromeModel = {
  hintText: '',
  hintHidden: true,
  moreHidden: true,
  previewText: '—',
  previewClass: 'keys-finish-strategy-preview is-empty',
  mappingId: '',
  finishMode: '',
  sig: 'empty',
};

type Win = Window & {
  __otKeysFinishChromeSync?: () => void;
  __otKeysFinishChromeMounted?: boolean;
};

let currentModel: KeysFinishChromeModel = EMPTY;
let currentSig = '';
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((l) => l());
}

function pullModel(): KeysFinishChromeModel {
  if (!keysFinishChromeReady()) return EMPTY;
  return buildKeysFinishChromeModel();
}

function syncFromLegacy(): void {
  const next = pullModel();
  applyKeysFinishChromeHosts(next);
  const sig = finishChromeSignature(next);
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

function getSnapshot(): KeysFinishChromeModel {
  return currentModel;
}

function ensureBridge(): void {
  const w = window as Win;
  w.__otKeysFinishChromeSync = syncFromLegacy;
  w.__otKeysFinishChromeMounted = true;
}

function useChromeModel(): KeysFinishChromeModel {
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

export function KeysFinishChromeIsland(): JSX.Element {
  const model = useChromeModel();
  return <>{model.hintText}</>;
}

export function registerKeysFinishChromeBridge(): void {
  ensureBridge();
  syncFromLegacy();
}
