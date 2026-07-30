import { useEffect, useRef } from 'react';
import { useSyncExternalStore } from 'react';
import { useIslandRefresh } from '../island-runtime';
import {
  applyCameraFlowChromeHosts,
  buildCameraFlowChromeModel,
  cameraFlowChromeReady,
  cameraFlowChromeSignature,
  type CameraFlowChromeModel,
} from '../domain/cameraFlowChrome';

const EMPTY: CameraFlowChromeModel = {
  activeTab: 'trigger',
  locked: false,
  triggerHint: '',
  actionHint: '',
  proHint: '',
  sig: 'empty',
};

type Win = Window & {
  __otCameraFlowChromeSync?: () => void;
  __otCameraFlowChromeMounted?: boolean;
};

let currentModel: CameraFlowChromeModel = EMPTY;
let currentSig = '';
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((l) => l());
}

function pullModel(): CameraFlowChromeModel {
  if (!cameraFlowChromeReady()) return EMPTY;
  return buildCameraFlowChromeModel();
}

function syncFromLegacy(): void {
  const next = pullModel();
  applyCameraFlowChromeHosts(next);
  const sig = cameraFlowChromeSignature(next);
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

function getSnapshot(): CameraFlowChromeModel {
  return currentModel;
}

function ensureBridge(): void {
  const w = window as Win;
  w.__otCameraFlowChromeSync = syncFromLegacy;
  w.__otCameraFlowChromeMounted = true;
}

function useModel(): CameraFlowChromeModel {
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

export function CameraFlowChromeIsland(): JSX.Element {
  const model = useModel();
  return <>{model.triggerHint}</>;
}

export function registerCameraFlowChromeBridge(): void {
  ensureBridge();
  syncFromLegacy();
}
