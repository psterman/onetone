import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..');
const file = path.join(root, 'prototypes', 'keys-chain-hero', 'clear.html');

assert.ok(fs.existsSync(file), 'clear.html must exist');
const html = fs.readFileSync(file, 'utf8');

assert.match(html, /按 → 开麦 → 说完/);
assert.match(html, /01→02→03|01 \/ 起点/);
assert.match(html, /data-view="next"/);
assert.match(html, /data-view="now"/);
assert.match(html, /方案通道/);
assert.match(html, /保留/);
assert.match(html, /新增/);
assert.match(html, /压缩/);
assert.match(html, /不动 schema|都不动 schema/);

console.log('test-keys-chain-hero-clear: ok');
