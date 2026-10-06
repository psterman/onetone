// 首页 v3 原型状态机离线校验：把 <script> 跑在最小 DOM shim 上，逐态检查产物。
// 用法: node scripts/test-home-v3-prototype.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'docs', 'prototypes', 'onetone-simple-home-v3.html');
const html = fs.readFileSync(file, 'utf8');

const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) throw new Error('no <script> block found');
// 保留 IIFE 包裹，改为在内部尾部导出状态机，再正常执行一次
let src = m[1];
const anchor = "show(initialState());";
if (src.indexOf(anchor) < 0) throw new Error("anchor show(initialState()) not found");
src = src.replace(anchor,
  "globalThis.__states = STATES; globalThis.__show = show; globalThis.__esc = esc; " + anchor);

/* ---- minimal DOM shim ---- */
let captured = { innerHTML: '' };
const listeners = {};
const el = (id) => ({
  id, innerHTML: '', hidden: false, value: '',
  dataset: {}, style: {}, textContent: '', className: '',
  classList: {
    _s: new Set(),
    add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
    toggle(c, on) { on ? this._s.add(c) : this._s.delete(c); },
    contains(c) { return this._s.has(c); },
  },
  setAttribute() {}, getAttribute() { return null; },
  addEventListener(t, f) { (listeners[id + ':' + t] ||= []).push(f); },
});

const nodes = {
  view: el('view'),
  toast: el('toast'),
  prompt: el('prompt'),
  'data-more-panel': el('data-more-panel'),
};

globalThis.document = {
  getElementById: (id) => nodes[id] || null,
  querySelector: (sel) => (sel === '[data-more-panel]' ? nodes['data-more-panel'] : null),
  querySelectorAll: () => [
    { dataset: { state: 'busy' }, classList: el('x').classList },
    { dataset: { state: 'calm' }, classList: el('x').classList },
    { dataset: { state: 'empty' }, classList: el('x').classList },
  ],
  addEventListener: (t, f) => { (listeners['doc:' + t] ||= []).push(f); },
};
globalThis.window = { scrollTo() {} };
globalThis.location = { hash: '' };
globalThis.history = { replaceState() {} };

new Function(src)();

const show = globalThis.__show;

/* ---- checks ---- */
let fail = 0;
const ok = (cond, label) => {
  if (!cond) { fail++; console.log('  FAIL  ' + label); }
  else console.log('  ok    ' + label);
};

function render(state) {
  nodes.view.innerHTML = '';
  show(state);
  return nodes.view.innerHTML;
}

console.log('\n[busy]');
const busy = render('busy');
ok(busy.length > 2000, `产物非空 (${busy.length} bytes)`);
ok((busy.match(/class="q-row"/g) || []).length === 3, 'hero 队列 3 条');
ok(busy.indexOf('修复 voice-pilot 首页') >= 0, '包含真实工作标题');
ok(busy.indexOf('codex session') < 0, '不含占位标题 "codex session"');
ok(busy.indexOf('Agent 台账') >= 0, '台账常驻（未被 details 折叠）');
ok(busy.indexOf('voice-pilot · 分支 feat/desk') >= 0, '刚刚完成有 per-session 归因');
ok(/<button class="btn primary" data-toast="打开预览/.test(busy), '打开预览是实心主按钮');
ok(busy.indexOf('回到上一个检查点') >= 0, '有检查点回退');
ok(busy.indexOf('撤回刚才的修改') >= 0, '有可点的撤回');
ok(busy.indexOf('作用对象：<b>修复 voice-pilot 首页</b>') >= 0, '控制区写明作用对象');
ok(busy.indexOf('<details') < 0, '无 details 折叠');
ok(busy.indexOf('证据：') >= 0, '保留证据/freshness 口径');

console.log('\n[calm]');
const calm = render('calm');
ok(calm.length > 1500, `产物非空 (${calm.length} bytes)`);
ok((calm.match(/class="q-row"/g) || []).length === 0, '无待办队列行');
ok(calm.indexOf('现在没有需要你决定的事') >= 0, '英雄区为平静态');
ok(calm.indexOf('Agent 台账') >= 0, '台账仍常驻');
ok(calm.indexOf('作用对象：<b>重构官网导航层级</b>') >= 0, '控制对象随焦点切换');
ok(calm.indexOf('Agent 台账 <span class="count">· 3 个') >= 0, '平静态台账 3 个');
ok(calm.indexOf('等你确认') < 0, '平静态台账无「等你确认」');
ok(calm.indexOf('需要你</span>') < 0, '平静态台账无「需要你」状态');
ok(calm.indexOf('尚未预览') < 0, '平静态「刚刚完成」无未预览警告');
ok(calm.indexOf('✓ 已预览') >= 0, '平静态结果已确认');

console.log('\n[empty]');
const empty = render('empty');
ok(empty.length > 1000, `产物非空 (${empty.length} bytes)`);
ok(empty.indexOf('先看看你已经能做什么') >= 0, '首次使用引导');
ok(empty.indexOf('Agent 台账') >= 0, '台账仍常驻');
ok(empty.indexOf('你还想让我做什么？') >= 0, '保留下一步输入');
ok(empty.indexOf('刚刚完成') < 0, '空态不显示「刚刚完成」');
ok(empty.indexOf('class="q-row"') < 0, '空态无队列');
ok(empty.indexOf('Agent 台账 <span class="count">· 3 个') >= 0, '空态台账只有 3 个（真实检测数）');
ok(empty.indexOf('未连接') >= 0, '空态明确标注「未连接」而非假装在跑');
ok(empty.indexOf('等你确认') < 0, '空态不出现「等你确认」等在跑状态');
ok(empty.indexOf('修复 voice-pilot 首页') < 0, '空态不出现旧任务残留');

console.log('\n[nav]');
ok(/\.more-panel\[hidden\]\{display:none\}/.test(html), 'more-panel 修复存在（[hidden] 生效）');
ok((html.match(/<div class="more-panel"[^>]*hidden>/) || []).length === 1, '设置面板默认 hidden');

console.log('\n[esc]');
const esc = globalThis.__esc;
ok(esc('<img onerror=x>') === '&lt;img onerror=x&gt;', 'HTML 转义');

console.log(fail === 0 ? '\n全部通过\n' : `\n${fail} 项失败\n`);
process.exit(fail === 0 ? 0 : 1);
