// P13: 习惯 Hub 壳层岛领域读取层（guide / empty / sort）。
// 单一数据源：legacy OneToneHabitHub.buildHabitHubChromeModel。

export interface HabitHubEmptyModel {
  hidden: boolean;
  title: string;
  desc: string;
  newLabel: string;
}

export interface HabitHubSortOption {
  value: string;
  label: string;
}

export interface HabitHubChromeModel {
  guideHtml: string;
  empty: HabitHubEmptyModel;
  sort: { value: string; options: HabitHubSortOption[] };
  hasContent: boolean;
}

interface LegacyHabitHub {
  buildHabitHubChromeModel?: () => HabitHubChromeModel;
  afterHabitHubChromeCommit?: () => void;
}

function legacyHub(): LegacyHabitHub {
  return ((window as unknown as { OneToneHabitHub?: LegacyHabitHub }).OneToneHabitHub) ?? {};
}

export function habitHubChromeReady(): boolean {
  return typeof legacyHub().buildHabitHubChromeModel === 'function';
}

export function buildHabitHubChromeModel(): HabitHubChromeModel {
  const hub = legacyHub();
  if (!hub.buildHabitHubChromeModel) {
    return {
      guideHtml: '',
      empty: { hidden: true, title: '', desc: '', newLabel: '' },
      sort: { value: 'manual', options: [] },
      hasContent: false,
    };
  }
  try {
    return hub.buildHabitHubChromeModel();
  } catch (err) {
    console.error('[islands] buildHabitHubChromeModel failed', err);
    return {
      guideHtml: '',
      empty: { hidden: true, title: '', desc: '', newLabel: '' },
      sort: { value: 'manual', options: [] },
      hasContent: false,
    };
  }
}

export function chromeSignature(model: HabitHubChromeModel): string {
  let sig = model.guideHtml + '\u0001';
  sig += model.empty.hidden + '\u0001' + model.empty.title + '\u0001' + model.empty.desc + '\u0001' + model.empty.newLabel + '\u0002';
  sig += model.sort.value + '\u0001';
  for (const opt of model.sort.options) {
    sig += opt.value + '\u0001' + opt.label + '\u0003';
  }
  sig += '\u0002' + (model.hasContent ? '1' : '0');
  return sig;
}

export function afterHabitHubChromeCommit(): void {
  const hub = legacyHub();
  if (hub.afterHabitHubChromeCommit) {
    try {
      hub.afterHabitHubChromeCommit();
    } catch (err) {
      console.error('[islands] afterHabitHubChromeCommit failed', err);
    }
  }
}
