// P14b: SoftPad 工作流壳岛领域读取层（app switcher + scheme list）。

export interface SoftPadWorkflowChip {
  id: string;
  html: string;
}

export interface SoftPadWorkflowRow {
  id: string;
  html: string;
}

export interface SoftPadWorkflowModel {
  switcherHidden: boolean;
  schemeListHidden: boolean;
  switcherLabel: string;
  switcherChips: SoftPadWorkflowChip[];
  schemeTitle: string;
  schemeCount: string;
  schemeRows: SoftPadWorkflowRow[];
  emptyHtml: string;
}

interface LegacySoftPadHub {
  buildSoftPadWorkflowModel?: () => SoftPadWorkflowModel;
}

function legacyHub(): LegacySoftPadHub {
  return ((window as unknown as { OneToneSoftPadHub?: LegacySoftPadHub }).OneToneSoftPadHub) ?? {};
}

export function softPadWorkflowReady(): boolean {
  return typeof legacyHub().buildSoftPadWorkflowModel === 'function';
}

export function buildSoftPadWorkflowModel(): SoftPadWorkflowModel {
  const hub = legacyHub();
  if (!hub.buildSoftPadWorkflowModel) {
    return {
      switcherHidden: true,
      schemeListHidden: true,
      switcherLabel: '',
      switcherChips: [],
      schemeTitle: '',
      schemeCount: '0',
      schemeRows: [],
      emptyHtml: '',
    };
  }
  try {
    return hub.buildSoftPadWorkflowModel();
  } catch (err) {
    console.error('[islands] buildSoftPadWorkflowModel failed', err);
    return {
      switcherHidden: true,
      schemeListHidden: true,
      switcherLabel: '',
      switcherChips: [],
      schemeTitle: '',
      schemeCount: '0',
      schemeRows: [],
      emptyHtml: '',
    };
  }
}

export function softPadWorkflowSignature(model: SoftPadWorkflowModel): string {
  let sig = (model.switcherHidden ? '1' : '0') + (model.schemeListHidden ? '1' : '0') + '\u0001' + model.switcherLabel + '\u0002';
  for (const chip of model.switcherChips) {
    sig += chip.id + '\u0001' + chip.html + '\u0003';
  }
  sig += '\u0002' + model.schemeCount + '\u0001' + model.emptyHtml + '\u0002';
  for (const row of model.schemeRows) {
    sig += row.id + '\u0001' + row.html + '\u0003';
  }
  return sig;
}
