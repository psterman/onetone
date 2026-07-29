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
