import { useEffect, useRef } from 'react';
import { useSyncExternalStore } from 'react';
import { useIslandRefresh } from '../island-runtime';
import {
  buildSoftPadEmptyIdleModel,
  loadSoftPadScopeKind,
  prepareSoftPadApp,
  prepareSoftPadCreateKind,
  softPadEmptyIdleReady,
  softPadEmptyIdleSignature,
  type SoftPadEmptyIdleModel,
} from '../domain/softPadEmptyIdle';

// P14d: #softPadEmpty + #softPadDetailIdle 双宿主共享 store。
// 交互：React onClick → prepareAppFromUi（不 bindEmptyCreateCtas 直绑）。

const EMPTY: SoftPadEmptyIdleModel = {
  mode: 'none',
  emptyHtml: '',
  emptyHidden: true,
  emptyTitle: '',
  emptyDesc: '',
  createCodexLabel: '',
  createClaudeLabel: '',
  prepareAppId: '',
  prepareKind: '',
  prepareTitle: '',
  prepareHint: '',
  prepareBtnLabel: '',
  idleTitle: '',
  idleSub: '',
  idleHidden: true,
  sig: 'empty',
};

type Win = Window & {
  __otSoftPadEmptyIdleSync?: () => void;
  __otSoftPadEmptyIdleMounted?: boolean;
};

let currentModel: SoftPadEmptyIdleModel = EMPTY;
let currentSig = '';
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((l) => l());
}

function applyHostAttrs(model: SoftPadEmptyIdleModel): void {
  const empty = document.getElementById('softPadEmpty');
  if (empty) empty.hidden = !!model.emptyHidden;
  const idle = document.getElementById('softPadDetailIdle');
  if (idle) idle.hidden = !!model.idleHidden;
}

function pullModel(): SoftPadEmptyIdleModel {
  if (!softPadEmptyIdleReady()) return EMPTY;
  return buildSoftPadEmptyIdleModel();
}

function syncFromLegacy(): void {
  const next = pullModel();
  const sig = softPadEmptyIdleSignature(next);
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

function getSnapshot(): SoftPadEmptyIdleModel {
  return currentModel;
}

function ensureBridge(): void {
  const w = window as Win;
  w.__otSoftPadEmptyIdleSync = syncFromLegacy;
  w.__otSoftPadEmptyIdleMounted = true;
}

function useEmptyIdleModel(): SoftPadEmptyIdleModel {
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

export function SoftPadEmptyIsland(): JSX.Element {
  const model = useEmptyIdleModel();
  const actionsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = actionsRef.current;
    if (!root || model.mode !== 'empty') return;
    const onClick = (ev: MouseEvent) => {
      const t = ev.target as HTMLElement | null;
      if (!t) return;
      const load = t.closest('[data-soft-pad-load-scope]') as HTMLElement | null;
      if (load) {
        loadSoftPadScopeKind(load.getAttribute('data-soft-pad-load-scope') || '');
        return;
      }
      const create = t.closest('[data-soft-pad-create-kind]') as HTMLElement | null;
      if (create) {
        prepareSoftPadCreateKind(create.getAttribute('data-soft-pad-create-kind') || 'codex');
      }
    };
    root.addEventListener('click', onClick);
    return () => root.removeEventListener('click', onClick);
  }, [model.mode, model.sig]);

  if (model.mode === 'empty') {
    // Prefer legacy emptyHtml (may list existing Agent scopes); fallback to create CTAs.
    if (model.emptyHtml) {
      return (
        <div
          ref={actionsRef}
          className="soft-pad-empty__from-hub"
          dangerouslySetInnerHTML={{ __html: model.emptyHtml }}
        />
      );
    }
    return (
      <>
        <p className="soft-pad-empty__title">{model.emptyTitle}</p>
        <p className="soft-pad-empty__desc">{model.emptyDesc}</p>
        <div className="soft-pad-empty__actions">
          <button
            type="button"
            className="codex-micro-pad__btn codex-micro-pad__btn--primary"
            data-soft-pad-create-kind="codex"
            onClick={() => prepareSoftPadCreateKind('codex')}
          >
            {model.createCodexLabel}
          </button>
          <button
            type="button"
            className="codex-micro-pad__btn"
            data-soft-pad-create-kind="claude"
            onClick={() => prepareSoftPadCreateKind('claude')}
          >
            {model.createClaudeLabel}
          </button>
        </div>
      </>
    );
  }

  if (model.mode === 'prepare') {
    return (
      <>
        <p className="soft-pad-empty__title">{model.emptyTitle || model.prepareTitle}</p>
        <p className="soft-pad-empty__desc">{model.emptyDesc || model.prepareHint}</p>
        <button
          type="button"
          className="codex-micro-pad__btn codex-micro-pad__btn--primary"
          data-soft-pad-prepare-cta={model.prepareAppId}
          data-scheme-kind={model.prepareKind}
          onClick={() => prepareSoftPadApp(model.prepareAppId, model.prepareKind)}
        >
          {model.prepareBtnLabel}
        </button>
      </>
    );
  }

  return <></>;
}

export function SoftPadDetailIdleIsland(): JSX.Element {
  const model = useEmptyIdleModel();
  return (
    <>
      <p className="soft-pad-detail-idle__title">{model.idleTitle}</p>
      <p className="soft-pad-detail-idle__sub">{model.idleSub}</p>
    </>
  );
}

export function registerSoftPadEmptyIdleBridge(): void {
  ensureBridge();
  syncFromLegacy();
}
