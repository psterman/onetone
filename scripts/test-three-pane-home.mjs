import fs from 'node:fs';

const file = new URL('../docs/prototypes/onetone-three-pane-home.html', import.meta.url);
if (!fs.existsSync(file)) {
  console.error('FAIL missing prototype');
  process.exit(1);
}

const html = fs.readFileSync(file, 'utf8');
const checks = [
  ['三栏核心职责', />素材<[\s\S]*即时排版[\s\S]*系统能力/],
  ['单一添加入口', /id="addMaterial"[\s\S]*添加素材/],
  ['统一素材列表', /id="materialList"[\s\S]*current-home\.png[\s\S]*刚复制的一段报错/],
  ['连续草稿纸面', /contenteditable="true"[\s\S]*当前引用/],
  ['右侧展示系统通道', /系统能力[\s\S]*当前通道[\s\S]*Codex[\s\S]*换个去处/],
  ['能力与人工动作分开', /OneTone 可以[\s\S]*准确回到当前会话[\s\S]*填入草稿[\s\S]*需要你[\s\S]*上传 1 张图片[\s\S]*检查并发送/],
  ['提供保底通道', /Cursor[\s\S]*Claude Code[\s\S]*剪贴板[\s\S]*Markdown/],
  ['不强制四格填写', /自由写下你想做的事/],
  ['按需素材设置', /素材设置[\s\S]*全文[\s\S]*摘要[\s\S]*只引用/],
  ['保护边界存在', /不许修改[\s\S]*只读参考[\s\S]*保持风格/],
  ['Agent入口降级', /准备交给 Codex/],
  ['不伪造发送', /尚未发送/],
  ['响应式和减弱动效', /@media\(max-width:\s*900px\)[\s\S]*prefers-reduced-motion/],
];

let failed = 0;
for (const [name, pattern] of checks) {
  const ok = pattern.test(html);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`);
  if (!ok) failed++;
}
if (failed) process.exit(1);
console.log('\nAll three-pane home checks passed');
