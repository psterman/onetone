import * as React from 'react';
import { cn } from '../../lib/utils';

// P4 Dialog：零依赖实现（不依赖 @radix-ui/react-dialog，因本环境无法稳定安装）。
// API 形态刻意对齐 shadcn/ui：<Dialog open onOpenChange> + DialogHeader/Footer/Title/Description，
// 后续若接入真实 Radix，仅需替换本文件实现、调用方基本不动。
export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  className?: string;
  closeOnBackdrop?: boolean;
}

export function Dialog({
  open,
  onOpenChange,
  children,
  className,
  closeOnBackdrop = true,
}: DialogProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    document.addEventListener('keydown', onKey);
    const t = window.setTimeout(() => ref.current?.focus(), 0);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.clearTimeout(t);
    };
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onMouseDown={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) onOpenChange(false);
      }}
    >
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        className={cn(
          'relative z-50 grid w-full max-w-lg gap-4 border border-border bg-background p-6 shadow-lg rounded-lg outline-none',
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

export const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col space-y-1.5 text-left', className)} {...props} />
);
DialogHeader.displayName = 'DialogHeader';

export const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2', className)}
    {...props}
  />
);
DialogFooter.displayName = 'DialogFooter';

export const DialogTitle = ({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
  <h2 className={cn('text-lg font-semibold text-foreground', className)} {...props} />
);
DialogTitle.displayName = 'DialogTitle';

export const DialogDescription = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) => (
  <p className={cn('text-sm text-muted-foreground', className)} {...props} />
);
DialogDescription.displayName = 'DialogDescription';
