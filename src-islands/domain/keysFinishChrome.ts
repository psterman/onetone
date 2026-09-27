// P12b-7: Keys 收尾 hint / strategy preview / finish-more。
// 单一来源：legacy OneToneKeyFinishFlowRender.buildKeysFinishChromeModel。

export interface KeysFinishChromeModel {
  hintText: string;
  hintHidden: boolean;
  moreHidden: boolean;
  previewText: string;
  previewClass: string;
  previewSaved?: boolean;
  mappingId: string;
  finishMode: string;
  cancelSummary?: string;
  aimConfigured?: boolean;
  aimStrategy?: string;
  aimSummary?: string;
  sig: string;
}

interface LegacyFinishRender {
  buildKeysFinishChromeModel?: () => KeysFinishChromeModel;
  syncKeysAimFold?: (model?: KeysFinishChromeModel) => void;
}

const EMPTY: KeysFinishChromeModel = {
  hintText: '',
  hintHidden: true,
  moreHidden: true,
  previewText: '—',
  previewClass: 'keys-finish-strategy-preview is-empty',
  previewSaved: false,
  mappingId: '',
  finishMode: '',
  sig: 'empty',
};

function legacyFinish(): LegacyFinishRender {
  return (
    (window as unknown as { OneToneKeyFinishFlowRender?: LegacyFinishRender }).OneToneKeyFinishFlowRender ??
    {}
  );
}

export function keysFinishChromeReady(): boolean {
  return typeof legacyFinish().buildKeysFinishChromeModel === 'function';
}

export function buildKeysFinishChromeModel(): KeysFinishChromeModel {
  const api = legacyFinish();
  if (!api.buildKeysFinishChromeModel) return EMPTY;
  try {
    return api.buildKeysFinishChromeModel();
  } catch (err) {
    console.error('[islands] buildKeysFinishChromeModel failed', err);
    return EMPTY;
  }
}

export function finishChromeSignature(model: KeysFinishChromeModel): string {
  return (
    model.sig ||
    `${model.mappingId}\0${model.finishMode}\0${model.hintText}\0${model.moreHidden}\0${model.previewText}`
  );
}

/** 写 hint 宿主外的 preview / finish-more（hint 文案由 React 渲染）。 */
export function applyKeysFinishChromeHosts(model: KeysFinishChromeModel): void {
  const hint = document.getElementById('keysFinishModeHint');
  if (hint) hint.hidden = !!model.hintHidden;

  const more = document.getElementById('habitFlowFinishMore') as HTMLDetailsElement | null;
  if (more) {
    more.hidden = !!model.moreHidden;
    // Advanced: default collapsed. Only force-close when leaving the finish desk.
    if (model.moreHidden) more.open = false;
  }

  const cancelSum = document.getElementById('keysFinishCancelSummary');
  if (cancelSum && model.cancelSummary != null) {
    cancelSum.textContent = model.cancelSummary;
  }

  // Aim fold + demo mode switch (island path used to skip pane/animation sync).
  const legacy = window as unknown as {
    OneToneKeyFinishFlowRender?: {
      syncKeysAimFold?: (m: KeysFinishChromeModel) => void;
      syncKeysAimDemo?: (strategy: string) => void;
    };
  };
  const aimApi = legacy.OneToneKeyFinishFlowRender;
  if (aimApi && typeof aimApi.syncKeysAimFold === 'function') {
    aimApi.syncKeysAimFold(model);
  } else {
    const aimFold = document.getElementById('keysAimFold');
    if (aimFold) aimFold.hidden = !!model.moreHidden;
    const aimSum = document.getElementById('keysAimFoldSummary');
    if (aimSum && model.aimSummary != null) aimSum.textContent = model.aimSummary;
    const aimBar = document.getElementById('keysAimWritebar');
    if (aimBar && model.aimStrategy) aimBar.setAttribute('data-aim', model.aimStrategy);
    const aimSel = document.getElementById('keysAimStrategy') as HTMLSelectElement | null;
    if (aimSel && model.aimStrategy && aimSel.value !== model.aimStrategy) {
      aimSel.value = model.aimStrategy;
    }
    const aimCal = document.getElementById('keysAimCalRow');
    if (aimCal) aimCal.hidden = model.aimStrategy !== 'auto';
    if (aimApi && typeof aimApi.syncKeysAimDemo === 'function' && model.aimStrategy) {
      aimApi.syncKeysAimDemo(model.aimStrategy);
    }
  }

  const preview = document.getElementById('keysFinishStrategyPreview');
  if (preview) {
    preview.textContent = model.previewText || '—';
    preview.className = model.previewClass || 'keys-finish-strategy-preview is-empty';
  }
}
