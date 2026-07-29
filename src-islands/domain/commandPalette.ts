// P9a: Home workbench command palette — single catalog + filter + legacy action dispatch.
// Mirrors home-workbench-cmdk.js (10 commands, same ids/keys/behavior).

import type { CommandItem } from '../shared/ui-store';

export interface CommandDef {
  id: string;
  labelKey: string;
  hintKey?: string;
  action?: 'home' | 'test';
  panel?: string;
  debugMode?: string;
  habitWizard?: boolean;
}

/** Core navigation catalog — actions that don't belong to any settings panel.
 *  Panel-level and card-level entries are registered dynamically via registerCommands(). */
export const COMMAND_CATALOG: readonly CommandDef[] = [
  { id: 'home', labelKey: 'homeWbCmdkHome', hintKey: 'homeWbCmdkHintNav', action: 'home' },
  { id: 'test', labelKey: 'homeWbQuickTest', hintKey: 'homeWbCmdkHintAction', action: 'test' },
  {
    id: 'habit',
    labelKey: 'homeWbQuickNewHabit',
    hintKey: 'homeWbCmdkHintSettings',
    panel: 'habits',
    habitWizard: true,
  },
] as const;

export const CORE_COMMAND_IDS = new Set(COMMAND_CATALOG.map((c) => c.id));

function w(): Record<string, unknown> {
  return window as unknown as Record<string, unknown>;
}

/** Execute a catalog command via legacy globals (same paths as home-workbench-cmdk.js runItem). */
export function runCommandDef(def: CommandDef): void {
  if (def.action === 'home') {
    const drawer = w().OneToneSettingsDrawer as { close?: () => void } | undefined;
    drawer?.close?.();
    return;
  }
  if (def.action === 'test') {
    document.getElementById('wbBtnTestSend')?.click();
    return;
  }
  if (def.panel) {
    const drawer = w().OneToneSettingsDrawer as
      | { open?: (opts: Record<string, unknown>) => void }
      | undefined;
    if (!drawer?.open) return;
    const opts: Record<string, unknown> = { panel: def.panel };
    if (def.debugMode) opts.debugMode = def.debugMode;
    if (def.habitWizard) opts.habitWizard = true;
    drawer.open(opts);
  }
}

export function findCommandDef(id: string): CommandDef | undefined {
  return COMMAND_CATALOG.find((c) => c.id === id);
}

/** Build React palette items from i18n + catalog. */
export function buildCommandItems(t: (key: string) => string): CommandItem[] {
  return COMMAND_CATALOG.map((def) => ({
    id: def.id,
    title: t(def.labelKey),
    group: def.hintKey ? t(def.hintKey) : undefined,
    run: () => runCommandDef(def),
  }));
}

/** Filter palette items.
 *  Legacy 行为是整串 contains；但 P9 手动验收会输入 `语音/keys/test` 这类复合查询，
 *  因此这里按 `/` 和空白拆 token，再做 OR 匹配：任意 token 命中 title/group/id 即保留。
 */
export function filterCommands(items: CommandItem[], query: string): CommandItem[] {
  const raw = String(query || '').trim().toLowerCase();
  if (!raw) return items;

  const tokens = raw
    .split(/[\/\s]+/g)
    .map((s) => s.trim())
    .filter(Boolean);

  if (!tokens.length) return items;

  return items.filter((item) => {
    const title = item.title.toLowerCase();
    const group = (item.group || '').toLowerCase();
    const id = item.id.toLowerCase();
    const kws = (item.keywords || []).map((k) => k.toLowerCase());
    return tokens.some(
      (tok) =>
        title.includes(tok) ||
        group.includes(tok) ||
        id.includes(tok) ||
        kws.some((kw) => kw.includes(tok)),
    );
  });
}

/** Open a settings panel, scroll to a target element, and briefly highlight it. */
export function jumpAndHighlight(panel: string, targetId?: string, opts?: { debugMode?: string; habitWizard?: boolean }): void {
  const drawer = w().OneToneSettingsDrawer as
    | { open?: (o: Record<string, unknown>) => void }
    | undefined;
  if (!drawer?.open) return;
  const openOpts: Record<string, unknown> = { panel };
  if (opts?.debugMode) openOpts.debugMode = opts.debugMode;
  if (opts?.habitWizard) openOpts.habitWizard = true;
  drawer.open(openOpts);

  if (!targetId) return;
  setTimeout(() => {
    const el = document.getElementById(targetId);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('ot-highlight-flash');
    setTimeout(() => el.classList.remove('ot-highlight-flash'), 1800);
  }, 320);
}

/** Merge core catalog with externally registered extras (non-core ids only). */
export function mergeCommandItems(core: CommandItem[], extras: CommandItem[]): CommandItem[] {
  const seen = new Set(core.map((c) => c.id));
  const merged = [...core];
  for (const item of extras) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    merged.push(item);
  }
  return merged;
}
