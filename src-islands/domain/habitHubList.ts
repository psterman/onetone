// P12: 习惯列表岛的领域读取层。
// 单一数据源：块模型由 legacy OneToneHabitHub.buildHabitHubListModel 生成（cardView = renderCard）。

export interface HabitHubInnerBlock {
  id: string;
  html: string;
}

export interface HabitHubBlock {
  id: string;
  html?: string;
  ariaLabel?: string;
  extraClass?: string;
  dataHabitGuide?: string;
  headInner?: string;
  innerBlocks?: HabitHubInnerBlock[];
}

export interface HabitHubListModel {
  hasContent: boolean;
  blocks: HabitHubBlock[];
}

interface LegacyHabitHub {
  buildHabitHubListModel?: () => HabitHubListModel;
  afterHabitHubListCommit?: () => void;
}

function legacyHub(): LegacyHabitHub {
  return ((window as unknown as { OneToneHabitHub?: LegacyHabitHub }).OneToneHabitHub) ?? {};
}

export function habitHubListReady(): boolean {
  return typeof legacyHub().buildHabitHubListModel === 'function';
}

export function buildHabitHubBlocks(): HabitHubBlock[] {
  const hub = legacyHub();
  if (!hub.buildHabitHubListModel) return [];
  try {
    return hub.buildHabitHubListModel().blocks ?? [];
  } catch (err) {
    console.error('[islands] buildHabitHubListModel failed', err);
    return [];
  }
}

/** 块数组签名 —— 用于跳过无变化的 setState。 */
export function blocksSignature(blocks: HabitHubBlock[]): string {
  let sig = '';
  for (const b of blocks) {
    sig += b.id + '\u0001';
    if (b.innerBlocks) {
      sig += (b.headInner ?? '') + '\u0001' + (b.ariaLabel ?? '') + '\u0001' + (b.extraClass ?? '') + '\u0001' + (b.dataHabitGuide ?? '');
      for (const ib of b.innerBlocks) {
        sig += '\u0003' + ib.id + '\u0001' + ib.html;
      }
    } else {
      sig += b.html ?? '';
    }
    sig += '\u0002';
  }
  return sig;
}

export function afterHabitHubListCommit(): void {
  const hub = legacyHub();
  if (hub.afterHabitHubListCommit) {
    try {
      hub.afterHabitHubListCommit();
    } catch (err) {
      console.error('[islands] afterHabitHubListCommit failed', err);
    }
  }
}
