// P12b-1: 映射编辑器 trigger/target 只读文案。
// 单一来源：legacy OneToneMappingList.buildEditorDisplayModel。

export interface MappingEditorDisplayModel {
  triggerLabel: string;
  targetLabel: string;
  triggerRaw: string;
  targetRaw: string;
  triggerEmpty: boolean;
  targetEmpty: boolean;
  sig: string;
}

interface LegacyMappingList {
  buildEditorDisplayModel?: () => MappingEditorDisplayModel;
}

const EMPTY: MappingEditorDisplayModel = {
  triggerLabel: '',
  targetLabel: '',
  triggerRaw: '',
  targetRaw: '',
  triggerEmpty: true,
  targetEmpty: true,
  sig: '',
};

function legacyList(): LegacyMappingList {
  return ((window as unknown as { OneToneMappingList?: LegacyMappingList }).OneToneMappingList) ?? {};
}

export function mappingEditorDisplayReady(): boolean {
  return typeof legacyList().buildEditorDisplayModel === 'function';
}

export function buildMappingEditorDisplayModel(): MappingEditorDisplayModel {
  const list = legacyList();
  if (!list.buildEditorDisplayModel) return EMPTY;
  try {
    return list.buildEditorDisplayModel();
  } catch (err) {
    console.error('[islands] buildEditorDisplayModel failed', err);
    return EMPTY;
  }
}

export function displayModelSignature(model: MappingEditorDisplayModel): string {
  return model.sig || `${model.triggerLabel}\0${model.targetLabel}`;
}
