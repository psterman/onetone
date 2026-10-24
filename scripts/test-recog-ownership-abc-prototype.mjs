import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..');
const file = path.join(
  root,
  'prototypes',
  'recog-ownership-after',
  'abc-channel-bridge.html'
);

assert.ok(fs.existsSync(file), 'ABC comparison prototype must exist');

const html = fs.readFileSync(file, 'utf8');

assert.match(html, /id="stage"/, 'prototype must expose a full-size stage');
assert.match(html, /class="proto-picker"/, 'prototype must use the fixed picker');
assert.equal(
  (html.match(/class="proto-picker-item"/g) || []).length,
  3,
  'picker must expose exactly three architecture variants'
);
assert.match(html, /aria-label="方案 A：聚合索引"[^>]*>A<\/button>/);
assert.match(html, /aria-label="方案 B：命令中枢"[^>]*>B<\/button>/);
assert.match(html, /aria-label="方案 C：统一工作台"[^>]*>C<\/button>/);
assert.match(html, /SoftPad/);
assert.match(html, /实体按键/);
assert.match(html, /语音/);
assert.match(html, /摄像头/);
assert.match(html, /new URLSearchParams\(location\.search\)\.get\('v'\)/);
assert.match(html, /e\.key === 'ArrowRight'/);
assert.match(html, /e\.key === 'ArrowLeft'/);
assert.match(html, /prefers-reduced-motion: reduce/);
assert.match(html, /aria-current/);

console.log('test-recog-ownership-abc-prototype: ok');
