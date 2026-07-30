// P14e: SoftPad 预览宿主。
// 单一来源：legacy OneToneSoftPadHub.buildSoftPadPreviewModel。

export interface SoftPadPreviewModel {
  mappingId: string;
  hidden: boolean;
  collapsed: boolean;
  clear: boolean;
  force: boolean;
  skipPaint: boolean;
  view: string;
  epoch: number;
  sig: string;
  previewEmpty?: string;
  emptyReason?: string;
  emptyHtml?: string;
}

interface LegacySoftPadHub {
  buildSoftPadPreviewModel?: () => SoftPadPreviewModel;
  getSelectedSoftPadMappingForPreview?: () => unknown;
}

interface LegacyPadUi {
  renderSoftPadPreview?: (host: HTMLElement, mapping: unknown, opts?: { forceFull?: boolean }) => void;
  resolveSoftPadPreviewPaintHost?: (preferred?: HTMLElement | null) => HTMLElement | null;
}

const EMPTY: SoftPadPreviewModel = {
  mappingId: '',
  hidden: true,
  collapsed: false,
  clear: true,
  force: false,
  skipPaint: true,
  view: 'hub',
  epoch: 0,
  sig: 'empty',
  previewEmpty: 'noMapping',
  emptyReason: 'noMapping',
  emptyHtml: '',
};

function legacyHub(): LegacySoftPadHub {
  return (
    (window as unknown as { OneToneSoftPadHub?: LegacySoftPadHub }).OneToneSoftPadHub ?? {}
  );
}

function legacyPad(): LegacyPadUi {
  return (
    (window as unknown as { OneToneCodexMicroPadUi?: LegacyPadUi }).OneToneCodexMicroPadUi ?? {}
  );
}

export function softPadPreviewReady(): boolean {
  return typeof legacyHub().buildSoftPadPreviewModel === 'function';
}

export function buildSoftPadPreviewModel(): SoftPadPreviewModel {
  const api = legacyHub();
  if (!api.buildSoftPadPreviewModel) return EMPTY;
  try {
    return api.buildSoftPadPreviewModel();
  } catch (err) {
    console.error('[islands] buildSoftPadPreviewModel failed', err);
    return EMPTY;
  }
}

export function softPadPreviewSignature(model: SoftPadPreviewModel): string {
  return (
    model.sig ||
    `${model.mappingId}\0${model.hidden}\0${model.clear}\0${model.force}\0${model.skipPaint}\0${model.view}\0${model.epoch}`
  );
}

export function getSelectedSoftPadMappingForPreview(): unknown {
  const api = legacyHub();
  if (typeof api.getSelectedSoftPadMappingForPreview === 'function') {
    try {
      return api.getSelectedSoftPadMappingForPreview();
    } catch (err) {
      console.error('[islands] getSelectedSoftPadMappingForPreview failed', err);
      return null;
    }
  }
  return null;
}

export function paintSoftPadPreviewTarget(
  paintEl: HTMLElement,
  mapping: unknown,
  opts?: { forceFull?: boolean }
): void {
  const pad = legacyPad();
  if (typeof pad.renderSoftPadPreview !== 'function') return;
  try {
    pad.renderSoftPadPreview(paintEl, mapping, opts);
  } catch (err) {
    console.error('[islands] renderSoftPadPreview failed', err);
  }
}
