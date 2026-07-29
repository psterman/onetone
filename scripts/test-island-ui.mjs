// P4 共享交互岛状态仓库单测（纯逻辑，无 React/DOM）。
// 用 esbuild 转译 src-islands/shared/ui-store.ts 后在 node 下验证
// 单一数据源纪律：toast/confirm/command 只有这一套，不出现并行双写。
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const esbuild = require('esbuild');

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const entry = resolve(root, 'src-islands/shared/ui-store.ts');

const result = await esbuild.build({
  entryPoints: [entry],
  bundle: true,
  format: 'esm',
  write: false,
  platform: 'neutral',
  logLevel: 'silent',
});
const code = result.outputFiles[0].text;
const tmp = path.join(os.tmpdir(), `ui-store-${Date.now()}.mjs`);
writeFileSync(tmp, code);

const mod = await import('file://' + tmp);
const {
  pushToast,
  getToasts,
  dismissToast,
  removeToast,
  confirm,
  getPendingConfirm,
  resolveConfirm,
  registerCommands,
  getCommands,
  setCommandOpen,
  isCommandOpen,
} = mod;

let failed = false;
function check(name, cond) {
  if (cond) console.log('  PASS', name);
  else {
    console.error('  FAIL', name);
    failed = true;
  }
}

// ---- Toast: 单一数据源 ----
const t1 = pushToast({ title: 'saved' });
const t2 = pushToast({ title: 'warn', variant: 'destructive' });
check('pushToast 返回递增 id', typeof t1 === 'number' && t2 === t1 + 1);
check('getToasts 包含两条', getToasts().length === 2);
const toasts = getToasts();
check('variant 透传', toasts[1].variant === 'destructive');

dismissToast(t1);
check('dismiss 后 open=false', getToasts().find((t) => t.id === t1)?.open === false);
removeToast(t1);
check('remove 后只剩一条', getToasts().length === 1);

// ---- Confirm: 队列 + Promise 兑现 ----
let resolved = null;
const p = confirm({ title: 'delete?', confirmText: '删除' });
check('confirm 返回 Promise', typeof p?.then === 'function');
const pending = getPendingConfirm();
check('confirm 入队，pending 非空', pending !== null && pending.opts.title === 'delete?');
resolveConfirm(pending.id, true);
resolved = await p;
check('resolveConfirm(true) → Promise resolves true', resolved === true);
check('resolve 后队列清空', getPendingConfirm() === null);

// 第二个 confirm 走队列，cancel=false
const p2 = confirm({ title: 'again' });
const p2id = getPendingConfirm().id;
resolveConfirm(p2id, false);
check('resolveConfirm(false) → Promise resolves false', (await p2) === false);

// ---- Command ----
registerCommands([
  { id: 'a', title: '打开设置', group: 'nav', run: () => {} },
  { id: 'b', title: '重置映射', group: 'mapping', run: () => {} },
]);
check('registerCommands 注入两条', getCommands().length === 2);
check('isCommandOpen 默认 false', isCommandOpen() === false);
setCommandOpen(true);
check('setCommandOpen(true) 生效', isCommandOpen() === true);

try {
  const fs = await import('node:fs');
  fs.unlinkSync(tmp);
} catch {
  /* ignore */
}

if (failed) {
  console.error('[island-ui] 单测失败');
  process.exit(1);
}
console.log('[island-ui] 单测通过：Toast/Confirm/Command 单一数据源与队列逻辑正确。');
