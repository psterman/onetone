import { createRoot, type Root } from 'react-dom/client';
import { createElement, useEffect, type ComponentType } from 'react';
import {
  OT_ISLAND_CLASS,
  OT_ISLAND_REFRESH_EVENT,
  markIslandContainer,
  unmarkIslandContainer,
  createIslandPortalRoot,
  isInsideIsland,
} from './dom-ownership';

// P3: React Island Runtime
// 统一规则：
// - React root 只挂在空容器；挂载时给容器加 .ot-island 声明所有权（见 dom-ownership.ts）
// - legacy 只能调用 updateIsland/mountIsland，不能直接写岛内部 DOM
// - panel 切走 / 抽屉关闭 -> unmountIsland（并解除所有权声明，legacy 可回收该子树）
// - mvp_init / config reload -> dispatchRefresh() 触发 refreshAll，岛重算 props 并重渲染

export type IslandProps = Record<string, unknown>;

export interface IslandOptions {
  // 在 ot:islands:refresh 事件（mvp_init / config reload 后）触发，
  // 返回要合并进 props 的新值（通常用于从 OneToneState / typed IPC 重新拉取数据）
  onRefresh?: () => IslandProps | Promise<IslandProps>;
}

interface IslandEntry {
  id: string;
  component: ComponentType<IslandProps>;
  props: IslandProps;
  root: Root;
  container: HTMLElement;
  options: IslandOptions;
}

const islands = new Map<string, IslandEntry>();

function getContainer(id: string): HTMLElement | null {
  return document.getElementById(id);
}

export function mountIsland(
  id: string,
  component: ComponentType<IslandProps>,
  props: IslandProps = {},
  options: IslandOptions = {},
): void {
  const container = getContainer(id);
  if (!container) {
    console.error('[islands] mount target not found:', id);
    return;
  }
  if (islands.has(id)) {
    updateIsland(id, props);
    return;
  }
  markIslandContainer(container); // 声明 DOM 所有权
  const root = createRoot(container);
  const entry: IslandEntry = { id, component, props, root, container, options };
  islands.set(id, entry);
  root.render(createElement(component as never, props));
}

export function updateIsland(id: string, props: IslandProps = {}): void {
  const entry = islands.get(id);
  if (!entry) return;
  entry.props = { ...entry.props, ...props };
  entry.root.render(createElement(entry.component as never, entry.props));
}

export function unmountIsland(id: string): void {
  const entry = islands.get(id);
  if (!entry) return;
  entry.root.unmount();
  unmarkIslandContainer(entry.container); // 解除所有权声明，legacy 可回收该子树
  islands.delete(id);
}

/** 判断某 id 是否已被 React 岛接管（供 legacy 守卫：岛内子树不再被 legacy 写）。 */
export function isMounted(id: string): boolean {
  return islands.has(id);
}

async function refreshEntry(entry: IslandEntry): Promise<void> {
  if (entry.options.onRefresh) {
    const extra = await entry.options.onRefresh();
    entry.props = { ...entry.props, ...extra };
  }
  entry.root.render(createElement(entry.component as never, entry.props));
}

// mvp_init / cmd_ready / config reload 后调用：刷新所有岛（重算 props + 重渲染）
export async function refreshAll(): Promise<void> {
  await Promise.all(Array.from(islands.values()).map(refreshEntry));
}

// 仅用当前 props 重渲染（不做 onRefresh）
export function remountAll(): void {
  for (const entry of islands.values()) {
    entry.root.render(createElement(entry.component as never, entry.props));
  }
}

// 供 legacy 在 applyMvpInit / render 后调用，触发所有岛刷新
export function dispatchRefresh(): void {
  document.dispatchEvent(new CustomEvent(OT_ISLAND_REFRESH_EVENT));
}

// React 组件内订阅刷新事件（用于在 mvp_init 后重新拉取 typed IPC 数据）
export function useIslandRefresh(cb: () => void | Promise<void>): void {
  useEffect(() => {
    const handler = () => {
      void cb();
    };
    document.addEventListener(OT_ISLAND_REFRESH_EVENT, handler);
    return () => document.removeEventListener(OT_ISLAND_REFRESH_EVENT, handler);
  }, [cb]);
}

// 宿主桥：暴露给 legacy（window.OneToneIslands）与后续阶段调用
export const OneToneIslands = {
  mountIsland,
  updateIsland,
  unmountIsland,
  refreshAll,
  remountAll,
  dispatchRefresh,
  isMounted,
  mounted: () => Array.from(islands.keys()),
  isInsideIsland,
  createPortalRoot: (id: string) => createIslandPortalRoot(id),
  ISLAND_CLASS: OT_ISLAND_CLASS,
  REFRESH_EVENT: OT_ISLAND_REFRESH_EVENT,
};

// 自动监听刷新事件：legacy 只需在 applyMvpInit / render 后 dispatchRefresh() 即可让所有岛重新同步
if (typeof document !== 'undefined') {
  document.addEventListener(OT_ISLAND_REFRESH_EVENT, () => {
    void refreshAll();
  });
}
