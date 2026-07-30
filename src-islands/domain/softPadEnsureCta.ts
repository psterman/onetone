// P14j: SoftPad「准备 Codex」CTA。
// 单一来源：legacy OneToneSoftPadHub.buildSoftPadEnsureCtaModel。

export interface SoftPadEnsureCtaModel {
  label: string;
  sig: string;
}

interface LegacySoftPadHub {
  buildSoftPadEnsureCtaModel?: () => SoftPadEnsureCtaModel;
  ensureCodex?: () => void;
  prepareAppFromUi?: (appId: string, kind: string) => void;
}

const EMPTY: SoftPadEnsureCtaModel = {
  label: '+ 准备 Codex 虚拟键盘',
  sig: 'empty',
};

function legacyHub(): LegacySoftPadHub {
  return (
    (window as unknown as { OneToneSoftPadHub?: LegacySoftPadHub }).OneToneSoftPadHub ?? {}
  );
}

export function softPadEnsureCtaReady(): boolean {
  return typeof legacyHub().buildSoftPadEnsureCtaModel === 'function';
}

export function buildSoftPadEnsureCtaModel(): SoftPadEnsureCtaModel {
  const api = legacyHub();
  if (!api.buildSoftPadEnsureCtaModel) return EMPTY;
  try {
    return api.buildSoftPadEnsureCtaModel();
  } catch (err) {
    console.error('[islands] buildSoftPadEnsureCtaModel failed', err);
    return EMPTY;
  }
}

export function softPadEnsureCtaSignature(model: SoftPadEnsureCtaModel): string {
  return model.sig || model.label || '';
}

export function runSoftPadEnsureCodex(): void {
  const api = legacyHub();
  if (typeof api.ensureCodex === 'function') {
    try {
      api.ensureCodex();
      return;
    } catch (err) {
      console.error('[islands] ensureCodex failed', err);
    }
  }
  if (typeof api.prepareAppFromUi === 'function') {
    try {
      api.prepareAppFromUi('codex-chat', 'codex');
    } catch (err) {
      console.error('[islands] prepareAppFromUi failed', err);
    }
  }
}
