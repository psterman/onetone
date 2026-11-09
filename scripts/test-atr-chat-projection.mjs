/**
 * Chat lane busy/binding is a projection of ATR DTO — not a parallel authority.
 * Run: node scripts/test-atr-chat-projection.mjs
 */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import path from 'node:path';

const read = (p) => fs.readFileSync(p, 'utf8');

const shell = read('src/js/features/now/home-agent-v2.js');
assert.match(shell, /function projectChatAtr/);
assert.match(shell, /function syncWbChatBusyFromTask/);
assert.match(shell, /optimisticSend/);
assert.doesNotMatch(
  shell,
  /upsertChatLoopProgressTurn\(\s*Object\.assign\(\s*\{\s*\},\s*task\s*\|\|\s*\{\s*\},\s*\{\s*taskId:\s*tid,\s*status:\s*'running'\s*\}\s*\)/
);

const contractsSrc = read('src/js/features/now/run-contracts.js');
const sandbox = { console, JSON, Object, Array, String, Number, Date, Math, Error };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(contractsSrc, sandbox, { filename: 'run-contracts.js' });
const C = sandbox.OneToneRunContracts;

const wait = C.projectAtrTask({
  status: 'waiting',
  waitingReason: 'user_input',
  taskId: 't1'
});
assert.equal(wait.busy, false);
assert.equal(wait.status, 'waiting');
assert.equal(wait.pauseKind, 'user_input');

const busy = C.projectAtrTask({ status: 'repair', taskId: 't2' });
assert.equal(busy.busy, true);

const approval = C.projectAtrTask({
  status: 'waiting',
  waiting_reason: 'approval'
});
assert.equal(approval.pauseKind, 'approval');
assert.equal(C.normalizeWaitingReason('waiting_approval'), 'approval');

console.log('test-atr-chat-projection: ok');
