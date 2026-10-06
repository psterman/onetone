// 校验 v6 原型里所有 slot 的 Pad 绑定是否真实存在
// 规则：p:'AG04 · ACT12' 里的每个键，都必须能在 layout 的 slotId 映射中找到。
// 用法: node scripts/verify-home-v6-capabilities.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const layout = JSON.parse(fs.readFileSync(path.join(root, 'src/data/codex-micro-pad-layout.json'), 'utf8'));
const html = fs.readFileSync(path.join(root, 'docs/prototypes/onetone-vehicle-home-v6.html'), 'utf8');

let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('  FAIL  ' + m); } else console.log('  ok    ' + m); };

const REAL = {};
for (const c of layout.cells) if (c.defaultSlotId) (REAL[c.defaultSlotId] ||= new Set()).add(c.microKeyId);

console.log('\n[抓取 slot]');
const rows = [...html.matchAll(/\{id:'([^']*)',[^\n]*?p:'([^']*)'/g)];
ok(rows.length > 0, `抓到 ${rows.length} 条 slot`);

const seen = new Map();
for (const [, id, pad] of rows) {
  const keys = pad.split('·').map(s => s.trim());
  const real = REAL[id];
  if (!real) { fail++; console.log(`  FAIL  slotId "${id}" 不存在于真实布局`); continue; }
  const bad = keys.filter(k => !real.has(k));
  ok(bad.length === 0, bad.length
    ? `${id} 的 Pad 键 ${bad.join('/')} 虚构（真实只有 ${[...real].join('/')}）`
    : `${id} → ${keys.join('/')} 均真实`);
  seen.set(id, (seen.get(id) || 0) + 1);
}

console.log('\n[覆盖度]');
ok(seen.size >= 6, `覆盖 ${seen.size} 个真实 slotId：${[...seen.keys()].join(', ')}`);
ok(Object.keys(REAL).every(k => seen.has(k) || k === 'quickChat'),
  '除 quickChat 外，真实布局里的每个 slotId 都出现在原型中');

console.log('\n[三栏分配]');
const cols = html.match(/乘客|方向盘|发动机|目的地/g) || [];
ok(cols.includes('乘客'), '左栏标记为乘客');
ok(cols.includes('方向盘'), '中栏标记为方向盘');
ok(cols.includes('发动机'), '右栏上半为发动机');
ok(cols.includes('目的地'), '右栏下半为目的地');
ok(html.indexOf('发动机') < html.indexOf('目的地'), '发动机在目的地之上');
ok(html.includes('不会因为你选了目的地而变化'), '发动机与目的地不联动（诚实性）');

console.log('\n[诚实性约束]');
ok(!/budget-track|budget-fill/.test(html), '预算区没有比例条');
ok(html.includes('不知道分母就不画比例'), '预算给出不画比例的理由');
ok(html.includes('发送状态未知') || /<b class="unk">未知<\/b>/.test(html), '发送状态标为未知');
ok(/不可折叠/.test(html), '阻断项声明不可折叠');
ok(!/text-decoration:line-through/.test(html.split('</style>')[0]), '未用删除线表达禁用');

console.log(fail === 0 ? '\n全部通过\n' : `\n${fail} 项失败\n`);
process.exit(fail === 0 ? 0 : 1);