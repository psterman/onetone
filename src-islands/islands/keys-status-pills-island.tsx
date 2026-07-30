import { useEffect, useRef } from 'react';
import { useSyncExternalStore } from 'react';
import { useIslandRefresh } from '../island-runtime';
import {
  applyKeysStatusPillsHosts,
  buildKeysStatusPillsModel,
  keysStatusPillsReady,
  keysStatusPillsSignature,
  type KeysStatusPillsModel,
} from '../domain/keysStatusPills';

// P12c-2: #habitKeyMapStTrigger/Target/Finish/Cancel sync-push（不接管 cell）。

const EMPTY_PILL = { text: '—', kind: 'none' };
const EMPTY: KeysStatusPillsModel = {
  trigger: EMPTY_PILL,
  target: EMPTY_PILL,
  cancel: EMPTY_PILL,
  finish: EMPTY_PILL,
  highlightStep: '',
  mappingId: '',
  sig: 'empty',
};

type Win = Window & {
  __otKeysStatusPillsSync?: () => void;
  __otKeysStatusPillsMounted?: boolean;
};

let currentModel: KeysStatusPillsModel = EMPTY;
let currentSig = '';
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((l) => l());
}

function pullModel(): KeysStatusPillsModel {
  if (!keysStatusPillsReady()) return EMPTY;
  return buildKeysStatusPillsModel();
}

function syncFromLegacy(): void {
  const next = pullModel();
  applyKeysStatusPillsHosts(next);
  const sig = keysStatusPillsSignature(next);
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

function getSnapshot(): KeysStatusPillsModel {
  return currentModel;
}

function ensureBridge(): void {
  const w = window as Win;
  w.__otKeysStatusPillsSync = syncFromLegacy;
  w.__otKeysStatusPillsMounted = true;
}

function usePillsModel(): KeysStatusPillsModel {
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

// P12c-2: Keys status pills（Trigger/Target/Finish/Cancel）。
// 挂在 #habitFlowStepTriggerLbl（apply 不写此宿主），避免 React empty 清掉 pill 文案。

export function KeysStatusPillsIsland(): JSX.Element {
  usePillsModel();
  return <></>;
}

export function registerKeysStatusPillsBridge(): void {
  ensureBridge();
  syncFromLegacy();
}
