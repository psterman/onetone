// Toast 反向桥单测：OneToneUi.toast → OneToneAppToast，不 pushToast（禁止双弹）。
// 静态查源文件（不扫压缩 bundle）；运行时 mock show + 断言 getToasts().length === 0。
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const esbuild = require('esbuild');

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bridgeSrc = resolve(root, 'src-islands/shared/ui-bridge.ts');
const sharedDir = resolve(root, 'src-islands/shared');

let failed = false;
function check(name, cond) {
  if (cond) console.log('  PASS', name);
  else {
    console.error('  FAIL', name);
    failed = true;
  }
}

console.log('[toast-bridge] 静态 + 运行时校验');

// ---- 1. 静态：源文件 toast 实现不引用 pushToast，且引用 OneToneAppToast ----
const bridgeText = readFileSync(bridgeSrc, 'utf8');
const toastFnMatch = bridgeText.match(/function toast\([\s\S]*?\n\}\n/);
check('ui-bridge 含 function toast', !!toastFnMatch);
if (toastFnMatch) {
  const body = toastFnMatch[0];
  check('toast 实现引用 OneToneAppToast', body.includes('OneToneAppToast'));
  check('toast 实现不引用 pushToast', !body.includes('pushToast'));
}
check('ui-bridge 顶部不 import pushToast', !/import\s*\{[^}]*\bpushToast\b/.test(bridgeText));

// ---- 2. 运行时：同一 bundle 导出 OneToneUi + getToasts，保证同一 store 实例 ----
const entryTmp = path.join(os.tmpdir(), `toast-bridge-entry-${Date.now()}.ts`);
writeFileSync(
  entryTmp,
  [
    `export { OneToneUi } from ${JSON.stringify(bridgeSrc.replace(/\\/g, '/'))};`,
    `export { getToasts } from ${JSON.stringify(resolve(sharedDir, 'ui-store.ts').replace(/\\/g, '/'))};`,
  ].join('\n'),
);

const result = await esbuild.build({
  entryPoints: [entryTmp],
  bundle: true,
  format: 'esm',
  write: false,
  platform: 'neutral',
  logLevel: 'silent',
});
const outTmp = path.join(os.tmpdir(), `toast-bridge-${Date.now()}.mjs`);
writeFileSync(outTmp, result.outputFiles[0].text);

const g = globalThis;
g.window = g;
const showCalls = [];
g.OneToneAppToast = {
  show(message, optionsOrKind) {
    showCalls.push({ message, optionsOrKind });
  },
};

const mod = await import('file://' + outTmp);
const { OneToneUi, getToasts } = mod;

showCalls.length = 0;
OneToneUi.toast('hi');
check('string toast → show 调 1 次', showCalls.length === 1 && showCalls[0].message === 'hi');
check('string toast 后 getToasts 仍为空', getToasts().length === 0);

showCalls.length = 0;
OneToneUi.toast({ title: 't', description: 'd', variant: 'destructive', duration: 1200 });
check('opts toast → show 调 1 次', showCalls.length === 1 && showCalls[0].message === 't');
const opts = showCalls[0].optionsOrKind || {};
check('opts toast 映射 detail/type/duration', opts.detail === 'd' && opts.type === 'error' && opts.duration === 1200);
check('opts toast 后 getToasts 仍为空', getToasts().length === 0);

if (failed) {
  console.error('[toast-bridge] 有失败项');
  process.exit(1);
}
console.log('[toast-bridge] 单测通过：反向桥接不双弹。');
