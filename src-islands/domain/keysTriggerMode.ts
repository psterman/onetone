// P12b-6: Keys 启动手势分段宿主。
// 单一来源：legacy OneToneKeysPanelUi.buildKeysTriggerModeModel。

export interface KeysTriggerModeModel {
  modeHtml: string;
  mappingId: string;
  triggerUi: string;
  gateOk: boolean;
  sig: string;
}

interface LegacyKeysPanel {
  buildKeysTriggerModeModel?: () => KeysTriggerModeModel;
}

const EMPTY: KeysTriggerModeModel = {
  modeHtml: '',
  mappingId: '',
  triggerUi: '',
  gateOk: false,
  sig: 'empty',
};

function legacyKeysPanel(): LegacyKeysPanel {
  return (
    (window as unknown as { OneToneKeysPanelUi?: LegacyKeysPanel }).OneToneKeysPanelUi ?? {}
  );
}

export function keysTriggerModeReady(): boolean {
  return typeof legacyKeysPanel().buildKeysTriggerModeModel === 'function';
}

export function buildKeysTriggerModeModel(): KeysTriggerModeModel {
  const api = legacyKeysPanel();
  if (!api.buildKeysTriggerModeModel) return EMPTY;
  try {
    return api.buildKeysTriggerModeModel();
  } catch (err) {
    console.error('[islands] buildKeysTriggerModeModel failed', err);
    return EMPTY;
  }
}

export function triggerModeSignature(model: KeysTriggerModeModel): string {
  return model.sig || `${model.mappingId}\0${model.triggerUi}\0${model.gateOk ? '1' : '0'}`;
}
