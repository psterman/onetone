/**
 * Guard: habit command accordion prototype — zone-2 categories only, keep 怎么调用.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(
  join(root, 'prototypes/onetone-habit-cmd-accordion.html'),
  'utf8'
);

const cats = ['input', 'agent', 'decision', 'session', 'system'];
for (const cat of cats) {
  assert.match(html, new RegExp('data-cat="' + cat + '"'), 'accordion has ' + cat);
}

assert.match(html, /控制输入/);
assert.match(html, /控制当前 Agent/);
assert.match(html, /确认或拒绝/);
assert.match(html, /会话与状态/);
assert.match(html, /应用与界面/);

assert.match(html, /区 1 · 习惯入口/);
assert.match(html, /区 2 · 命令列表/);
assert.match(html, /区 3 · 怎么调用/);
assert.match(html, /从动作库添加/);
assert.match(html, /从已有键位添加/);
assert.match(html, /从已有口令添加/);
assert.match(html, /data-inline-channel="voice"/);
assert.match(html, /data-inline-channel="key"/);
assert.match(html, /data-inline-channel="pad"/);
assert.match(html, /data-inline-channel="camera"/);
assert.match(html, /id="inlineBindingEditor"/);
assert.match(html, /命令内容的唯一编辑位置/);
assert.match(html, /id="effectBody"/);
assert.match(html, /改说法/);
assert.match(html, /录按键/);
assert.match(html, /选 Pad 键/);
assert.match(html, /选手势/);

assert.doesNotMatch(html, /添加（来源目录）/);
assert.doesNotMatch(html, /data-mode="add"/);
assert.doesNotMatch(html, /data-pack="cursor"/);
assert.doesNotMatch(html, /只读 · 非正文编辑器/);
assert.doesNotMatch(html, /分组权威/);

console.log('ok habit-cmd-accordion-proto');
