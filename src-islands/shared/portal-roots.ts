import { createIslandPortalRoot } from '../dom-ownership';

// P3 的 createIslandPortalRoot 在 body 下创建 .ot-island 包裹层，
// 使 Radix Dialog/Dropdown/Toast 的 portal 内容也受 scoped Tailwind 作用（避免样式逃逸）。
// 这里为各共享交互岛预建稳定 portal 根，并赋予稳定 id 供 mountIsland 挂载。
export const toastPortal = createIslandPortalRoot('toast');
toastPortal.id = 'ot-toast-root';

export const dialogPortal = createIslandPortalRoot('dialog');
dialogPortal.id = 'ot-dialog-root';

export const commandPortal = createIslandPortalRoot('command');
commandPortal.id = 'ot-command-root';

/**
 * P15a：Radix Dialog.Portal 的 container。
 * Confirm 岛 createRoot 挂在 dialogPortal（inner）；若 Portal 也挂同一节点会被 React 冲掉。
 * 因此指向 wrap.ot-island（parent），Portal 内容作为 sibling，仍在 .ot-island 作用域内。
 * 禁止回退到 document.body（会逃出 scoped Tailwind、污染 legacy）。
 */
export function getDialogPortalContainer(): HTMLElement {
  const wrap = dialogPortal.parentElement;
  if (wrap instanceof HTMLElement) return wrap;
  return dialogPortal;
}
