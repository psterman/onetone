import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'prototypes', 'multichannel-visual-plans', 'index.html');
assert.ok(fs.existsSync(file), 'multichannel visual prototype HTML is missing');
const html = fs.readFileSync(file, 'utf8');

for (const variant of ['通道泳道', '四象限通道场', '矩阵＋单路编排']) assert.ok(html.includes(variant), `missing ${variant}`);
for (const channel of ['语音', '按键', 'Soft Pad', '摄像头']) assert.ok(html.includes(channel), `missing ${channel}`);
for (const action of ['发起', '输入', '调整', '确认', '取消']) assert.ok(html.includes(action), `missing ${action}`);
assert.match(html, /摄像头未校准/);
assert.match(html, /data-action="select-recipe"/);
assert.match(html, /data-action="calibrate-camera"/);
assert.match(html, /prefers-reduced-motion/);
assert.doesNotMatch(html, /Lorem ipsum|href=["']#["']/);

console.log('multichannel visual plans prototype ok');
