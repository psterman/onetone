// P12b-3: 录制取消条。
// 单一来源：legacy OneToneMappingRecording.buildRecordCancelBarModel。

export interface RecordCancelBarModel {
  show: boolean;
  label: string;
  mode: string;
  ipcPhase?: string;
  mappingId: string;
  sig: string;
}

interface LegacyRecording {
  buildRecordCancelBarModel?: () => RecordCancelBarModel;
  cancelDraftOrRecording?: () => void;
}

const EMPTY: RecordCancelBarModel = {
  show: false,
  label: '',
  mode: 'none',
  mappingId: '',
  sig: '',
};

function legacyRec(): LegacyRecording {
  return (
    (window as unknown as { OneToneMappingRecording?: LegacyRecording }).OneToneMappingRecording ?? {}
  );
}

export function recordCancelBarReady(): boolean {
  return typeof legacyRec().buildRecordCancelBarModel === 'function';
}

export function buildRecordCancelBarModel(): RecordCancelBarModel {
  const api = legacyRec();
  if (!api.buildRecordCancelBarModel) return EMPTY;
  try {
    return api.buildRecordCancelBarModel();
  } catch (err) {
    console.error('[islands] buildRecordCancelBarModel failed', err);
    return EMPTY;
  }
}

export function cancelBarSignature(model: RecordCancelBarModel): string {
  return (
    model.sig ||
    `${model.mode}\0${model.ipcPhase || ''}\0${model.show}\0${model.label}\0${model.mappingId}`
  );
}

export function cancelDraftOrRecording(): void {
  const fn = legacyRec().cancelDraftOrRecording;
  if (typeof fn === 'function') fn();
}
