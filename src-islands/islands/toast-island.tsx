import { useEffect, useState } from 'react';
import { ToastProvider, ToastViewport, ToastRoot, ToastTitle, ToastDescription } from '../components/ui/toast';
import { getToasts, subscribeToasts, dismissToast, removeToast, type ToastItem } from '../shared/ui-store';

function variantClass(variant?: string): string {
  if (variant === 'destructive') return 'border-destructive';
  if (variant === 'success') return 'border-primary';
  return '';
}

function ToastCard({ toast }: { toast: ToastItem }) {
  useEffect(() => {
    const id = window.setTimeout(() => {
      dismissToast(toast.id);
      window.setTimeout(() => removeToast(toast.id), 200);
    }, toast.duration);
    return () => window.clearTimeout(id);
  }, [toast.id, toast.duration]);

  return (
    <ToastRoot className={variantClass(toast.variant)}>
      <div className="grid gap-1">
        <ToastTitle>{toast.title}</ToastTitle>
        {toast.description ? <ToastDescription>{toast.description}</ToastDescription> : null}
      </div>
      <button
        type="button"
        aria-label="关闭"
        className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
        onClick={() => {
          dismissToast(toast.id);
          removeToast(toast.id);
        }}
      >
        ×
      </button>
    </ToastRoot>
  );
}

// P4 Toast 岛：订阅 ui-store 渲染所有 Toast。
// 单一数据源：只有 OneToneUi.toast() 会 push，legacy 调用点迁过来后不会与旧 toast 系统并存。
export function ToastIsland() {
  const [, force] = useState(0);
  useEffect(() => subscribeToasts(() => force((n) => n + 1)), []);

  const toasts = getToasts();
  return (
    <ToastProvider>
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} />
      ))}
      <ToastViewport />
    </ToastProvider>
  );
}
