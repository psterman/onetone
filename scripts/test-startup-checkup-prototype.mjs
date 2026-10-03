import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'prototypes', 'startup-checkup-lab', 'index.html');
assert.ok(fs.existsSync(file), 'startup checkup prototype HTML is missing');
const html = fs.readFileSync(file, 'utf8');

for (const name of ['精密仪器', '空间计算', '高级消费', '未来控制舱']) assert.ok(html.includes(name), `missing ${name}`);
for (const capability of ['麦克风', '摄像头', 'Agent', '输入框对准', '校准位置']) assert.ok(html.includes(capability), `missing ${capability}`);
for (const state of ['已达标', '待补强', '不影响核心使用']) assert.ok(html.includes(state), `missing ${state}`);
assert.match(html, /class="proto-picker"/);
assert.match(html, /prefers-reduced-motion/);
assert.match(html, /data-action="run-check"/);
assert.match(html, /data-action="calibrate"/);
for (const material of ['instrument-shell', 'spatial-shell', 'consumer-shell', 'cockpit-shell']) assert.ok(html.includes(material), `missing ${material}`);
assert.match(html, /\.dial\{mask:none\}/, 'instrument dial must not mask its central result');
assert.doesNotMatch(html, /Lorem ipsum|href=["']#["']/);

console.log('startup-checkup prototype: 4 distinct previews ok');
