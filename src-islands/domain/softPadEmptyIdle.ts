// P14d: SoftPad 空态 / 详情 idle 双宿主。
// 单一来源：legacy OneToneSoftPadHub.buildSoftPadEmptyIdleModel。

export type SoftPadEmptyIdleMode = 'none' | 'empty' | 'prepare';

export interface SoftPadEmptyIdleModel {
  mode: SoftPadEmptyIdleMode;
  emptyHtml: string;
  emptyHidden: boolean;
  emptyTitle: string;
  emptyDesc: string;
  createCodexLabel: string;
  createClaudeLabel: string;
  prepareAppId: string;
  prepareKind: string;
  prepareTitle: string;
  prepareHint: string;
  prepareBtnLabel: string;
  idleTitle: string;
  idleSub: string;
  idleHidden: boolean;
  sig: string;
}

interface LegacySoftPadHub {
  buildSoftPadEmptyIdleModel?: () => SoftPadEmptyIdleModel;
  prepareAppFromUi?: (appId: string, kind: string) => void;
  prepareSoftPadCreateKind?: (kind: string) => void;
}

const EMPTY: SoftPadEmptyIdleModel = {
  mode: 'none',
  emptyHtml: '',
  emptyHidden: true,
  emptyTitle: '',
  emptyDesc: '',
  createCodexLabel: '',
  createClaudeLabel: '',
  prepareAppId: '',
  prepareKind: '',
  prepareTitle: '',
  prepareHint: '',
  prepareBtnLabel: '',
  idleTitle: '',
  idleSub: '',
  idleHidden: true,
  sig: 'empty',
};

function legacyHub(): LegacySoftPadHub {
  return (
    (window as unknown as { OneToneSoftPadHub?: LegacySoftPadHub }).OneToneSoftPadHub ?? {}
  );
}

export function softPadEmptyIdleReady(): boolean {
  return typeof legacyHub().buildSoftPadEmptyIdleModel === 'function';
}

export function buildSoftPadEmptyIdleModel(): SoftPadEmptyIdleModel {
  const api = legacyHub();
  if (!api.buildSoftPadEmptyIdleModel) return EMPTY;
  try {
    return api.buildSoftPadEmptyIdleModel();
  } catch (err) {
    console.error('[islands] buildSoftPadEmptyIdleModel failed', err);
    return EMPTY;
  }
}

export function softPadEmptyIdleSignature(model: SoftPadEmptyIdleModel): string {
  return (
    model.sig ||
    `${model.mode}\0${model.emptyHidden}\0${model.idleHidden}\0${model.emptyHtml}\0${model.idleTitle}\0${model.idleSub}`
  );
}

/** 创建空态 CTA：与 legacy bindEmptyCreateCtas 同路径。 */
export function prepareSoftPadCreateKind(kind: string): void {
  const api = legacyHub();
  if (typeof api.prepareSoftPadCreateKind === 'function') {
    api.prepareSoftPadCreateKind(String(kind || 'codex'));
    return;
  }
  const k = String(kind || 'codex');
  const appId = k === 'claude' ? 'claude-code' : 'codex-chat';
  if (typeof api.prepareAppFromUi === 'function') {
    api.prepareAppFromUi(appId, k);
  }
}

/** prepare 态 CTA。 */
export function prepareSoftPadApp(appId: string, kind: string): void {
  const api = legacyHub();
  if (typeof api.prepareAppFromUi === 'function') {
    api.prepareAppFromUi(String(appId || ''), String(kind || 'codex'));
  }
}
