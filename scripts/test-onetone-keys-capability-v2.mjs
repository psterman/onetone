/**
 * Smoke: Keys prototype keeps shipped shell; interconnect tabs hand off to habit.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(
  path.join(root, 'prototypes', 'onetone-keys-capability-v2.html'),
  'utf8'
);

function check(name, cond) {
  if (!cond) {
    console.error('FAIL:', name);
    process.exitCode = 1;
    return;
  }
  console.log('ok:', name);
}

check('shipped rail: 起点 + 识别', html.includes('起点') && html.includes('识别'));
check('six recognition tabs present', ['输入法', '口头命令', '自定义快捷键', '应用快捷键', '软键盘', '手势'].every((t) => html.includes(t)));
check('IME KEEP steps 听写键 + 说完后', html.includes('听写键') && html.includes('说完后') && html.includes('开麦前对准'));
check('IME presets strip', html.includes('讯飞') && html.includes('自定义听写键'));
check('habit handoff for voice/pad/camera', html.includes('口头命令的匹配已放到习惯页') && html.includes('软键盘键位绑命令') && html.includes('手势 ↔ 命令'));
check('links habit prototype', html.includes('onetone-ia-left-nav-v2.html'));
check('custom keys keep record capability', html.includes('自定义快捷键') && html.includes('KEEP · 录键能力'));

if (process.exitCode) process.exit(process.exitCode);
console.log('onetone-keys-capability-v2 smoke passed');
