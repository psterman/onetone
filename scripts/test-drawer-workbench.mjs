import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'docs', 'prototypes', 'onetone-drawer-workbench.html');
const html = fs.readFileSync(file, 'utf8');

let failures = 0;
function check(condition, label) {
  console.log(`${condition ? 'ok  ' : 'FAIL'} ${label}`);
  if (!condition) failures += 1;
}

check(html.includes('目标') && html.includes('背景') && html.includes('细节') && html.includes('计划'), '四要素存在');
check((html.match(/data-drawer=/g) || []).length === 6, '恰好六个抽屉把手');
check(html.includes('drawer-panel') && html.includes('aria-hidden="true"'), '抽屉默认关闭');
check(html.includes('openDrawer') && html.includes('closeDrawer'), '抽屉具有统一开关逻辑');
check(html.includes('data-bring="result"'), '结果可以拿到桌面');
check(html.includes('来源：文件系统') && html.includes('来源：Codex 通道'), '事实显示来源');
check(!html.includes('内部思考') && !html.includes('完成 70%'), '不显示虚构智能与进度');
check(html.includes('prefers-reduced-motion'), '尊重减少动态设置');

console.log(failures ? `\n${failures} checks failed` : '\nAll drawer workbench checks passed');
process.exit(failures ? 1 : 0);
