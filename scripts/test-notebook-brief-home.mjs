import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'docs', 'prototypes', 'onetone-notebook-brief-home.html');
const html = fs.readFileSync(file, 'utf8');
let failures = 0;
const check = (condition, label) => {
  console.log(`${condition ? 'ok  ' : 'FAIL'} ${label}`);
  if (!condition) failures += 1;
};

check(!html.includes('synthesis-card') && !html.includes('应用建议并格式化') && !html.includes('生成逻辑导图'), '不假装自动综合');
check(html.includes('连续思路') && html.includes('contenteditable="true"'), '自由笔记是主工作区');
check(html.includes('用户第一句原话') && html.includes('未经总结'), '标题来自用户原话');
check(html.includes('原始素材 · 只读') && html.includes('内容指纹'), '素材只读且可追溯');
check(html.includes('你的话 · 可编辑'), '用户说明独立可编辑');
check(html.includes('data-role') && html.includes('toggleRole'), '材料角色可以多选');
check(['NoTouch', 'ReadOnly', 'KeepStyle'].every(x => html.includes(x)), '三种 Guard 均存在');
check(html.includes('目标上限未知') && !html.includes('安全范围内'), '预算不虚构安全上限');
check(html.includes('需要手动上传') && html.includes('发送状态未知'), '交付能力明确降级');
check(html.includes('疑似违规') && html.includes('保护范围发生变化'), '返回结果触发保护提醒');

console.log(failures ? `\n${failures} checks failed` : '\nAll notebook brief home checks passed');
process.exit(failures ? 1 : 0);
