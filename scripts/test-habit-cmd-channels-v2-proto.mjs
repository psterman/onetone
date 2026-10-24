/**
 * Guard: habit command channel-icon + Agent five-kind prototype.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(
  join(root, 'prototypes/onetone-habit-cmd-channels-v2.html'),
  'utf8'
);

assert.match(html, /通道图标 v2/);
assert.match(html, /Agent 五颗粒 · 通道纯图标/);
assert.match(html, /data-cat="agent"/);

for (const kind of ['native', 'agent', 'view', 'click', 'shortcut']) {
  assert.match(html, new RegExp(`data-kind="${kind}"`));
}

assert.match(html, /原生能力/);
assert.match(html, /Agent 能力/);
assert.match(html, /查看 \/ 指令/);
assert.match(html, /点击执行/);
assert.match(html, /快捷键/);

assert.match(html, /class="hcl-ch"/);
assert.match(html, /class="hcl-ch is-on voice"/);
assert.match(html, /class="chs"/);

assert.doesNotMatch(html, /hcl-ch-lab/);

const cmdRows = html.match(/<button[^>]*class="cmd[^"]*"[\s\S]*?<\/button>/g) ?? [];
assert.ok(cmdRows.length > 0, 'expected command rows');
for (const row of cmdRows) {
  assert.doesNotMatch(row, />口头</, 'command row chips must be icon-only');
  assert.doesNotMatch(row, />按键</, 'command row chips must be icon-only');
  assert.doesNotMatch(row, />Pad</, 'command row chips must be icon-only');
  assert.doesNotMatch(row, />手势</, 'command row chips must be icon-only');
}

assert.match(html, />口头 · Soft Pad 口令</, 'legend may show icon+text');
assert.match(html, /通道=图标；Agent=五颗粒心智/);
assert.match(html, /Before · 四色圆点/);
assert.match(html, /After · 纯图标通道/);

console.log('test-habit-cmd-channels-v2-proto: ok');
