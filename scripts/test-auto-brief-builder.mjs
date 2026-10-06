import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'docs', 'prototypes', 'onetone-auto-brief-builder.html');
const html = fs.readFileSync(file, 'utf8');
let failures = 0;
const check = (value, label) => {
  console.log(`${value ? 'ok  ' : 'FAIL'} ${label}`);
  if (!value) failures += 1;
};

check(html.includes('webkitdirectory') && html.includes('type="file"'), '真实文件与文件夹选择入口');
check(html.includes('paste') && html.includes('粘贴'), '粘贴接收能力');
check(html.includes('classifyText') && html.includes('classifyFile'), '确定性数据分类函数');
check(html.includes('未归类记录'), '不确定文字进入未归类区');
check(html.includes('按材料生成工作说明'), '一键生成入口');
check(html.includes('generateBrief') && html.includes('renderMarkdown'), '同时生成视觉文档与 Markdown');
check(html.includes('复制到剪贴板') && html.includes('交付给 Agent'), '两种明确出口');
check(html.includes('需要手动上传') && html.includes('发送状态未知'), '传递能力边界明确');
check(!html.includes('内部思考') && !html.includes('AI 自动理解'), '不伪装 LLM 能力');
check(html.includes('prefers-reduced-motion'), '尊重减少动态设置');

console.log(failures ? `\n${failures} checks failed` : '\nAll auto brief builder checks passed');
process.exit(failures ? 1 : 0);
