import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..');
const file = path.join(
  root,
  'prototypes',
  'recog-ownership-after',
  'voice-page-layout.html'
);

assert.ok(fs.existsSync(file), 'voice-page-layout prototype must exist');
const html = fs.readFileSync(file, 'utf8');

assert.match(html, /语音设置 · 布局架构/);
assert.match(html, /方案 · 新布局/);
assert.match(html, /对照 · 现状骨架/);
assert.match(html, /唤醒口令/);
assert.match(html, /命令说法/);
assert.match(html, /结束与取消/);
assert.match(html, /识别引擎/);
assert.match(html, /免按键语音/);
assert.match(html, /其它通道（只读）/);
assert.match(html, /data-plan="new"/);
assert.match(html, /data-plan="old"/);
assert.match(html, /data-rail="wake"/);
assert.match(html, /data-rail="engine"/);
assert.match(html, /L2/);
assert.match(html, /命令中枢/);

console.log('test-recog-ownership-voice-page-layout: ok');
