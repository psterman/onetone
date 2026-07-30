import { useEffect, useRef } from 'react';
import { useSyncExternalStore } from 'react';
import { useIslandRefresh } from '../island-runtime';
import {
  applyVoiceStatusChromeHosts,
  buildVoiceStatusChromeModel,
  voiceStatusChromeReady,
  voiceStatusChromeSignature,
  type VoiceStatusChromeModel,
} from '../domain/voiceStatusChrome';

// P6b: #voiceSummaryStatus + 状态栏旁路 hosts sync-push。

const EMPTY: VoiceStatusChromeModel = {
  brandTitle: '',
  schemeName: '—',
  statusText: '—',
  statusCls: 'keys-scheme-summary-pill voice-scheme-summary-pill',
  engineLbl: '',
  engineVal: '—',
  scopeLbl: '',
  scopeVal: '—',
  centerHidden: false,
  switchHidden: false,
  voiceOn: false,
  toggleTitle: '',
  loading: false,
  mode: '',
  sig: 'empty',
};

type Win = Window & {
  __otVoiceStatusChromeSync?: () => void;
  __otVoiceStatusChromeMounted?: boolean;
};

let currentModel: VoiceStatusChromeModel = EMPTY;
let currentSig = '';
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((l) => l());
}

function pullModel(): VoiceStatusChromeModel {
  if (!voiceStatusChromeReady()) return EMPTY;
  return buildVoiceStatusChromeModel();
}

function syncFromLegacy(): void {
  const next = pullModel();
  applyVoiceStatusChromeHosts(next);
  const sig = voiceStatusChromeSignature(next);
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

function getSnapshot(): VoiceStatusChromeModel {
  return currentModel;
}

function ensureBridge(): void {
  const w = window as Win;
  w.__otVoiceStatusChromeSync = syncFromLegacy;
  w.__otVoiceStatusChromeMounted = true;
}

function useStatusModel(): VoiceStatusChromeModel {
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

export function VoiceStatusChromeIsland(): JSX.Element {
  const model = useStatusModel();
  return <>{model.statusText}</>;
}

export function registerVoiceStatusChromeBridge(): void {
  ensureBridge();
  syncFromLegacy();
}
