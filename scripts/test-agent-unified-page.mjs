import fs from 'node:fs';
const file=new URL('../docs/prototypes/onetone-agent-unified-page.html',import.meta.url);
if(!fs.existsSync(file)){console.error('FAIL missing prototype');process.exit(1)}
const html=fs.readFileSync(file,'utf8');
const prodPage=fs.readFileSync(new URL('../src/agent-proto/agent-page.html',import.meta.url),'utf8');
const checks=[
 ['统一五标签',/data-tab="overview"[\s\S]*data-tab="data"[\s\S]*data-tab="float"[\s\S]*data-tab="mini"[\s\S]*data-tab="pad"/],
 ['总览承载Agent Center',/Agent 总览[\s\S]*需要处理[\s\S]*正在工作[\s\S]*可以继续[\s\S]*Agent 名册/],
 ['数据保留原视角',/数据 · 效率[\s\S]*费用[\s\S]*能力[\s\S]*时长[\s\S]*灵感/],
 ['实时动作存在',/聚焦[\s\S]*继续[\s\S]*停止/],
 ['诚实能力边界',/尽力停止[\s\S]*状态信息已过期[\s\S]*发送需要你确认/],
 ['旧数据入口兼容提示',/agentData[\s\S]*Agent → 数据/],
 ['Provider筛选',/全部 Agent[\s\S]*Codex[\s\S]*Cursor[\s\S]*Claude Code/],
 ['数据范围筛选',/今天[\s\S]*本周[\s\S]*7 日[\s\S]*30 日/],
 ['其他运行表面占位',/浮窗设置[\s\S]*迷你栏设置[\s\S]*Soft Pad 设置/],
 ['响应式与减弱动效',/@media\(max-width:\s*800px\)[\s\S]*prefers-reduced-motion/],
];let fail=0;for(const[n,r]of checks){const ok=r.test(html);console.log(`${ok?'ok  ':'FAIL'} ${n}`);if(!ok)fail++}
const prodChecks=[
 ['生产页五标签',/data-sub="overview"[\s\S]*data-sub="data"[\s\S]*data-sub="float"[\s\S]*data-sub="mini"[\s\S]*data-sub="softPad"/],
 ['生产默认总览',/setSub\(allowedDeep\[deepSub\]\?deepSub:'overview'\)/],
 ['生产挂载总览',/ensureOverviewMounted/],
 ['生产五标签单行',/\.subtabs\{[^}]*grid-template-columns:repeat\(5,/],
 ['生产总览单列铺满',/\.workspace\.is-overview\{grid-template-columns:1fr\}/],
];
for(const[n,r]of prodChecks){const ok=r.test(prodPage);console.log(`${ok?'ok  ':'FAIL'} ${n}`);if(!ok)fail++}
if(fail)process.exit(1);console.log('\nAll unified Agent page checks passed');
