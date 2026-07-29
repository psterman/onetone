// P14a: Keys 工作流 tabs 岛领域读取层。

export interface KeysWorkflowTab {
  id: string;
  html: string;
}

export interface KeysWorkflowTabsModel {
  emptyHtml: string;
  tabs: KeysWorkflowTab[];
}

interface LegacyKeysPanel {
  buildKeysWorkflowTabsModel?: () => KeysWorkflowTabsModel;
}

function legacyKeys(): LegacyKeysPanel {
  return ((window as unknown as { OneToneKeysPanelUi?: LegacyKeysPanel }).OneToneKeysPanelUi) ?? {};
}

export function keysWorkflowReady(): boolean {
  return typeof legacyKeys().buildKeysWorkflowTabsModel === 'function';
}

export function buildKeysWorkflowTabsModel(): KeysWorkflowTabsModel {
  const panel = legacyKeys();
  if (!panel.buildKeysWorkflowTabsModel) return { emptyHtml: '', tabs: [] };
  try {
    return panel.buildKeysWorkflowTabsModel();
  } catch (err) {
    console.error('[islands] buildKeysWorkflowTabsModel failed', err);
    return { emptyHtml: '', tabs: [] };
  }
}

export function workflowTabsSignature(model: KeysWorkflowTabsModel): string {
  let sig = model.emptyHtml + '\u0002';
  for (const tab of model.tabs) {
    sig += tab.id + '\u0001' + tab.html + '\u0003';
  }
  return sig;
}
