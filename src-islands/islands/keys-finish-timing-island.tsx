import { useEffect, useRef } from 'react';
import { useSyncExternalStore } from 'react';
import { useIslandRefresh } from '../island-runtime';
import {
  afterTimingCommit,
  buildKeysFinishTimingModel,
  keysFinishTimingReady,
  timingModelSignature,
  type KeysFinishTimingModel,
} from '../domain/keysFinishTiming';

// P12b-2: #keysFinishDelayHost / #keysFinishCancelHost sync-push 岛。
// HTML 来自 legacy buildKeysFinishTimingModel；交互仍走 data-timing-* 委托。

const EMPTY: KeysFinishTimingModel = {
  delayHtml: '',
  cancelHtml: '',
  delayHidden: true,
  cancelHidden: true,
  mappingId: '',
  finishMode: '',
  sig: '',
};

type Win = Window & {
  __otKeysFinishTimingSync?: () => void;
  __otKeysFinishTimingMounted?: boolean;
};

let currentModel: KeysFinishTimingModel = EMPTY;
let currentSig = '';
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((l) => l());
}

function applyHostHidden(model: KeysFinishTimingModel): void {
  const delay = document.getElementById('keysFinishDelayHost');
  const cancel = document.getElementById('keysFinishCancelHost');
  if (delay) delay.hidden = !!model.delayHidden;
  if (cancel) cancel.hidden = !!model.cancelHidden;
}

function pullModel(): KeysFinishTimingModel {
  if (!keysFinishTimingReady()) return EMPTY;
  return buildKeysFinishTimingModel();
}

function syncFromLegacy(): void {
  const next = pullModel();
  const sig = timingModelSignature(next);
  applyHostHidden(next);
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

function getSnapshot(): KeysFinishTimingModel {
  return currentModel;
}

function ensureBridge(): void {
  const w = window as Win;
  w.__otKeysFinishTimingSync = syncFromLegacy;
  w.__otKeysFinishTimingMounted = true;
}

function useTimingModel(): KeysFinishTimingModel {
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

export function KeysFinishDelayIsland(): JSX.Element {
  const model = useTimingModel();
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = document.getElementById('keysFinishDelayHost');
    hostRef.current = el as HTMLDivElement | null;
    afterTimingCommit(hostRef.current);
  }, [model.delayHtml, model.sig]);

  if (!model.delayHtml) return <></>;
  // eslint-disable-next-line react/no-danger -- markup 来自 legacy renderKeysFinishDelayOnly
  return <div dangerouslySetInnerHTML={{ __html: model.delayHtml }} />;
}

export function KeysFinishCancelIsland(): JSX.Element {
  const model = useTimingModel();

  useEffect(() => {
    afterTimingCommit(document.getElementById('keysFinishCancelHost'));
  }, [model.cancelHtml, model.sig]);

  if (!model.cancelHtml) return <></>;
  // eslint-disable-next-line react/no-danger -- markup 来自 legacy renderKeysFinishCancelOnly
  return <div dangerouslySetInnerHTML={{ __html: model.cancelHtml }} />;
}

export function registerKeysFinishTimingBridge(): void {
  ensureBridge();
  syncFromLegacy();
}
