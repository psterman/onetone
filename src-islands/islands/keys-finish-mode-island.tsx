import { useEffect, useRef } from 'react';
import { useSyncExternalStore } from 'react';
import { useIslandRefresh } from '../island-runtime';
import {
  buildKeysFinishModeModel,
  keysFinishModeReady,
  modeModelSignature,
  type KeysFinishModeModel,
} from '../domain/keysFinishMode';

// P12b-5: #voiceEndKeyModePanel sync-push 岛。
// HTML 来自 legacy buildKeysFinishModeModel；交互仍走 data-finish-mode 委托。

const EMPTY: KeysFinishModeModel = {
  modeHtml: '',
  mappingId: '',
  finishMode: '',
  variant: 'empty',
  sig: 'empty',
};

type Win = Window & {
  __otKeysFinishModeSync?: () => void;
  __otKeysFinishModeMounted?: boolean;
};

let currentModel: KeysFinishModeModel = EMPTY;
let currentSig = '';
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((l) => l());
}

function pullModel(): KeysFinishModeModel {
  if (!keysFinishModeReady()) return EMPTY;
  return buildKeysFinishModeModel();
}

function syncFromLegacy(): void {
  const next = pullModel();
  const sig = modeModelSignature(next);
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

function getSnapshot(): KeysFinishModeModel {
  return currentModel;
}

function ensureBridge(): void {
  const w = window as Win;
  w.__otKeysFinishModeSync = syncFromLegacy;
  w.__otKeysFinishModeMounted = true;
}

function useModeModel(): KeysFinishModeModel {
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

export function KeysFinishModeIsland(): JSX.Element {
  const model = useModeModel();

  if (!model.modeHtml) return <></>;
  // eslint-disable-next-line react/no-danger -- markup 来自 legacy renderKeyFinishMode*
  return <div dangerouslySetInnerHTML={{ __html: model.modeHtml }} />;
}

export function registerKeysFinishModeBridge(): void {
  ensureBridge();
  syncFromLegacy();
}
