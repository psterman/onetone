import fs from 'node:fs';
const file = new URL('../docs/prototypes/onetone-three-drive-views.html', import.meta.url);
if (!fs.existsSync(file)) { console.error('FAIL missing prototype'); process.exit(1); }
const html = fs.readFileSync(file, 'utf8');
const checks = [
  ['固定三栏', /材料[\s\S]*草稿本[\s\S]*驱动台/],
  ['三种右侧视图', /data-view="drive"[\s\S]*data-view="tools"[\s\S]*data-view="route"/],
  ['驾驶视图', /目的地[\s\S]*OneTone 可以[\s\S]*需要你[\s\S]*准备到 Codex/],
  ['工具视图', /装订顺序[\s\S]*引用方式[\s\S]*输出格式[\s\S]*生成交付预览/],
  ['路线视图', /材料准备[\s\S]*草稿装订[\s\S]*通道执行[\s\S]*开始这条路线/],
  ['保底出口', /复制到剪贴板[\s\S]*保存 Markdown/],
  ['单一添加按钮', /id="addMaterial"[\s\S]*添加素材/],
  ['草稿可编辑', /contenteditable="true"/],
  ['不伪造发送', /尚未发送/],
  ['可访问动态与响应式', /aria-selected/.test(html) && /@media\(max-width:\s*900px\)[\s\S]*prefers-reduced-motion/.test(html)],
];
let failed=0;
for(const [name,rule] of checks){const ok=typeof rule==='boolean'?rule:rule.test(html);console.log(`${ok?'ok  ':'FAIL'} ${name}`);if(!ok)failed++;}
if(failed)process.exit(1);
console.log('\nAll three drive-view checks passed');
