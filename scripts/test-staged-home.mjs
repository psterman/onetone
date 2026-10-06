import fs from 'node:fs';
const file=new URL('../docs/prototypes/onetone-staged-home.html',import.meta.url);
if(!fs.existsSync(file)){console.error('FAIL missing prototype');process.exit(1)}
const html=fs.readFileSync(file,'utf8');
const checks=[
 ['明确状态机',/EMPTY[\s\S]*COLLECTING[\s\S]*ASSEMBLED[\s\S]*CHANNEL_SELECTED[\s\S]*HANDING_OFF[\s\S]*HANDED_OFF/],
 ['初始无通道信息',/data-state="EMPTY"/],
 ['唯一主按钮',/id="mainAction"/],
 ['材料加入动作',/id="addMaterial"[\s\S]*data-add/],
 ['机械装订说明',/机械装订[\s\S]*没有使用 LLM/],
 ['装订差额明确',/还有 2 项没有带上/],
 ['通道延迟出现',/id="channelStrip"[\s\S]*hidden/],
 ['交接事实边界',/OneTone 将会[\s\S]*还需要你[\s\S]*无法确认是否发送/],
 ['返回Agent动作',/回到 Codex/],
 ['响应式和减弱动效',/@media\(max-width:\s*760px\)[\s\S]*prefers-reduced-motion/],
];let fail=0;for(const[n,r]of checks){const ok=r.test(html);console.log(`${ok?'ok  ':'FAIL'} ${n}`);if(!ok)fail++}if(fail)process.exit(1);console.log('\nAll staged home checks passed');
