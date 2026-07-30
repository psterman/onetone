import { useEffect, useRef } from 'react';
import { useSyncExternalStore } from 'react';
import { useIslandRefresh } from '../island-runtime';
import {
  buildSoftPadDetailChromeModel,
  closeSoftPadSubpage,
  softPadDetailChromeReady,
  softPadDetailChromeSignature,
  type SoftPadDetailChromeModel,
} from '../domain/softPadDetailChrome';

// P14g: #softPadSubpageBar 顶栏岛（返回 + 标题）。
// React 拥有 bar 内容；detailPanel / subpage body 仍由 P14d/P14f 管。

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

export function SoftPadDetailChromeIsland(): JSX.Element {
  const model = useDetailChromeModel();

  return (
    <>
      <button
        type="button"
        className="codex-micro-pad__btn soft-pad-subpage-back"
        id="btnSoftPadSubBack"
        hidden={!!model.backHidden}
        onClick={() => closeSoftPadSubpage()}
      >
        {model.backLabel}
      </button>
      <h4 className="soft-pad-subpage-title" id="softPadSubpageTitle">
        {model.title}
      </h4>
    </>
  );
}

export function registerSoftPadDetailChromeBridge(): void {
  ensureBridge();
}
