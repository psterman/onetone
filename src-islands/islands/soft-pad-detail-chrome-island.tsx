import { useEffect, useRef } from 'react';
import { useSyncExternalStore } from 'react';
import { useIslandRefresh } from '../island-runtime';
import {
  applySoftPadDetailShellAttrs,
  buildSoftPadDetailChromeModel,
  softPadDetailChromeReady,
  softPadDetailChromeSignature,
  type SoftPadDetailChromeModel,
} from '../domain/softPadDetailChrome';

// SoftPad detail shell sync (panel/stage). Top back/title bar retired — pad tabs navigate.

const EMPTY: SoftPadDetailChromeModel = {
  view: 'hub',
  detailOpen: false,
  backHidden: true,
  backLabel: '← 返回',
  title: '',
  sig: 'empty',
};

type Win = Window & {
  __otSoftPadDetailChromeSync?: () => void;
  __otSoftPadDetailChromeMounted?: boolean;
};

let currentModel: SoftPadDetailChromeModel = EMPTY;
let currentSig = '';
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((l) => l());
}

function pullModel(): SoftPadDetailChromeModel {
  if (!softPadDetailChromeReady()) return EMPTY;
  return buildSoftPadDetailChromeModel();
}

function syncFromLegacy(): void {
  const next = pullModel();
  applySoftPadDetailShellAttrs(next);
  const sig = softPadDetailChromeSignature(next);
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

function getSnapshot(): SoftPadDetailChromeModel {
  return currentModel;
}

function ensureBridge(): void {
  const w = window as Win;
  w.__otSoftPadDetailChromeSync = syncFromLegacy;
  w.__otSoftPadDetailChromeMounted = true;
}

function useDetailChromeModel(): SoftPadDetailChromeModel {
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

export function SoftPadDetailChromeIsland(): JSX.Element | null {
  // Keep sync for detail panel / stage shell attrs; top back+title bar is retired
  // (pad tabs 显示/键位/用途 already navigate).
  useDetailChromeModel();
  return null;
}

export function registerSoftPadDetailChromeBridge(): void {
  ensureBridge();
}
