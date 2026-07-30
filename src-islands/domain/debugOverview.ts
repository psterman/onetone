// Debug overview chrome。
// 单一来源：legacy OneToneDebugPanel.buildDebugOverviewModel。

export interface DebugOverviewModel {
  heroCls: string;
  heroTitle: string;
  heroSub: string;
  cardsHtml: string;
  actionsHtml: string;
  sig: string;
}

interface LegacyDebug {
  buildDebugOverviewModel?: () => DebugOverviewModel;
}

const EMPTY: DebugOverviewModel = {
  heroCls: 'debug-status-hero',
  heroTitle: '—',
  heroSub: '',
  cardsHtml: '',
  actionsHtml: '',
  sig: 'empty',
};

function legacy(): LegacyDebug {
  return (window as unknown as { OneToneDebugPanel?: LegacyDebug }).OneToneDebugPanel ?? {};
}

export function debugOverviewReady(): boolean {
  return typeof legacy().buildDebugOverviewModel === 'function';
}

export function buildDebugOverviewModel(): DebugOverviewModel {
  const api = legacy();
  if (!api.buildDebugOverviewModel) return EMPTY;
  try {
    return api.buildDebugOverviewModel();
  } catch (err) {
    console.error('[islands] buildDebugOverviewModel failed', err);
    return EMPTY;
  }
}

export function debugOverviewSignature(model: DebugOverviewModel): string {
  return model.sig || `${model.heroTitle}\0${model.cardsHtml}\0${model.actionsHtml}`;
}

export function applyDebugOverviewHosts(model: DebugOverviewModel): void {
  const hero = document.getElementById('debugStatusHero');
  const heroSub = document.getElementById('debugHeroSub');
  const cards = document.getElementById('debugOverviewCards');
  const actions = document.getElementById('debugOverviewActions');
  if (hero) hero.className = model.heroCls || 'debug-status-hero';
  // #debugHeroTitle 由 React 渲染
  if (heroSub) heroSub.textContent = model.heroSub || '';
  if (cards) cards.innerHTML = model.cardsHtml || '';
  if (actions) actions.innerHTML = model.actionsHtml || '';
}
