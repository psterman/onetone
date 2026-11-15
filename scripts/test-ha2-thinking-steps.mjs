/**
 * HA2 thinking steps: seal live CoT per ATR turn, fold history, strip --- rails.
 * Run: node scripts/test-ha2-thinking-steps.mjs
 */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const shell = read('src/js/features/now/home-agent-v2.js');
const css = read('src/css/home-agent-v2.css');

assert.match(shell, /function sanitizeThinkingDetail/);
assert.match(shell, /function sealLiveThinkingChip/);
assert.match(shell, /function maybeSealThinkingForTurn/);
assert.match(shell, /function isSealedThinkingTurnId/);
assert.match(shell, /function isEmptyThinkingHusk/);
assert.match(shell, /function isThinkingProgressOnly/);
assert.match(shell, /think_' \+ tid \+ '_s' \+ stepN/);
assert.match(shell, /maybeSealThinkingForTurn\(task\)/);
assert.match(shell, /sealLiveThinkingChip\(tid, turnForSeal\)/);
assert.match(shell, /\/\^think_\.\+_s\\d\+\$\//);
assert.match(shell, /collapsed:\s*true/);
assert.match(shell, /isThinkingProgressOnly\(detail\)/);
assert.match(
  shell,
  /function wbPageTurnsForPaint[\s\S]*?isSealedThinkingTurnId/
);
assert.match(
  shell,
  /function wbPageTurnsForPaint[\s\S]*?isEmptyThinkingHusk/
);
assert.doesNotMatch(
  shell,
  /targets\['think_' \+ tid \+ '_s/
);
// Empty live/missing body must not burn the sealed step counter.
assert.doesNotMatch(
  shell,
  /if \(!live\) \{\s*chatThinkSealedTurnByTask\[tid\] = Math\.max/
);
// Answer stream must not reopen a settled thinking chip into an empty live rail.
assert.match(
  shell,
  /collapsed !== true &&\s*\n\s*!wbStreamingText/
);
// Status lines like「正在调用 fetch_url」must not become sealed thinking chips.
assert.match(shell, /正在调用\\s\+\\S\+/);

assert.match(
  css,
  /\.ha2-wb-page-turn--thinking\.is-live:not\(\[data-ha2-has-detail="1"\]\)/
);
assert.match(css, /details\.ha2-wb-page-turn--thinking\s*\{[^}]*min-height:32px/);
assert.match(css, /details\.ha2-wb-page-turn--thinking:not\(\[open\]\)/);
assert.match(css, /isolation:\s*isolate/);

const caps = read('src/js/features/now/home-agent-capabilities.js');
assert.match(caps, /Thematic breaks paint as empty horizontal rails/);

/** Mirror of sanitizeThinkingDetail — keep in sync with home-agent-v2.js. */
function sanitizeThinkingDetail(text) {
  const lines = String(text || '').split(/\r?\n/);
  const out = [];
  let blank = 0;
  for (const line of lines) {
    if (
      /^\s*-{3,}\s*$/.test(line) ||
      /^\s*\*{3,}\s*$/.test(line) ||
      /^\s*_{3,}\s*$/.test(line)
    ) {
      continue;
    }
    if (!String(line || '').trim()) {
      blank += 1;
      if (blank > 1) continue;
      out.push('');
      continue;
    }
    blank = 0;
    out.push(line);
  }
  return out.join('\n').replace(/^\n+|\n+$/g, '');
}

const dirty = ['先想方案', '---', '再调用工具', '***', '', '', '结案'].join('\n');
const clean = sanitizeThinkingDetail(dirty);
assert.equal(clean, ['先想方案', '再调用工具', '', '结案'].join('\n'));
assert.doesNotMatch(clean, /^---$/m);
assert.doesNotMatch(clean, /^\*{3,}$/m);

/** Seal id contract: live → sealed step, live id freed for next upsert. */
function simulateSeal(turns, tid, stepN) {
  const liveId = 'think_' + tid;
  const sealedId = 'think_' + tid + '_s' + stepN;
  const live = turns.find((r) => r && r.id === liveId);
  if (!live || !String(live.detail || '').trim()) return turns;
  const sealed = {
    id: sealedId,
    toolName: 'thinking',
    text: '第 ' + stepN + ' 步',
    detail: sanitizeThinkingDetail(live.detail),
    collapsed: true,
    streaming: false
  };
  return turns
    .filter((r) => !(r && r.id === liveId))
    .concat([sealed, { id: liveId, toolName: 'thinking', detail: 'next', streaming: true, collapsed: false }]);
}

let turns = [
  {
    id: 'think_t1',
    toolName: 'thinking',
    detail: 'step1 body\n---\nmore',
    streaming: true,
    collapsed: false
  }
];
turns = simulateSeal(turns, 't1', 1);
assert.equal(turns.filter((r) => r.id === 'think_t1_s1').length, 1);
assert.equal(turns.find((r) => r.id === 'think_t1_s1').collapsed, true);
assert.doesNotMatch(turns.find((r) => r.id === 'think_t1_s1').detail, /---/);
assert.ok(turns.find((r) => r.id === 'think_t1' && r.streaming));

console.log('test-ha2-thinking-steps: ok');
