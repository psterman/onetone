import { useEffect, useRef } from 'react';
import { useSyncExternalStore } from 'react';
import { useIslandRefresh } from '../island-runtime';
import {
  applyKeysTriggerConflictHost,
  buildKeysTriggerConflictModel,
  keysTriggerConflictReady,
  triggerConflictSignature,
  type KeysTriggerConflictModel,
} from '../domain/keysTriggerConflict';

// P12b-8: #keysTriggerConflict sync-push。
// HTML 来自 legacy；交互仍走 data-keys-conflict-* 委托。

const EMPTY: KeysTriggerConflictModel = {
  html: '',
  hidden: true,
  mappingId: '',
  msg: '',
  sig: 'empty',
};

type Win = Window & {
  __otKeysTriggerConflictSync?: () => void;
  __otKeysTriggerConflictMounted?: boolean;
};

let currentModel: KeysTriggerConflictModel = EMPTY;
let currentSig = '';
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((l) => l());
}

function pullModel(): KeysTriggerConflictModel {
  if (!keysTriggerConflictReady()) return EMPTY;
  return buildKeysTriggerConflictModel();
}

function syncFromLegacy(): void {
  const next = pullModel();
  applyKeysTriggerConflictHost(next);
  const sig = triggerConflictSignature(next);
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

function getSnapshot(): KeysTriggerConflictModel {
  return currentModel;
}

function ensureBridge(): void {
  const w = window as Win;
  w.__otKeysTriggerConflictSync = syncFromLegacy;
  w.__otKeysTriggerConflictMounted = true;
}

function useConflictModel(): KeysTriggerConflictModel {
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

export function KeysTriggerConflictIsland(): JSX.Element {
  const model = useConflictModel();

  if (model.hidden || !model.html) return <></>;
  // eslint-disable-next-line react/no-danger -- markup 来自 legacy buildKeysTriggerConflictModel
  return <div dangerouslySetInnerHTML={{ __html: model.html }} />;
}

export function registerKeysTriggerConflictBridge(): void {
  ensureBridge();
  syncFromLegacy();
}
