import {
  confirm as confirmStore,
  setCommandOpen,
  registerCommands,
  type ToastOptions,
  type ConfirmOptions,
  type CommandItem,
} from './ui-store';

// P4 宿主桥（债收口后口径）：
// - Toast：legacy OneToneAppToast 为主路径；OneToneUi.toast 反向代理过去，禁止 pushToast 双弹。
// - Confirm / Command：仍走 React 岛（Command 为脚手架，未接管 #wbCommandSearch）。
// 二次切流（正式 shadcn Toast 接管）前禁止恢复 pushToast 并行渲染。

interface LegacyAppToast {
  show(message: string, optionsOrKind?: unknown): unknown;
}

type ToastInput = ToastOptions | string;

let warnedMissingToast = false;

function normalizeToast(input: ToastInput): ToastOptions {
  if (typeof input === 'string') return { title: input };
  return input;
}

function mapVariant(variant?: ToastOptions['variant']): string {
  if (variant === 'destructive') return 'error';
  if (variant === 'success') return 'success';
  return 'default';
}

function toast(input: ToastInput): void {
  const opts = normalizeToast(input);
  const w = window as unknown as { OneToneAppToast?: LegacyAppToast };
  const show = w.OneToneAppToast?.show;
  if (typeof show !== 'function') {
    if (!warnedMissingToast) {
      warnedMissingToast = true;
      console.warn('[OneToneUi] OneToneAppToast unavailable; toast dropped');
    }
    return;
  }
  const options: Record<string, unknown> = {
    type: mapVariant(opts.variant),
  };
  if (opts.description != null) options.detail = opts.description;
  if (opts.duration != null) options.duration = opts.duration;
  show.call(w.OneToneAppToast, opts.title, options);
}

export const OneToneUi = {
  toast,
  confirm: (opts: ConfirmOptions): Promise<boolean> => confirmStore(opts),
  openCommand: (): void => setCommandOpen(true),
  closeCommand: (): void => setCommandOpen(false),
  registerCommands: (items: CommandItem[]): void => registerCommands(items),
};

export type OneToneUiApi = typeof OneToneUi;
