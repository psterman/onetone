import { useEffect, useRef } from 'react';
import { useSyncExternalStore } from 'react';
import { useIslandRefresh } from '../island-runtime';
import {
  buildMappingEditorDisplayModel,
  displayModelSignature,
  mappingEditorDisplayReady,
  type MappingEditorDisplayModel,
} from '../domain/mappingEditorDisplay';

// P12b-1: #triggerView / #targetView 只读文案岛。
// 双宿主共享同一 sync store（避免两个 useEffect 互相覆盖 __otMappingEditorDisplaySync）。

const EMPTY: MappingEditorDisplayModel = {
  triggerLabel: '',
  targetLabel: '',
  triggerRaw: '',
  targetRaw: '',
  triggerEmpty: true,
  targetEmpty: true,
  sig: '',
};

type Win = Window & {
  __otMappingEditorDisplaySync?: () => void;
  __otMappingEditorDisplayMounted?: boolean;
};

let currentModel: MappingEditorDisplayModel = EMPTY;
let currentSig = '';
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((l) => l());
}

function pullModel(): MappingEditorDisplayModel {
  if (!mappingEditorDisplayReady()) return EMPTY;
  return buildMappingEditorDisplayModel();
}

function syncFromLegacy(): void {
  const next = pullModel();
  const sig = displayModelSignature(next);
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

function getSnapshot(): MappingEditorDisplayModel {
  return currentModel;
}

function ensureBridge(): void {
  const w = window as Win;
  w.__otMappingEditorDisplaySync = syncFromLegacy;
  w.__otMappingEditorDisplayMounted = true;
}

function useDisplayModel(): MappingEditorDisplayModel {
  const mountedOnce = useRef(false);

  useEffect(() => {
    ensureBridge();
    if (!mountedOnce.current) {
      mountedOnce.current = true;
      syncFromLegacy();
    }
    // 岛挂载后常驻（habitBasicStash 不卸载），不拆除 bridge
  }, []);

  useIslandRefresh(syncFromLegacy);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function MappingEditorTriggerIsland(): JSX.Element {
  const model = useDisplayModel();
  return <>{model.triggerLabel}</>;
}

export function MappingEditorTargetIsland(): JSX.Element {
  const model = useDisplayModel();
  return <>{model.targetLabel}</>;
}

/** 供 main 挂载时一次性接线（双岛 mount 前也可先设标志）。 */
export function registerMappingEditorDisplayBridge(): void {
  ensureBridge();
  syncFromLegacy();
}
