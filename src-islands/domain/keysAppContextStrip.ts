// P12c-5 → habit strip：legacy OneToneKeysPanelUi.buildKeysAppContextStripModel 控制可见性。

export interface KeysAppContextStripModel {
  hidden: boolean;
  html: string;
  mappingId: string;
  contextId: string;
  sig: string;
}

interface LegacyKeysPanel {
  buildKeysAppContextStripModel?: () => KeysAppContextStripModel;
}

const EMPTY: KeysAppContextStripModel = {
  hidden: true,
  html: '',
  mappingId: '',
  contextId: '',
  sig: 'hidden',
};

function legacyKeysPanel(): LegacyKeysPanel {
  return (
    (window as unknown as { OneToneKeysPanelUi?: LegacyKeysPanel }).OneToneKeysPanelUi ?? {}
  );
}

export function keysAppContextStripReady(): boolean {
  return typeof legacyKeysPanel().buildKeysAppContextStripModel === 'function';
}

export function buildKeysAppContextStripModel(): KeysAppContextStripModel {
  const api = legacyKeysPanel();
  if (!api.buildKeysAppContextStripModel) return EMPTY;
  try {
    return api.buildKeysAppContextStripModel();
  } catch (err) {
    console.error('[islands] buildKeysAppContextStripModel failed', err);
    return EMPTY;
  }
}

export function keysAppContextStripSignature(model: KeysAppContextStripModel): string {
  return model.sig || `${model.mappingId}\0${model.contextId}\0${model.hidden}`;
}

export function applyKeysAppContextStripHosts(model: KeysAppContextStripModel): void {
  const bindingStrip = document.getElementById('keysAppBindingStrip');
  const wrap = document.getElementById('keysHabitStripWrap');
  const bar = document.getElementById('keysWorkflowTabsBar');
  if (bindingStrip) bindingStrip.hidden = !!model.hidden;
  if (wrap) wrap.hidden = !!model.hidden;
  if (bar) bar.classList.toggle('has-habit-strip', !model.hidden);
}
