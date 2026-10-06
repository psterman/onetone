import fs from 'node:fs';
const file=new URL('../docs/prototypes/onetone-draft-agent-drawer-home.html',import.meta.url);
if(!fs.existsSync(file)){console.error('FAIL missing prototype');process.exit(1)}
const html=fs.readFileSync(file,'utf8');
const checks=[
 ['主体是材料和阶段草稿',/class="materials"[\s\S]*class="draft-stage"[\s\S]*先把材料放进来/],
 ['首页只有轻量状态条',/id="agentStatusStrip"[\s\S]*上次工作可以继续/],
 ['Agent中心位于抽屉',/id="agentDrawer"[\s\S]*上次工作[\s\S]*当前上下文[\s\S]*Agent 名册/],
 ['保留恢复动作',/继续上次工作/],
 ['保留名册动作',/聚焦[\s\S]*继续[\s\S]*停止/],
 ['状态可切换验证',/data-agent-state="return"[\s\S]*data-agent-state="running"[\s\S]*data-agent-state="approval"/],
 ['草稿阶段主按钮',/id="mainAction"[\s\S]*完成排版/],
 ['通道不常驻主体',!/class="channel-column"|<h2>系统能力<\/h2>/.test(html)],
 ['真实边界提示',/状态信息已过期/.test(html)&&/发送需要你确认/.test(html)],
 ['响应式和减弱动效',/@media\(max-width:\s*760px\)[\s\S]*prefers-reduced-motion/],
];let fail=0;for(const[n,r]of checks){const ok=typeof r==='boolean'?r:r.test(html);console.log(`${ok?'ok  ':'FAIL'} ${n}`);if(!ok)fail++}if(fail)process.exit(1);console.log('\nAll draft-agent-drawer checks passed');
