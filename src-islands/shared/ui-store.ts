// P4: 共享交互岛的纯状态仓库（不依赖 React/DOM，可在 node 下单测）。
// Confirm / Command 由 OneToneUi 写入本仓库，React 岛订阅渲染。
// Toast：当前阶段 OneToneUi.toast 反向代理到 legacy OneToneAppToast，不调用 pushToast；
// pushToast / Toast 岛保留供二次切流（正式 shadcn Toast 接管）使用，默认无数据。

export type ToastVariant = 'default' | 'destructive' | 'success';
export interface ToastOptions {
  title: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
}
export interface ToastItem extends ToastOptions {
  id: number;
  open: boolean;
}

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
}

export interface CommandItem {
  id: string;
  title: string;
  group?: string;
  run: () => void;
}

type Listener = () => void;

// ---------- Toast ----------
let toasts: ToastItem[] = [];
let nextId = 1;
const toastListeners = new Set<Listener>();

export function getToasts(): ToastItem[] {
  return toasts;
}
export function subscribeToasts(fn: Listener): () => void {
  toastListeners.add(fn);
  return () => toastListeners.delete(fn);
}
function emitToasts(): void {
  toastListeners.forEach((l) => l());
}

export function pushToast(opts: ToastOptions): number {
  const id = nextId++;
  toasts = [...toasts, { id, open: true, variant: 'default', duration: 4000, ...opts }];
  emitToasts();
  return id;
}
export function dismissToast(id: number): void {
  toasts = toasts.map((t) => (t.id === id ? { ...t, open: false } : t));
  emitToasts();
}
export function removeToast(id: number): void {
  toasts = toasts.filter((t) => t.id !== id);
  emitToasts();
}

// ---------- Confirm ----------
interface PendingConfirm {
  id: number;
  opts: ConfirmOptions;
  resolve: (ok: boolean) => void;
}
let confirmQueue: PendingConfirm[] = [];
const confirmListeners = new Set<Listener>();

export function getPendingConfirm(): PendingConfirm | null {
  return confirmQueue[0] ?? null;
}
export function subscribeConfirm(fn: Listener): () => void {
  confirmListeners.add(fn);
  return () => confirmListeners.delete(fn);
}
function emitConfirm(): void {
  confirmListeners.forEach((l) => l());
}

export function confirm(opts: ConfirmOptions): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const id = nextId++;
    confirmQueue = [...confirmQueue, { id, opts, resolve }];
    emitConfirm();
  });
}
export function resolveConfirm(id: number, ok: boolean): void {
  const item = confirmQueue.find((c) => c.id === id);
  if (!item) return;
  confirmQueue = confirmQueue.filter((c) => c.id !== id);
  item.resolve(ok);
  emitConfirm();
}

// ---------- Command palette ----------
let commands: CommandItem[] = [];
let commandOpen = false;
const commandListeners = new Set<Listener>();

export function getCommands(): CommandItem[] {
  return commands;
}
export function registerCommands(items: CommandItem[]): void {
  commands = [...commands, ...items];
  emitCommands();
}
export function isCommandOpen(): boolean {
  return commandOpen;
}
export function setCommandOpen(open: boolean): void {
  commandOpen = open;
  emitCommands();
}
export function subscribeCommand(fn: Listener): () => void {
  commandListeners.add(fn);
  return () => commandListeners.delete(fn);
}
function emitCommands(): void {
  commandListeners.forEach((l) => l());
}
