import { useEffect, useRef } from 'react';
import { useSyncExternalStore } from 'react';
import { useIslandRefresh } from '../island-runtime';
import {
  applyVoiceEngineTabsHosts,
  buildVoiceEngineTabsModel,
  voiceEngineTabsReady,
  voiceEngineTabsSignature,
  type VoiceEngineTabsModel,
} from '../domain/voiceEngineTabs';

// P6c: engine tabs sync-push（宿主挂在 sr-only label，避免清空 grid 委托）。

const EMPTY: VoiceEngineTabsModel = {
  activeTab: 'vosk',
  voskOnly: false,
  disabled: false,
  busy: false,
  tabs: [],
  sig: 'empty',
};

type Win = Window & {
  __otVoiceEngineTabsSync?: () => void;
  __otVoiceEngineTabsMounted?: boolean;
};

let currentModel: VoiceEngineTabsModel = EMPTY;
let currentSig = '';
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((l) => l());
}

function pullModel(): VoiceEngineTabsModel {
  if (!voiceEngineTabsReady()) return EMPTY;
  return buildVoiceEngineTabsModel();
}

function syncFromLegacy(): void {
  const next = pullModel();
  applyVoiceEngineTabsHosts(next);
  const sig = voiceEngineTabsSignature(next);
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

function getSnapshot(): VoiceEngineTabsModel {
  return currentModel;
}

function ensureBridge(): void {
  const w = window as Win;
  w.__otVoiceEngineTabsSync = syncFromLegacy;
  w.__otVoiceEngineTabsMounted = true;
}

function useTabsModel(): VoiceEngineTabsModel {
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

export function VoiceEngineTabsIsland(): JSX.Element {
  useTabsModel();
  return <></>;
}

export function registerVoiceEngineTabsBridge(): void {
  ensureBridge();
  syncFromLegacy();
}
