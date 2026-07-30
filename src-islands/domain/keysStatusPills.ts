// P12c-2: Keys 状态 pills（Trigger/Target/Finish/Cancel）。
// 单一来源：legacy OneToneHabitKeyMappingTable.buildKeysStatusPillsModel。

export interface KeysStatusPill {
  text: string;
  kind: string;
}

export interface KeysStatusPillsModel {
  trigger: KeysStatusPill;
  target: KeysStatusPill;
  cancel: KeysStatusPill;
  finish: KeysStatusPill;
  highlightStep: string;
  mappingId: string;
  sig: string;
}

interface LegacyTable {
  buildKeysStatusPillsModel?: () => KeysStatusPillsModel;
}

const EMPTY_PILL: KeysStatusPill = { text: '—', kind: 'none' };

const EMPTY: KeysStatusPillsModel = {
  trigger: EMPTY_PILL,
  target: EMPTY_PILL,
  cancel: EMPTY_PILL,
  finish: EMPTY_PILL,
  highlightStep: '',
  mappingId: '',
  sig: 'empty',
};

const PILL_IDS: Array<{ id: string; key: keyof Pick<KeysStatusPillsModel, 'trigger' | 'target' | 'cancel' | 'finish'>; row: string; step: string }> = [
  { id: 'habitKeyMapStTrigger', key: 'trigger', row: 'habitKeyMapRowTrigger', step: 'trigger' },
  { id: 'habitKeyMapStTarget', key: 'target', row: 'habitKeyMapRowTarget', step: 'target' },
  { id: 'habitKeyMapStCancel', key: 'cancel', row: 'habitKeyMapRowCancel', step: 'cancel' },
  { id: 'habitKeyMapStFinish', key: 'finish', row: 'habitKeyMapRowFinish', step: 'finish' },
];

function legacyTable(): LegacyTable {
  return (
    (window as unknown as { OneToneHabitKeyMappingTable?: LegacyTable }).OneToneHabitKeyMappingTable ??
    {}
  );
}

export function keysStatusPillsReady(): boolean {
  return typeof legacyTable().buildKeysStatusPillsModel === 'function';
}

export function buildKeysStatusPillsModel(): KeysStatusPillsModel {
  const api = legacyTable();
  if (!api.buildKeysStatusPillsModel) return EMPTY;
  try {
    return api.buildKeysStatusPillsModel();
  } catch (err) {
    console.error('[islands] buildKeysStatusPillsModel failed', err);
    return EMPTY;
  }
}

export function keysStatusPillsSignature(model: KeysStatusPillsModel): string {
  return model.sig || `${model.mappingId}\0${model.highlightStep}`;
}

export function applyKeysStatusPillsHosts(model: KeysStatusPillsModel): void {
  PILL_IDS.forEach((meta) => {
    const stEl = document.getElementById(meta.id);
    const row = document.getElementById(meta.row);
    if (!stEl) return;
    const st = model[meta.key] || EMPTY_PILL;
    stEl.textContent = st.text || '—';
    stEl.className = 'habit-flow-step-status is-' + (st.kind || 'none');
    if (row) row.classList.toggle('is-highlight', model.highlightStep === meta.step);
  });
}
