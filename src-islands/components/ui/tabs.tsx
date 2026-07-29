import * as React from 'react';
import { cn } from '../../lib/utils';

// P4 Tabs：零依赖实现（供 P5/P6 表单型岛分 tab 使用）。
// API 对齐 shadcn：<Tabs value onValueChange> / <TabsList> / <TabsTrigger value> / <TabsContent value>。
interface TabsCtxValue {
  value?: string;
  set: (v: string) => void;
}
const TabsCtx = React.createContext<TabsCtxValue>({ value: undefined, set: () => {} });

export interface TabsProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (v: string) => void;
  className?: string;
  children: React.ReactNode;
}

export function Tabs({ value, defaultValue, onValueChange, className, children }: TabsProps) {
  const [inner, setInner] = React.useState(defaultValue);
  const v = value ?? inner;
  const set = (nv: string) => {
    if (value === undefined) setInner(nv);
    onValueChange?.(nv);
  };
  return (
    <TabsCtx.Provider value={{ value: v, set }}>
      <div className={className}>{children}</div>
    </TabsCtx.Provider>
  );
}

export function TabsList({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({
  value,
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { value: string }) {
  const ctx = React.useContext(TabsCtx);
  const active = ctx.value === value;
  return (
    <button
      type="button"
      data-state={active ? 'active' : 'inactive'}
      onClick={() => ctx.set(value)}
      className={cn(
        'inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
        active ? 'bg-background text-foreground shadow' : '',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function TabsContent({
  value,
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { value: string }) {
  const ctx = React.useContext(TabsCtx);
  if (ctx.value !== value) return null;
  return (
    <div
      className={cn('mt-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', className)}
      {...props}
    >
      {children}
    </div>
  );
}
