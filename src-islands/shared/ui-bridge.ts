import {
  pushToast,
  confirm as confirmStore,
  setCommandOpen,
  registerCommands,
  type ToastOptions,
  type ConfirmOptions,
  type CommandItem,
} from './ui-store';

// P4 宿主桥：暴露给 legacy 调用，让旧代码用 React 的 Toast/Confirm/Command 取代自建设施。
// 这是「唯一规范实现」——legacy 不应再自带一套并行的 toast/confirm，否则会出现两套同时弹出。
export const OneToneUi = {
  toast: (opts: ToastOptions): number => pushToast(opts),
  confirm: (opts: ConfirmOptions): Promise<boolean> => confirmStore(opts),
  openCommand: (): void => setCommandOpen(true),
  closeCommand: (): void => setCommandOpen(false),
  registerCommands: (items: CommandItem[]): void => registerCommands(items),
};

export type OneToneUiApi = typeof OneToneUi;
