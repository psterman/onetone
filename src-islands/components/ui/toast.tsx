import * as React from 'react';
import { cn } from '../../lib/utils';

// P4 Toast 展示组件：零依赖（不使用 @radix-ui/react-toast）。
// 真正的状态在 src-islands/shared/ui-store.ts；本文件只负责把 toast 项渲染成 scoped 样式。
export const ToastProvider = ({ children }: { children: React.ReactNode }) => <>{children}</>;

export function ToastViewport({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'fixed bottom-0 right-0 z-[2147483647] flex max-h-screen w-full flex-col-reverse gap-2 p-4 sm:max-w-[420px]',
        className,
      )}
    />
  );
}

export const ToastRoot = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'pointer-events-auto relative flex w-full items-center justify-between gap-3 overflow-hidden rounded-md border border-border bg-background p-4 pr-8 shadow-lg',
      className,
    )}
    {...props}
  />
));
ToastRoot.displayName = 'ToastRoot';

export const ToastTitle = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('text-sm font-semibold text-foreground', className)} {...props} />
);
ToastTitle.displayName = 'ToastTitle';

export const ToastDescription = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('text-sm text-muted-foreground', className)} {...props} />
);
ToastDescription.displayName = 'ToastDescription';
