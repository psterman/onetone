import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'docs', 'prototypes', 'onetone-brief-planning-home.html');
const html = fs.readFileSync(file, 'utf8');
let failures = 0;
const check = (condition, label) => {
  console.log(`${condition ? 'ok  ' : 'FAIL'} ${label}`);
  if (!condition) failures += 1;
};

check(html.includes('自由写下') && html.includes('contenteditable="true"'), '自由文本是默认主体');
check(!html.includes('你还没有填完') && !html.includes('尚未归类'), '不制造填表焦虑');
check(html.includes('原始素材 · 只读') && html.includes('你的话'), '素材只读、用户说明可编辑');
check(html.includes('data-role') && html.includes('toggleRole'), '角色可多选');
check(html.includes('ReadOnly') && html.includes('NoTouch') && html.includes('KeepStyle'), '三种保护规则');
check(html.includes('目标上限未知') && !html.includes('/ 32k'), '未知预算上限不猜');
check(html.includes('首页方案简报 · v3') && html.includes('投递记录'), '简报持久化与同版本交付');
check(html.includes('保护范围发生变化') && html.includes('疑似违规'), '返回结果产生 Guard 提醒');
check(html.includes('用户第一句原话') && html.includes('titleSource'), '标题来源明确');
check(html.includes('prefers-reduced-motion'), '尊重减少动态设置');

console.log(failures ? `\n${failures} checks failed` : '\nAll brief planning home checks passed');
process.exit(failures ? 1 : 0);
