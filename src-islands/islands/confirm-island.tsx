import { useEffect, useState } from 'react';
import * as Dialog from '../components/ui/dialog';
import { Button } from '../components/ui/button';
import { getPendingConfirm, subscribeConfirm, resolveConfirm } from '../shared/ui-store';

// P4 Confirm 岛：订阅 ui-store 的 confirm 队列，渲染单个确认 Dialog。
// 返回 Promise 由 resolveConfirm 兑现，确保 legacy 调用点可 await 结果。
export function ConfirmIsland() {
  const [, force] = useState(0);
  useEffect(() => subscribeConfirm(() => force((n) => n + 1)), []);

  const pending = getPendingConfirm();
  const open = pending !== null;

  return (
    <Dialog.Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && pending) resolveConfirm(pending.id, false);
      }}
    >
      <Dialog.DialogHeader>
        <Dialog.DialogTitle>{pending?.opts.title ?? ''}</Dialog.DialogTitle>
        {pending?.opts.description ? (
          <Dialog.DialogDescription>{pending.opts.description}</Dialog.DialogDescription>
        ) : null}
      </Dialog.DialogHeader>
      <Dialog.DialogFooter>
        <Button variant="outline" onClick={() => pending && resolveConfirm(pending.id, false)}>
          {pending?.opts.cancelText ?? '取消'}
        </Button>
        <Button
          variant={pending?.opts.destructive ? 'destructive' : 'default'}
          onClick={() => pending && resolveConfirm(pending.id, true)}
        >
          {pending?.opts.confirmText ?? '确定'}
        </Button>
      </Dialog.DialogFooter>
    </Dialog.Dialog>
  );
}
