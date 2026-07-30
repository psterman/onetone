// P12b-8: Keys 启动键冲突提示。
// 单一来源：legacy OneToneKeysPanelUi.buildKeysTriggerConflictModel。

export interface KeysTriggerConflictModel {
  html: string;
  hidden: boolean;
  mappingId: string;
  msg: string;
  sig: string;
}

interface LegacyKeysPanel {
  buildKeysTriggerConflictModel?: () => KeysTriggerConflictModel;
}

const EMPTY: KeysTriggerConflictModel = {
  html: '',
  hidden: true,
  mappingId: '',
  msg: '',
  sig: 'empty',
};

function legacyKeysPanel(): LegacyKeysPanel {
  return (
    (window as unknown as { OneToneKeysPanelUi?: LegacyKeysPanel }).OneToneKeysPanelUi ?? {}
  );
}

export function keysTriggerConflictReady(): boolean {
  return typeof legacyKeysPanel().buildKeysTriggerConflictModel === 'function';
}

export function buildKeysTriggerConflictModel(): KeysTriggerConflictModel {
  const api = legacyKeysPanel();
  if (!api.buildKeysTriggerConflictModel) return EMPTY;
  try {
    return api.buildKeysTriggerConflictModel();
  } catch (err) {
    console.error('[islands] buildKeysTriggerConflictModel failed', err);
    return EMPTY;
  }
}

export function triggerConflictSignature(model: KeysTriggerConflictModel): string {
  return model.sig || `${model.mappingId}\0${model.msg}\0${model.hidden ? '1' : '0'}`;
}

export function applyKeysTriggerConflictHost(model: KeysTriggerConflictModel): void {
  const box = document.getElementById('keysTriggerConflict');
  if (box) box.hidden = !!model.hidden;
}
