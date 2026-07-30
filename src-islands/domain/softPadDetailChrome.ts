// P14g: SoftPad detail 顶栏（返回 / 标题）。
// 单一来源：legacy OneToneSoftPadHub.buildSoftPadDetailChromeModel。

export interface SoftPadDetailChromeModel {
  view: string;
  detailOpen: boolean;
  backHidden: boolean;
  backLabel: string;
  title: string;
  sig: string;
}

interface LegacySoftPadHub {
  buildSoftPadDetailChromeModel?: () => SoftPadDetailChromeModel;
  closeSubpage?: () => void;
}

const EMPTY: SoftPadDetailChromeModel = {
  view: 'hub',
  detailOpen: false,
  backHidden: true,
  backLabel: '← 返回',
  title: '',
  sig: 'empty',
};

function legacyHub(): LegacySoftPadHub {
  return (
    (window as unknown as { OneToneSoftPadHub?: LegacySoftPadHub }).OneToneSoftPadHub ?? {}
  );
}

export function softPadDetailChromeReady(): boolean {
  return typeof legacyHub().buildSoftPadDetailChromeModel === 'function';
}

export function buildSoftPadDetailChromeModel(): SoftPadDetailChromeModel {
  const api = legacyHub();
  if (!api.buildSoftPadDetailChromeModel) return EMPTY;
  try {
    return api.buildSoftPadDetailChromeModel();
  } catch (err) {
    console.error('[islands] buildSoftPadDetailChromeModel failed', err);
    return EMPTY;
  }
}

export function softPadDetailChromeSignature(model: SoftPadDetailChromeModel): string {
  return (
    model.sig ||
    `${model.view}\0${model.detailOpen}\0${model.backHidden}\0${model.title}\0${model.backLabel}`
  );
}

/** P14i: detail panel / stage / subHost 显隐（宿主不在 bar React root 内）。 */
export function applySoftPadDetailShellAttrs(model: SoftPadDetailChromeModel): void {
  const detailPanel = document.getElementById('softPadDetailPanel');
  const subHost = document.getElementById('softPadSubpageHost');
  const stage = document.getElementById('softPadHubStage');
  const open = !!model.detailOpen;
  if (detailPanel) detailPanel.hidden = !open;
  if (subHost) {
    subHost.classList.toggle('is-open', open);
    subHost.removeAttribute('hidden');
  }
  if (stage) stage.classList.toggle('is-detail-open', open);
}

export function closeSoftPadSubpage(): void {
  const api = legacyHub();
  if (typeof api.closeSubpage !== 'function') return;
  try {
    api.closeSubpage();
  } catch (err) {
    console.error('[islands] closeSubpage failed', err);
  }
}
