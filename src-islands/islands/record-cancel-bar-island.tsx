import { useEffect, useRef } from 'react';
import { useSyncExternalStore } from 'react';
import { useIslandRefresh } from '../island-runtime';
import {
  buildRecordCancelBarModel,
  cancelBarSignature,
  cancelDraftOrRecording,
  recordCancelBarReady,
  type RecordCancelBarModel,
} from '../domain/recordCancelBar';

// P12b-3: #recordCancelBar sync-push 岛。
// 按钮留在 bar 内（禁用 syncCancelButtonHost 挪移）；onClick → legacy cancelDraftOrRecording。

const EMPTY: RecordCancelBarModel = {
  show: false,
  label: '',
  mode: 'none',
  mappingId: '',
  sig: '',
};

type Win = Window & {
  __otRecordCancelBarSync?: () => void;
  __otRecordCancelBarMounted?: boolean;
};

let currentModel: RecordCancelBarModel = EMPTY;
let currentSig = '';
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((l) => l());
}

function applyBarShow(model: RecordCancelBarModel): void {
  const bar = document.getElementById('recordCancelBar');
  if (bar) bar.classList.toggle('show', !!model.show);
}

function pullModel(): RecordCancelBarModel {
  if (!recordCancelBarReady()) return EMPTY;
  return buildRecordCancelBarModel();
}

function syncFromLegacy(): void {
  const next = pullModel();
  const sig = cancelBarSignature(next);
  applyBarShow(next);
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

function getSnapshot(): RecordCancelBarModel {
  return currentModel;
}

function ensureBridge(): void {
  const w = window as Win;
  w.__otRecordCancelBarSync = syncFromLegacy;
  w.__otRecordCancelBarMounted = true;
}

function useCancelBarModel(): RecordCancelBarModel {
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

export function RecordCancelBarIsland(): JSX.Element {
  const model = useCancelBarModel();

  return (
    <button
      type="button"
      id="btnCancelRecord"
      className="btn-cancel-record"
      onClick={() => {
        cancelDraftOrRecording();
      }}
    >
      {model.label}
    </button>
  );
}

export function registerRecordCancelBarBridge(): void {
  ensureBridge();
  syncFromLegacy();
}
