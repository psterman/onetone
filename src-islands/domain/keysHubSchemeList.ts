// P12c-4: Keys hub 方案列表。
// 单一来源：legacy OneToneKeysPanelUi.buildKeysHubSchemeListModel。

export interface KeysHubSchemeListModel {
  html: string;
  count: number;
  cardHidden: boolean;
  selected: string;
  sig: string;
}

interface LegacyKeysPanel {
  buildKeysHubSchemeListModel?: () => KeysHubSchemeListModel;
}

const EMPTY: KeysHubSchemeListModel = {
  html: '',
  count: 0,
  cardHidden: true,
  selected: '',
  sig: 'empty',
};

function legacyKeysPanel(): LegacyKeysPanel {
  return (
    (window as unknown as { OneToneKeysPanelUi?: LegacyKeysPanel }).OneToneKeysPanelUi ?? {}
  );
}

export function keysHubSchemeListReady(): boolean {
  return typeof legacyKeysPanel().buildKeysHubSchemeListModel === 'function';
}

export function buildKeysHubSchemeListModel(): KeysHubSchemeListModel {
  const api = legacyKeysPanel();
  if (!api.buildKeysHubSchemeListModel) return EMPTY;
  try {
    return api.buildKeysHubSchemeListModel();
  } catch (err) {
    console.error('[islands] buildKeysHubSchemeListModel failed', err);
    return EMPTY;
  }
}

export function keysHubSchemeListSignature(model: KeysHubSchemeListModel): string {
  return model.sig || `${model.selected}\0${model.count}\0${model.cardHidden}`;
}

export function applyKeysHubSchemeListHosts(model: KeysHubSchemeListModel): void {
  const schemeList = document.getElementById('keysHubSchemeList');
  const card = document.getElementById('keysHubCard');
  // #keysHubCount 由 React 渲染
  if (card) card.hidden = !!model.cardHidden;
  if (schemeList) schemeList.innerHTML = model.html || '';
}
