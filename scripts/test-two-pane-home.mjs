import fs from 'node:fs';
const file=new URL('../docs/prototypes/onetone-two-pane-home.html',import.meta.url);
if(!fs.existsSync(file)){console.error('FAIL missing prototype');process.exit(1)}
const html=fs.readFileSync(file,'utf8');
const checks=[
 ['两栏结构',/class="materials"[\s\S]*class="workspace"/],
 ['没有常驻第三栏',!/class="right"|系统能力<\/h2>|驱动台<\/h2>/.test(html)],
 ['单一添加入口',/id="addMaterial"[\s\S]*添加素材/],
 ['编辑与交付预览',/data-view="edit"[\s\S]*data-view="preview"/],
 ['草稿可编辑',/contenteditable="true"/],
 ['底部交付条',/class="delivery-bar"[\s\S]*准备到 Codex/],
 ['按需能力抽屉',/id="deliveryDrawer"[\s\S]*OneTone 将会[\s\S]*还需要你/],
 ['保底出口',/复制草稿[\s\S]*保存 Markdown/],
 ['不伪造发送',/尚未发送/],
 ['响应式与减弱动效',/@media\(max-width:\s*760px\)[\s\S]*prefers-reduced-motion/],
];
let fail=0;for(const [n,r] of checks){const ok=typeof r==='boolean'?r:r.test(html);console.log(`${ok?'ok  ':'FAIL'} ${n}`);if(!ok)fail++}if(fail)process.exit(1);console.log('\nAll two-pane home checks passed');
