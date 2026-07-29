// P3 所有权护栏单测：
// 用 esbuild 把 src-islands/dom-ownership.ts 转译为 ESM，在最小 DOM shim 下验证
// isInsideIsland / 事件常量 / portal 根作用域。运行：node scripts/test-island-runtime.mjs
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const esbuild = require('esbuild');

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const entry = resolve(root, 'src-islands/dom-ownership.ts');

const result = await esbuild.build({
  entryPoints: [entry],
  bundle: true,
  format: 'esm',
  write: false,
  platform: 'neutral',
  logLevel: 'silent',
});
const code = result.outputFiles[0].text;
const tmp = path.join(os.tmpdir(), `dom-ownership-${Date.now()}.mjs`);
writeFileSync(tmp, code);

// ---- 最小 DOM shim（仅覆盖 dom-ownership 用到的 API）----
function makeEl(tag = 'div') {
  const el = {
    tagName: tag,
    _classes: new Set(),
    classList: {
      add: (c) => el._classes.add(c),
      remove: (c) => el._classes.delete(c),
      contains: (c) => el._classes.has(c),
    },
    parentNode: null,
    setAttribute: () => {},
    style: {},
    appendChild(child) {
      child.parentNode = el;
      return child;
    },
    children: [],
  };
  return el;
}
const documentElement = makeEl('html');
const body = makeEl('body');
documentElement.appendChild(body);
globalThis.document = {
  documentElement,
  body,
  getElementById: () => null,
  createElement: (t) => makeEl(t),
  addEventListener: () => {},
  dispatchEvent: () => true,
};

const mod = await import('file://' + tmp);
const { isInsideIsland, OT_ISLAND_CLASS, OT_ISLAND_REFRESH_EVENT, createIslandPortalRoot } = mod;

let failed = false;
function check(name, cond) {
  if (cond) console.log('  PASS', name);
  else {
    console.error('  FAIL', name);
    failed = true;
  }
}

// 树：body > container(.ot-island) > inner > deep
const container = makeEl();
container.classList.add(OT_ISLAND_CLASS);
const inner = makeEl();
container.appendChild(inner);
const deep = makeEl();
inner.appendChild(deep);
body.appendChild(container);

check('isInsideIsland(deep) === true', isInsideIsland(deep) === true);
check('isInsideIsland(inner) === true', isInsideIsland(inner) === true);
check('isInsideIsland(container) === true', isInsideIsland(container) === true);
check('isInsideIsland(body) === false', isInsideIsland(body) === false);
check('OT_ISLAND_CLASS 常量 == "ot-island"', OT_ISLAND_CLASS === 'ot-island');
check('OT_ISLAND_REFRESH_EVENT 常量 == "ot:islands:refresh"', OT_ISLAND_REFRESH_EVENT === 'ot:islands:refresh');

const portal = createIslandPortalRoot('test');
check('createIslandPortalRoot 返回作用域节点（isInsideIsland=true）', isInsideIsland(portal) === true);

try {
  const fs = await import('node:fs');
  fs.unlinkSync(tmp);
} catch {
  /* ignore */
}

if (failed) {
  console.error('[island-runtime] 单测失败');
  process.exit(1);
}
console.log('[island-runtime] 单测通过：DOM 所有权护栏与刷新约定正确。');
