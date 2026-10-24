import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const file = new URL('../docs/prototypes/onetone-thought-copilot.html', import.meta.url);
const html = readFileSync(file, 'utf8');

for (const id of [
  'modeRail',
  'contextPanel',
  'runReview',
  'reviewResults',
  'briefAdditions',
  'decisionLog',
  'modelSelect',
  'toast',
]) {
  assert.match(html, new RegExp(`id=["']${id}["']`), `missing core surface: ${id}`);
}

for (const mode of ['查漏补缺', '备选方案', '反方评审', '竞品参考', '计划审查']) {
  assert.ok(html.includes(mode), `missing review mode: ${mode}`);
}

for (const source of ['当前简报', '已选素材', '项目记忆', '当前改动', '历史决策', '联网研究']) {
  assert.ok(html.includes(source), `missing context source: ${source}`);
}

for (const action of ['采纳到简报', '交给主 Agent', '设为约束', '暂不采纳', '保存为 Skill']) {
  assert.ok(html.includes(action), `missing suggestion action: ${action}`);
}

for (const section of ['理解的目标', '隐含假设', '缺失信息', '备选路径', '风险与遗漏', '验收与回滚', '证据与置信度']) {
  assert.ok(html.includes(section), `missing structured output: ${section}`);
}

assert.match(html, /data-mode=/, 'mode switching needs explicit state hooks');
assert.match(html, /data-action=/, 'suggestion actions need explicit state hooks');
assert.match(html, /aria-live=["']polite["']/, 'dynamic feedback must be announced');
assert.match(html, /prefers-reduced-motion:\s*reduce/, 'reduced motion fallback is required');
assert.match(html, /@media\s*\(max-width:\s*900px\)/, 'compact responsive layout is required');
assert.ok(!html.includes('—'), 'visible copy must not use em dash');

console.log('thought copilot prototype contract: pass');
