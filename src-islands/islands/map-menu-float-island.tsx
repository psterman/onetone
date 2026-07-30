import { useEffect, useRef } from 'react';
import { useSyncExternalStore } from 'react';
import { useIslandRefresh } from '../island-runtime';
import {
  buildMapMenuFloatModel,
  mapMenuFloatReady,
  mapMenuFloatSignature,
  runMapMenuAct,
  type MapMenuAct,
  type MapMenuFloatModel,
} from '../domain/mapMenuFloat';

// P12b-4: #mapMenuFloat sync-push 岛。
// open/定位/data-id/disabled/labels 由 sync；动作 React onClick → legacy runMenuAct。

const EMPTY: MapMenuFloatModel = {
  open: false,
  id: '',
  left: 0,
  top: 0,
  disabled: { test: true, dup: true, up: true, down: true, del: true },
  labels: { test: '', dup: '', up: '', down: '', del: '' },
  sig: 'closed',
};

type Win = Window & {
  __otMapMenuFloatSync?: () => void;
  __otMapMenuFloatMounted?: boolean;
};

let currentModel: MapMenuFloatModel = EMPTY;
let currentSig = '';
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((l) => l());
}

function applyHostAttrs(model: MapMenuFloatModel): void {
  const host = document.getElementById('mapMenuFloat');
  if (!host) return;
  if (model.open) {
    host.dataset.id = model.id;
    host.style.left = `${model.left}px`;
    host.style.top = `${model.top}px`;
    host.classList.add('open');
  } else {
    host.classList.remove('open');
    host.removeAttribute('data-id');
  }
}

function pullModel(): MapMenuFloatModel {
  if (!mapMenuFloatReady()) return EMPTY;
  return buildMapMenuFloatModel();
}

function syncFromLegacy(): void {
  const next = pullModel();
  const sig = mapMenuFloatSignature(next);
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

function getSnapshot(): MapMenuFloatModel {
  return currentModel;
}

function ensureBridge(): void {
  const w = window as Win;
  w.__otMapMenuFloatSync = syncFromLegacy;
  w.__otMapMenuFloatMounted = true;
}

function useMapMenuFloatModel(): MapMenuFloatModel {
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

const ACTS: { act: MapMenuAct; id: string; danger?: boolean }[] = [
  { act: 'test', id: 'menuActTest' },
  { act: 'dup', id: 'menuActDup' },
  { act: 'up', id: 'menuActUp' },
  { act: 'down', id: 'menuActDown' },
  { act: 'del', id: 'menuActDel', danger: true },
];

export function MapMenuFloatIsland(): JSX.Element {
  const model = useMapMenuFloatModel();

  return (
    <>
      {ACTS.map(({ act, id, danger }) => (
        <button
          key={act}
          type="button"
          id={id}
          data-act={act}
          className={danger ? 'danger' : undefined}
          disabled={model.disabled[act]}
          onClick={(e) => {
            e.stopPropagation();
            if (model.disabled[act]) return;
            runMapMenuAct(act);
          }}
        >
          {model.labels[act]}
        </button>
      ))}
    </>
  );
}

export function registerMapMenuFloatBridge(): void {
  ensureBridge();
  syncFromLegacy();
}
