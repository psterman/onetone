import { useEffect, useRef } from 'react';
import { useSyncExternalStore } from 'react';
import { useIslandRefresh } from '../island-runtime';
import {
  applyKeysRecordingFeedbackHosts,
  buildKeysRecordingFeedbackModel,
  keysRecordingFeedbackReady,
  keysRecordingFeedbackSignature,
  type KeysRecordingFeedbackModel,
} from '../domain/keysRecordingFeedback';

// P12c-3: #keysRecordingFeedback sync-push（不挪 cancel 按钮出 P12b-3 root）。

const EMPTY: KeysRecordingFeedbackModel = {
  mode: 'none',
  recording: false,
  hidden: true,
  text: '',
  conflictText: '',
  conflictHidden: true,
  conflictWarn: false,
  sig: 'empty',
};

type Win = Window & {
  __otKeysRecordingFeedbackSync?: () => void;
  __otKeysRecordingFeedbackMounted?: boolean;
};

let currentModel: KeysRecordingFeedbackModel = EMPTY;
let currentSig = '';
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((l) => l());
}

function pullModel(): KeysRecordingFeedbackModel {
  if (!keysRecordingFeedbackReady()) return EMPTY;
  return buildKeysRecordingFeedbackModel();
}

function syncFromLegacy(): void {
  const next = pullModel();
  applyKeysRecordingFeedbackHosts(next);
  const sig = keysRecordingFeedbackSignature(next);
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

function getSnapshot(): KeysRecordingFeedbackModel {
  return currentModel;
}

function ensureBridge(): void {
  const w = window as Win;
  w.__otKeysRecordingFeedbackSync = syncFromLegacy;
  w.__otKeysRecordingFeedbackMounted = true;
}

function useFeedbackModel(): KeysRecordingFeedbackModel {
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

export function KeysRecordingFeedbackIsland(): JSX.Element {
  const model = useFeedbackModel();
  return <>{model.text}</>;
}

export function registerKeysRecordingFeedbackBridge(): void {
  ensureBridge();
  syncFromLegacy();
}
