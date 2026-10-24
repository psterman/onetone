import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..');
const file = path.join(
  root,
  'prototypes',
  'recog-ownership-after',
  'keys-page-layout.html'
);

assert.ok(fs.existsSync(file), 'keys-page-layout prototype must exist');
const html = fs.readFileSync(file, 'utf8');

assert.match(html, /按键设置 · 布局架构/);
assert.match(html, /方案 · 新布局/);
assert.match(html, /对照 · 现状骨架/);
assert.match(html, /触发键 · 起点/);
assert.match(html, /听写键/);
assert.match(html, /我录的键/);
assert.match(html, /应用自带/);
assert.match(html, /其它通道（只读）/);
assert.match(html, /伪六通道|六 tab|六条识别/);
assert.match(html, /data-plan="new"/);
assert.match(html, /data-plan="old"/);
assert.match(html, /命令中枢/);
assert.ok(
  html.includes('口头命令') && html.includes('strike'),
  'old skeleton must strike non-keys channels'
);

console.log('test-recog-ownership-keys-page-layout: ok');
