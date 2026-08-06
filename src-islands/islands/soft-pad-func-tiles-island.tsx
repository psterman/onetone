import { useEffect, useRef } from 'react';
import { useSyncExternalStore } from 'react';
import { useIslandRefresh } from '../island-runtime';
import {
  buildSoftPadFuncTilesModel,
  softPadFuncTilesReady,
  softPadFuncTilesSignature,
  type SoftPadFuncTilesModel,
} from '../domain/softPadFuncTiles';

// P14c: #softPadFuncTiles sync-push 岛。
// HTML 来自 legacy buildSoftPadFuncTilesModel；交互仍走 data-tile 委托。

const EMPTY: SoftPadFuncTilesModel = {
  tilesHtml: '',
  hidden: true,
  ariaLabel: '',
  mappingId: '',
  view: 'hub',
  ready: false,
  sig: 'empty',
};

type Win = Window & {
  __otSoftPadFuncTilesSync?: () => void;
  __otSoftPadFuncTilesForce?: () => void;
  __otSoftPadFuncTilesMounted?: boolean;
  OneToneSoftPadHub?: {
    openSubpage?: (view: string, opts?: { fromUser?: boolean }) => void;
  };
};

let currentModel: SoftPadFuncTilesModel = EMPTY;
let currentSig = '';
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((l) => l());
}

function applyHostAttrs(model: SoftPadFuncTilesModel): void {
  const host = document.getElementById('softPadFuncTiles');
  if (!host) return;
  host.hidden = !!model.hidden;
  if (model.ariaLabel) host.setAttribute('aria-label', model.ariaLabel);
}

function pullModel(): SoftPadFuncTilesModel {
  if (!softPadFuncTilesReady()) return EMPTY;
  return buildSoftPadFuncTilesModel();
}

function syncFromLegacy(): void {
  const next = pullModel();
  const sig = softPadFuncTilesSignature(next);
  applyHostAttrs(next);
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

function getSnapshot(): SoftPadFuncTilesModel {
  return currentModel;
}

function ensureBridge(): void {
  const w = window as Win;
  w.__otSoftPadFuncTilesSync = syncFromLegacy;
  w.__otSoftPadFuncTilesForce = () => {
    currentSig = '';
    syncFromLegacy();
  };
  w.__otSoftPadFuncTilesMounted = true;
}

function useFuncTilesModel(): SoftPadFuncTilesModel {
  const mountedOnce = useRef(false);

  useEffect(() => {
    ensureBridge();
    if (!mountedOnce.current) {
      mountedOnce.current = true;
      syncFromLegacy();
    }
  }, []);

  useIslandRefresh(syncFromLegacy);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function SoftPadFuncTilesIsland(): JSX.Element {
  const model = useFuncTilesModel();

  if (!model.tilesHtml) return <></>;
  // eslint-disable-next-line react/no-danger -- markup 来自 legacy buildSoftPadFuncTilesModel
  return (
    <div
      onClickCapture={(ev) => {
        const target = ev.target as Element | null;
        const tile = target?.closest?.('[data-tile]') as HTMLButtonElement | null;
        if (!tile || tile.disabled || tile.getAttribute('aria-disabled') === 'true') return;
        const view = tile.getAttribute('data-tile');
        if (!view) return;
        (window as Win).OneToneSoftPadHub?.openSubpage?.(view, { fromUser: true });
      }}
      dangerouslySetInnerHTML={{ __html: model.tilesHtml }}
    />
  );
}

export function registerSoftPadFuncTilesBridge(): void {
  ensureBridge();
  syncFromLegacy();
}
