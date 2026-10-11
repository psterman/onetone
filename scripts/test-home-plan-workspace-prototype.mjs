import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const file = new URL('../docs/prototypes/home-plan-workspace.html', import.meta.url);
const html = readFileSync(file, 'utf8');

for (const id of ['ideaInput', 'sourcePicker', 'planEditor', 'sendAgent', 'historyDrawer']) {
  assert.match(html, new RegExp(`id=["']${id}["']`), `missing core surface: ${id}`);
}

for (const workflow of ['新建功能', '修改功能', '修复问题', '验收结果']) {
  assert.ok(html.includes(workflow), `missing workflow: ${workflow}`);
}

for (const state of ['draft', 'editing', 'running', 'review']) {
  assert.ok(html.includes(`data-app-state="${state}"`), `missing lifecycle state: ${state}`);
}

assert.ok(html.includes('历史方案'), 'history entry must be visible');
assert.ok(html.includes('发送完整方案'), 'handoff must name the whole plan');
assert.ok(!html.includes('worktree'), 'engineering implementation detail leaked');
assert.ok(!html.includes('hooks'), 'engineering implementation detail leaked');

console.log('home plan workspace prototype contract: pass');
