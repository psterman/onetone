// P12c-5: Keys 应用上下文 strip。
// 单一来源：legacy OneToneKeysPanelUi.buildKeysAppContextStripModel。

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
  const strip = document.getElementById('keysAppContextStrip');
  const wrap = document.getElementById('keysAppContextStripWrap');
  const bindingStrip = document.getElementById('keysAppBindingStrip');
  if (!strip || !wrap) return;
  wrap.hidden = !!model.hidden;
  if (bindingStrip) bindingStrip.hidden = !!model.hidden;
  if (model.hidden) return;
  strip.innerHTML = model.html || '';
}
