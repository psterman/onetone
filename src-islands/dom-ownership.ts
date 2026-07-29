// P3: DOM 所有权工具（不依赖 React，可在 node 下用 esbuild 转译后单测）
//
// 核心约定：每个 React 岛容器加 class `.ot-island`，声明「这块 DOM 子树归 React 管」。
// legacy 的 render-loop / i18n sweep 必须调用 isInsideIsland() 跳过这些子树，
// 否则会出现「React 被外层 innerHTML 毁掉 root」「岛内文案被 i18n 覆盖」等回归。

export const OT_ISLAND_CLASS = 'ot-island';
export const OT_ISLAND_REFRESH_EVENT = 'ot:islands:refresh';

/**
 * 判断节点是否位于某个 React 岛内（即 legacy 不应触碰的子树）。
 * 向上遍历祖先，遇到带 .ot-island 的祖先即判定为岛内。
 */
export function isInsideIsland(node: Node | null | undefined): boolean {
  let cur: Node | null | undefined = node;
  while (cur && cur !== document.documentElement) {
    const el = cur as { classList?: { contains?: (n: string) => boolean } };
    const cl = el.classList;
    if (cl && typeof cl.contains === 'function' && cl.contains(OT_ISLAND_CLASS)) {
      return true;
    }
    cur = cur.parentNode;
  }
  return false;
}

export function markIslandContainer(el: HTMLElement): void {
  el.classList.add(OT_ISLAND_CLASS);
}

export function unmarkIslandContainer(el: HTMLElement): void {
  el.classList.remove(OT_ISLAND_CLASS);
}

/**
 * 为需要 portal 的岛（shadcn Dialog/Dropdown/Toast）创建作用域根：
 * 一个 .ot-island 包裹层 + 内部挂载点，挂在 body 下，
 * 使 Radix portal 内容也受 scoped Tailwind（important:'.ot-island'）作用，避免样式逃逸。
 * 返回内层节点，作为 Radix Portal 的 container。
 */
export function createIslandPortalRoot(id: string): HTMLElement {
  const wrap = document.createElement('div');
  wrap.classList.add(OT_ISLAND_CLASS);
  wrap.setAttribute('data-ot-portal', id);
  wrap.style.position = 'relative';
  wrap.style.zIndex = '2147483000';
  const inner = document.createElement('div');
  inner.setAttribute('data-ot-portal-inner', id);
  wrap.appendChild(inner);
  document.body.appendChild(wrap);
  return inner;
}
