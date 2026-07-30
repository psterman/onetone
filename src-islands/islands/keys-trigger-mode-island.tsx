import { useEffect, useRef } from 'react';
import { useSyncExternalStore } from 'react';
import { useIslandRefresh } from '../island-runtime';
import {
  buildKeysTriggerModeModel,
  keysTriggerModeReady,
  triggerModeSignature,
  type KeysTriggerModeModel,
} from '../domain/keysTriggerMode';

// P12b-6: #keysTriggerModeHost sync-push 岛。
// HTML 来自 legacy buildKeysTriggerModeModel；交互仍走 data-trigger-mode / data-keys-hold-switch 委托。

const EMPTY: KeysTriggerModeModel = {
  modeHtml: '',
  mappingId: '',
  triggerUi: '',
  gateOk: false,
  sig: 'empty',
};

type Win = Window & {
  __otKeysTriggerModeSync?: () => void;
  __otKeysTriggerModeMounted?: boolean;
};

let currentModel: KeysTriggerModeModel = EMPTY;
let currentSig = '';
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((l) => l());
}

function pullModel(): KeysTriggerModeModel {
  if (!keysTriggerModeReady()) return EMPTY;
  return buildKeysTriggerModeModel();
}

function syncFromLegacy(): void {
  const next = pullModel();
  const sig = triggerModeSignature(next);
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

function getSnapshot(): KeysTriggerModeModel {
  return currentModel;
}

function ensureBridge(): void {
  const w = window as Win;
  w.__otKeysTriggerModeSync = syncFromLegacy;
  w.__otKeysTriggerModeMounted = true;
}

function useTriggerModeModel(): KeysTriggerModeModel {
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

export function KeysTriggerModeIsland(): JSX.Element {
  const model = useTriggerModeModel();

  if (!model.modeHtml) return <></>;
  // eslint-disable-next-line react/no-danger -- markup 来自 legacy buildKeysTriggerModeModel
  return <div dangerouslySetInnerHTML={{ __html: model.modeHtml }} />;
}

export function registerKeysTriggerModeBridge(): void {
  ensureBridge();
  syncFromLegacy();
}
