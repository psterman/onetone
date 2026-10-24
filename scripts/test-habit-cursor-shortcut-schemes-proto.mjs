/**
 * Guard: Cursor shortcut classification schemes prototype.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(
  join(root, 'prototypes/onetone-cursor-shortcut-schemes.html'),
  'utf8'
);

assert.match(html, /Cursor 快捷键 · 分类方案对比/);
assert.match(html, /四方案 \+ B′细分/);

for (const id of ['now', 'a', 'b', 'b2', 'c', 'd']) {
  assert.match(html, new RegExp(`data-tab="${id}"`));
  assert.match(html, new RegExp(`id="panel-${id}"`));
}

assert.match(html, /方案 B′ · 可落地细分/);
assert.match(html, /Agent 模式键/);
assert.match(html, /编辑器壳/);
assert.match(html, /cursorKeyFamily/);
assert.match(html, /Cursor 快捷键/);
assert.match(html, /斜杠指令/);
assert.match(html, /CURSOR_DEFAULT_KEY_BY_SLOT/);
assert.match(html, /app\.shortcut/);
assert.match(html, /Ctrl\+Alt\+Shift\+P/);
assert.match(html, /同一批命令 · 源数据对照/);

assert.doesNotMatch(html, /hcl-ch-lab/);

console.log('test-habit-cursor-shortcut-schemes-proto: ok');
