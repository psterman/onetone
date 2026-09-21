/**
 * Self-check: confidence gate + optional live Jev probe.
 *   node scripts/jev-command-router.test.js
 * Live (optional):
 *   set TYPESAFE_API_KEY=...   or  OMNIAKEY_API_KEY=...
 *   node scripts/jev-command-router.test.js --live
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  localExactMatch,
  mockJevDecide,
  decideDisposition,
  buildJevRequestBody,
  COMMANDS,
  CONFIDENCE_AUTO,
} = require('../prototypes/jev-command-router/router.js');

assert.equal(localExactMatch('命令面板')?.id, 'commandPalette');
assert.equal(localExactMatch('帮我开一下命令面板'), null, 'paraphrase must miss local exact');

{
  const ans = mockJevDecide('帮我开一下命令面板', { foreground: 'Cursor' }).answers;
  assert.equal(ans.command.choice, 'commandPalette');
  assert.ok(ans.command.confidence >= CONFIDENCE_AUTO * 0.85, 'mock should be fairly confident');
  const cmd = COMMANDS.find((c) => c.id === ans.command.choice);
  assert.equal(decideDisposition(ans, cmd), 'auto');
}

{
  const ans = mockJevDecide('发送', { dictating: true }).answers;
  const cmd = COMMANDS.find((c) => c.id === ans.command.choice);
  assert.equal(cmd?.id, 'stopOrSend');
  assert.equal(decideDisposition(ans, cmd), 'confirm', 'send must not silent-auto');
}

{
  const ans = mockJevDecide('这段代码怎么优化', {}).answers;
  const cmd = COMMANDS.find((c) => c.id === ans.command.choice);
  const d = decideDisposition(ans, cmd);
  assert.ok(d === 'ignore' || ans.command.choice === 'none', 'prose should not auto-exec');
}

console.log('ok: offline mock + gate');

const live = process.argv.includes('--live');
if (!live) {
  console.log('skip live (pass --live + API key to probe TypeSafe/OmniaKey)');
  process.exit(0);
}

const key = process.env.TYPESAFE_API_KEY || process.env.OMNIAKEY_API_KEY;
if (!key) {
  console.error('need TYPESAFE_API_KEY or OMNIAKEY_API_KEY');
  process.exit(1);
}

const useOmnia = !!process.env.OMNIAKEY_API_KEY && !process.env.TYPESAFE_API_KEY;
const url = useOmnia
  ? 'https://api.omniakey.com/v1/alpha/search'
  : 'https://api.typesafe.ai/v1/systemone';

const body = buildJevRequestBody('帮我开一下命令面板', { foreground: 'Cursor' });
const res = await fetch(url, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(body),
});
const text = await res.text();
console.log('live status', res.status, useOmnia ? 'omnia' : 'typesafe');
if (!res.ok) {
  console.error(text.slice(0, 500));
  process.exit(1);
}
let json;
try {
  json = JSON.parse(text);
} catch {
  console.error('non-json', text.slice(0, 300));
  process.exit(1);
}
const choice = json?.answers?.command?.choice ?? json?.command?.choice;
console.log('live choice', choice, 'confidence', json?.answers?.command?.confidence);
assert.ok(choice, 'expected choice in response');
console.log('ok: live Jev probe');
