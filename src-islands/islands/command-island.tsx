import { useEffect, useState } from 'react';
import * as Dialog from '../components/ui/dialog';
import { getCommands, isCommandOpen, setCommandOpen, subscribeCommand } from '../shared/ui-store';

// P4 Command 搜索岛：订阅 ui-store 的 command 列表与开关，渲染一个搜索面板。
// 打开方式：OneToneUi.openCommand()；命令由 registerCommands 注入（P5/P6/P7 可逐步注册）。
export function CommandIsland() {
  const [, force] = useState(0);
  const [query, setQuery] = useState('');
  useEffect(() => subscribeCommand(() => force((n) => n + 1)), []);

  const open = isCommandOpen();
  const q = query.trim().toLowerCase();
  const commands = getCommands().filter((c) => c.title.toLowerCase().includes(q));

  return (
    <Dialog.Dialog open={open} onOpenChange={setCommandOpen}>
      <div className="grid gap-3">
        <input
          autoFocus
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="搜索命令…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <ul className="max-h-72 overflow-auto">
          {commands.length === 0 ? (
            <li className="px-2 py-3 text-sm text-muted-foreground">无匹配命令</li>
          ) : (
            commands.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className="w-full rounded-md px-2 py-2 text-left text-sm text-foreground hover:bg-accent hover:text-accent-foreground"
                  onClick={() => {
                    c.run();
                    setCommandOpen(false);
                    setQuery('');
                  }}
                >
                  {c.title}
                  {c.group ? (
                    <span className="ml-2 text-xs text-muted-foreground">{c.group}</span>
                  ) : null}
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </Dialog.Dialog>
  );
}
