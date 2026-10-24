import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..');
const file = path.join(
  root,
  'prototypes',
  'recog-ownership-after',
  'unified-tabs.html'
);

assert.ok(fs.existsSync(file), 'unified-tabs prototype must exist');
const html = fs.readFileSync(file, 'utf8');

assert.match(html, /role="tablist"/, 'must expose channel tabs');
assert.match(html, /data-tab="pad"/);
assert.match(html, /data-tab="keys"/);
assert.match(html, /data-tab="voice"/);
assert.match(html, /核心命令/);
assert.match(html, /只读引用/);
assert.match(html, /owner-tag/);
assert.match(html, /同一页 · tab 切换/);
assert.equal(
  (html.match(/role="tab" id="tab/g) || []).length,
  3,
  'exactly three channel tabs'
);
assert.match(html, /软键盘/);
assert.match(html, /按键识别/);
assert.match(html, /语音说法/);

console.log('test-recog-ownership-unified-tabs: ok');
