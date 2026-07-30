import { useEffect, useRef } from 'react';
import { useSyncExternalStore } from 'react';
import { useIslandRefresh } from '../island-runtime';
import {
  applyVoiceFlowChromeHosts,
  buildVoiceFlowChromeModel,
  voiceFlowChromeReady,
  voiceFlowChromeSignature,
  type VoiceFlowChromeModel,
} from '../domain/voiceFlowChrome';

// P6d: flow nodes active + hints sync-push（挂在 wake hint，不拆 SVG 结构）。

const EMPTY: VoiceFlowChromeModel = {
  activeStep: 'wake',
  wakeHint: '',
  recognizeHint: '',
  sendHint: '',
  sig: 'empty',
};

type Win = Window & {
  __otVoiceFlowChromeSync?: () => void;
  __otVoiceFlowChromeMounted?: boolean;
};

let currentModel: VoiceFlowChromeModel = EMPTY;
let currentSig = '';
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((l) => l());
}

function pullModel(): VoiceFlowChromeModel {
  if (!voiceFlowChromeReady()) return EMPTY;
  return buildVoiceFlowChromeModel();
}

function syncFromLegacy(): void {
  const next = pullModel();
  applyVoiceFlowChromeHosts(next);
  const sig = voiceFlowChromeSignature(next);
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

function getSnapshot(): VoiceFlowChromeModel {
  return currentModel;
}

function ensureBridge(): void {
  const w = window as Win;
  w.__otVoiceFlowChromeSync = syncFromLegacy;
  w.__otVoiceFlowChromeMounted = true;
}

function useFlowModel(): VoiceFlowChromeModel {
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

export function VoiceFlowChromeIsland(): JSX.Element {
  const model = useFlowModel();
  return <>{model.wakeHint}</>;
}

export function registerVoiceFlowChromeBridge(): void {
  ensureBridge();
  syncFromLegacy();
}
