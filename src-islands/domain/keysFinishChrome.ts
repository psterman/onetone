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
  sig: string;
}

interface LegacyFinishRender {
  buildKeysFinishChromeModel?: () => KeysFinishChromeModel;
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
    if (model.moreHidden) more.open = false;
  }

  const preview = document.getElementById('keysFinishStrategyPreview');
  if (preview) {
    preview.textContent = model.previewText || '—';
    preview.className = model.previewClass || 'keys-finish-strategy-preview is-empty';
  }
}
