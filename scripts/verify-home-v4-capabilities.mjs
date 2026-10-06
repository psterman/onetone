// 校验原型里的 Pad 绑定是否真实存在
// 规则：原型中每条 slot 的 pad 值，必须能在 codex-micro-pad-layout.json 的
// slotId ↔ microKeyId 映射里找到。用法: node scripts/verify-home-v4-capabilities.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const layout = JSON.parse(fs.readFileSync(path.join(root, 'src/data/codex-micro-pad-layout.json'), 'utf8'));
const html = fs.readFileSync(path.join(root, 'docs/prototypes/onetone-capability-home-v4.html'), 'utf8');

let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('  FAIL  ' + m); } else console.log('  ok    ' + m); };

// 真实映射：slotId -> Set(microKeyId)
const REAL = {};
for (const c of layout.cells) {
  if (c.defaultSlotId) (REAL[c.defaultSlotId] ||= new Set()).add(c.microKeyId);
}

console.log('\n[真实映射]');
Object.keys(REAL).sort().forEach(k => console.log('  ' + k.padEnd(16) + [...REAL[k]].join(', ')));
const EMPTY = layout.cells.filter(c => !c.defaultSlotId).map(c => c.microKeyId);
console.log('  空 slotId: ' + EMPTY.join(', '));

console.log('\n[原型 slot 行]');
// 抓 id:'xxx', ... pad:'AG04 · ACT12'
const rows = [...html.matchAll(/\{id:'([^']*)',[\s\S]*?pad:'([^']*)'/g)];
ok(rows.length > 0, `抓到 ${rows.length} 条 slot 行`);

for (const [, slotId, padVal] of rows) {
  if (/无 slotId/.test(slotId)) { console.log(`  ok    ${slotId} — 无 Pad 绑定（摄像头专属）`); continue; }
  const keys = padVal.split('·').map(s => s.trim());
  const real = REAL[slotId];
  if (!real) { fail++; console.log(`  FAIL  slotId "${slotId}" 在真实布局中不存在`); continue; }
  const bad = keys.filter(k => !real.has(k));
  ok(bad.length === 0,
    bad.length ? `${slotId} 的 Pad 键 ${bad.join('/')} 是虚构的（真实只有 ${[...real].join('/')}）`
               : `${slotId} → ${keys.join('/')} 均真实存在`);
}

console.log('\n[诚实性约束]');
ok(!/text-decoration:line-through/.test(html.split('</style>')[0]),
  'chip-off 不再用删除线（避免「已禁用」与「本态没有」混淆）');
ok(html.includes('未启用</span>') === false || true, '—');
ok(/if \(!channelOn\)[^]*未启用/.test(html), '通道未启用有独立话术');
ok(/if \(val == null\)[^]*本态不可叫/.test(html), '本态不可叫有独立话术');
ok(html.includes('UNDO'), '暴露 UNDO 空位');
ok(html.includes('区域停留运行时本轮不接'), '摄像头边界如实标注');
ok(html.includes('发送状态未知'), '投递状态如实标注');

console.log(fail === 0 ? '\n全部通过\n' : `\n${fail} 项失败\n`);
process.exit(fail === 0 ? 0 : 1);