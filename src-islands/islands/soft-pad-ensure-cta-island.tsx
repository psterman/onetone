import { useEffect, useRef } from 'react';
import { useSyncExternalStore } from 'react';
import { useIslandRefresh } from '../island-runtime';
import {
  buildSoftPadEnsureCtaModel,
  runSoftPadEnsureCodex,
  softPadEnsureCtaReady,
  softPadEnsureCtaSignature,
  type SoftPadEnsureCtaModel,
} from '../domain/softPadEnsureCta';

// P14j: #btnSoftPadEnsureCodex — React 拥有按钮文案与 click。

const EMPTY: SoftPadEnsureCtaModel = {
  label: '+ 准备 Codex 虚拟键盘',
  sig: 'empty',
};

type Win = Window & {
  __otSoftPadEnsureCtaSync?: () => void;
  __otSoftPadEnsureCtaMounted?: boolean;
};

let currentModel: SoftPadEnsureCtaModel = EMPTY;
let currentSig = '';
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((l) => l());
}

function pullModel(): SoftPadEnsureCtaModel {
  if (!softPadEnsureCtaReady()) return EMPTY;
  return buildSoftPadEnsureCtaModel();
}

function syncFromLegacy(): void {
  const next = pullModel();
  const sig = softPadEnsureCtaSignature(next);
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

function getSnapshot(): SoftPadEnsureCtaModel {
  return currentModel;
}

function ensureBridge(): void {
  const w = window as Win;
  w.__otSoftPadEnsureCtaSync = syncFromLegacy;
  w.__otSoftPadEnsureCtaMounted = true;
}

function useEnsureCtaModel(): SoftPadEnsureCtaModel {
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

export function SoftPadEnsureCtaIsland(): JSX.Element {
  const model = useEnsureCtaModel();

  useEffect(() => {
    const host = document.getElementById('btnSoftPadEnsureCodex');
    if (!host) return;
    const onClick = () => runSoftPadEnsureCodex();
    host.addEventListener('click', onClick);
    return () => host.removeEventListener('click', onClick);
  }, []);

  return <>{model.label}</>;
}

export function registerSoftPadEnsureCtaBridge(): void {
  ensureBridge();
}
