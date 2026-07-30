// P14h: SoftPad scope 提示文案。
// 单一来源：legacy OneToneSoftPadHub.buildSoftPadScopeHintModel。

export interface SoftPadScopeHintModel {
  text: string;
  sig: string;
}

interface LegacySoftPadHub {
  buildSoftPadScopeHintModel?: () => SoftPadScopeHintModel;
}

const EMPTY: SoftPadScopeHintModel = {
  text: '',
  sig: 'empty',
};

function legacyHub(): LegacySoftPadHub {
  return (
    (window as unknown as { OneToneSoftPadHub?: LegacySoftPadHub }).OneToneSoftPadHub ?? {}
  );
}

export function softPadScopeHintReady(): boolean {
  return typeof legacyHub().buildSoftPadScopeHintModel === 'function';
}

export function buildSoftPadScopeHintModel(): SoftPadScopeHintModel {
  const api = legacyHub();
  if (!api.buildSoftPadScopeHintModel) return EMPTY;
  try {
    return api.buildSoftPadScopeHintModel();
  } catch (err) {
    console.error('[islands] buildSoftPadScopeHintModel failed', err);
    return EMPTY;
  }
}

export function softPadScopeHintSignature(model: SoftPadScopeHintModel): string {
  return model.sig || model.text || '';
}
