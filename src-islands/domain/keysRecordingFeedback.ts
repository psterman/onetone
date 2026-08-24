// P12c-3: Keys 录制反馈条。
// 单一来源：legacy OneToneKeysPanelUi.buildKeysRecordingFeedbackModel。

export interface KeysRecordingFeedbackModel {
  mode: string;
  ipcPhase?: string;
  recording: boolean;
  hidden: boolean;
  text: string;
  conflictText: string;
  conflictHidden: boolean;
  conflictWarn: boolean;
  sig: string;
}

interface LegacyKeysPanel {
  buildKeysRecordingFeedbackModel?: () => KeysRecordingFeedbackModel;
  applyRecordingHighlightHosts?: (model: KeysRecordingFeedbackModel) => void;
}

const EMPTY: KeysRecordingFeedbackModel = {
  mode: 'none',
  recording: false,
  hidden: true,
  text: '',
  conflictText: '',
  conflictHidden: true,
  conflictWarn: false,
  sig: 'empty',
};

function legacyKeysPanel(): LegacyKeysPanel {
  return (
    (window as unknown as { OneToneKeysPanelUi?: LegacyKeysPanel }).OneToneKeysPanelUi ?? {}
  );
}

export function keysRecordingFeedbackReady(): boolean {
  return typeof legacyKeysPanel().buildKeysRecordingFeedbackModel === 'function';
}

export function buildKeysRecordingFeedbackModel(): KeysRecordingFeedbackModel {
  const api = legacyKeysPanel();
  if (!api.buildKeysRecordingFeedbackModel) return EMPTY;
  try {
    return api.buildKeysRecordingFeedbackModel();
  } catch (err) {
    console.error('[islands] buildKeysRecordingFeedbackModel failed', err);
    return EMPTY;
  }
}

export function keysRecordingFeedbackSignature(model: KeysRecordingFeedbackModel): string {
  return (
    model.sig ||
    `${model.mode}\0${model.ipcPhase || ''}\0${model.text}\0${model.conflictText}`
  );
}

export function applyKeysRecordingFeedbackHosts(model: KeysRecordingFeedbackModel): void {
  const wrap = document.getElementById('keysRecordingFeedback');
  const conflict = document.getElementById('keysRecordingConflict');
  if (!wrap) return;
  wrap.hidden = !!model.hidden;
  wrap.classList.toggle('is-trigger', model.mode === 'trigger');
  wrap.classList.toggle('is-target', model.mode === 'target' || model.mode === 'agentBinding');
  // #keysRecordingFeedbackText 由 React 渲染
  if (conflict) {
    conflict.hidden = !!model.conflictHidden;
    conflict.textContent = model.conflictText || '';
    conflict.classList.toggle('is-warn', !!model.conflictWarn);
  }
  const api = legacyKeysPanel();
  if (typeof api.applyRecordingHighlightHosts === 'function') {
    try {
      api.applyRecordingHighlightHosts(model);
    } catch (_) {}
  }
}
