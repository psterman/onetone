import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'docs', 'prototypes', 'onetone-context-brief-editor.html');
const html = fs.readFileSync(file, 'utf8');
let failures = 0;
const check = (value, label) => {
  console.log(`${value ? 'ok  ' : 'FAIL'} ${label}`);
  if (!value) failures += 1;
};

check(['目标', '背景', '细节', '计划'].every(word => html.includes(word)), '包含语音编程四要素');
check(html.includes('Markdown') && html.includes('工作说明'), '明确是 Markdown 工作说明');
check(html.includes('项目目录') && html.includes('参考图片') && html.includes('参考网址'), '支持路径、图片和网址');
check(html.includes('复制说明并打开') && html.includes('导出上下文包') && html.includes('直接交接'), '包含三种交接方式');
check(html.includes('需要手动上传') && html.includes('无法传递'), '明确能力降级');
check(html.includes('尚未发送') && html.includes('发送状态未知'), '不伪造交接状态');
check(html.includes('openHandoff') && html.includes('closeHandoff'), '交接预览可开关');
check(!html.includes('内部思考') && !html.includes('自动生成计划'), '不依赖大模型推断');
check(html.includes('prefers-reduced-motion'), '尊重减少动态设置');

console.log(failures ? `\n${failures} checks failed` : '\nAll context brief checks passed');
process.exit(failures ? 1 : 0);
