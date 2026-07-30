import { useEffect, useRef } from 'react';
import { useSyncExternalStore } from 'react';
import { useIslandRefresh } from '../island-runtime';
import {
  buildSoftPadScopeHintModel,
  softPadScopeHintReady,
  softPadScopeHintSignature,
  type SoftPadScopeHintModel,
} from '../domain/softPadScopeHint';

// P14h: #softPadScopeHint 文案岛（sync-push）。
// aria-live 保留在宿主 <p>；React 只渲染文本。

const EMPTY: SoftPadScopeHintModel = {
  text: '',
  sig: 'empty',
};

type Win = Window & {
  __otSoftPadScopeHintSync?: () => void;
  __otSoftPadScopeHintMounted?: boolean;
};

let currentModel: SoftPadScopeHintModel = EMPTY;
let currentSig = '';
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((l) => l());
}

function pullModel(): SoftPadScopeHintModel {
  if (!softPadScopeHintReady()) return EMPTY;
  return buildSoftPadScopeHintModel();
}

function syncFromLegacy(): void {
  const next = pullModel();
  const sig = softPadScopeHintSignature(next);
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

function getSnapshot(): SoftPadScopeHintModel {
  return currentModel;
}

function ensureBridge(): void {
  const w = window as Win;
  w.__otSoftPadScopeHintSync = syncFromLegacy;
  w.__otSoftPadScopeHintMounted = true;
}

function useScopeHintModel(): SoftPadScopeHintModel {
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

export function SoftPadScopeHintIsland(): JSX.Element {
  const model = useScopeHintModel();
  return <>{model.text}</>;
}

export function registerSoftPadScopeHintBridge(): void {
  ensureBridge();
}
