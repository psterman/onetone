// 校验 v7：术语是否真的下沉到技术详情，以及 Pad 键号是否真实
// 用法: node scripts/verify-home-v7-language.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const layout = JSON.parse(fs.readFileSync(path.join(root, 'src/data/codex-micro-pad-layout.json'), 'utf8'));
const html = fs.readFileSync(path.join(root, 'docs/prototypes/onetone-home-v7.html'), 'utf8');

let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('  FAIL  ' + m); } else console.log('  ok    ' + m); };

const REAL = {};
for (const c of layout.cells) if (c.defaultSlotId) (REAL[c.defaultSlotId] ||= new Set()).add(c.microKeyId);

console.log('\n[Pad 键号真实]');
const rows = [...html.matchAll(/slot:'([^']*)', pad:'([^']*)'/g)];
ok(rows.length > 0, `抓到 ${rows.length} 组 slot/pad`);
for (const [, id, pad] of rows) {
  const keys = pad.split('·').map(s => s.trim());
  const real = REAL[id];
  if (!real) { fail++; console.log(`  FAIL  slotId "${id}" 不存在`); continue; }
  const bad = keys.filter(k => !real.has(k));
  ok(bad.length === 0, bad.length
    ? `${id} → ${bad.join('/')} 虚构（真实 ${[...real].join('/')}）`
    : `${id} → ${keys.join('/')} 真实`);
}

console.log('\n[术语已从主界面下沉]');
/* 找到「技术详情」折叠块之前的部分 = 主界面 */
const main = html.split('<details class="tech">')[0];
const LEAKS = [
  ['stopOrSend', 'slotId 原名'], ['cancel', 'slotId 原名'], ['pushToTalk', 'slotId 原名'],
  ['summonCodex', 'slotId 原名'], ['AG0', 'Pad 键号'], ['ACT0', 'Pad 键号'], ['ACT1', 'Pad 键号'],
  ['指纹', '内容指纹'], ['AppChatProfile', '内部结构名'], ['引用方式', '内部术语'],
  ['不可折叠', '规格表口吻'], ['capability', '内部字段'],
];
for (const [needle, what] of LEAKS) ok(!main.includes(needle), `主界面不出现「${what}」(${needle})`);

console.log('\n[口语化落地]');
const SAY = ['你说的话', '你带的东西', '件事送不进去', '有没有发出去', '不知道',
             '不许动', '配色和文案别改', '只给路径', '摄像头没开'];
for (const s of SAY) ok(html.includes(s), `出现「${s}」`);

console.log('\n[驱动态：唯一深色主角]');
ok((html.match(/class="now[ "]/g) || []).length === 1, '只有一个 .now 深色主角块');
ok(html.includes('animation:breathe'), '状态点有呼吸动效');
ok(/STATES\s*=\s*{[\s\S]*calm:true/.test(html), '存在「没事发生」的 calm 态');
ok(html.includes('now.calm'), 'calm 态有独立样式（主角退成浅色）');

console.log('\n[四种叫法仍是并列入口]');
ok(html.includes('按这个') && html.includes('说这个') && html.includes('点这个') && html.includes('做这个'),
  '四个平级叫法：按/说/点/做');

console.log('\n[诚实性未丢]');
ok(html.includes('不知道'), '发送状态保留为「不知道」');
ok(html.includes('不知道会不会超长'), '上限未知仍保留');
ok(!/(\.fill|progress|track|percent)/i.test(html), '没有进度条/百分比容器');
ok(html.includes('OneTone 不能替你传'), '图片不能代传如实说明');
ok(html.includes('摄像头没开'), '摄像头默认关闭如实标注');

console.log(fail === 0 ? '\n全部通过\n' : `\n${fail} 项失败\n`);
process.exit(fail === 0 ? 0 : 1);