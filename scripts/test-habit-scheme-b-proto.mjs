/**
 * Guard: Scheme B standalone habit directory prototype.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'prototypes/onetone-habit-scheme-b.html'), 'utf8');

assert.match(html, /方案 B · Cursor 角色目录/);
assert.match(html, /onetone-habit-scheme-b\.html/);

for (const bucket of ['talk', 'cursorKey', 'slash', 'pad', 'input']) {
  assert.match(html, new RegExp(`data-bucket="${bucket}"`));
}

assert.match(html, /对话控制/);
assert.match(html, /Cursor 快捷键/);
assert.match(html, /斜杠指令/);
assert.match(html, /Soft Pad 原生/);
assert.match(html, /Agent 模式键/);
assert.match(html, /编辑器壳/);
assert.match(html, /data-mode="b"/);
assert.match(html, /data-mode="b2"/);
assert.match(html, /class="hcl-ch"/);
assert.doesNotMatch(html, /hcl-ch-lab/);
assert.doesNotMatch(html, /app\.shortcut.*进表/);

const cmdRows = html.match(/<button[^>]*class="cmd[^"]*"[\s\S]*?<\/button>/g) ?? [];
assert.ok(cmdRows.length >= 8, 'expected scheme B command rows');
for (const row of cmdRows) {
  assert.doesNotMatch(row, />口头</);
  assert.doesNotMatch(row, />按键</);
}

console.log('test-habit-scheme-b-proto: ok');
