/**
 * Run contract factories / asserts / scrub / interrupted coerce.
 * Run: node scripts/test-run-contracts.mjs
 */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const read = (p) => fs.readFileSync(p, 'utf8');
const sandbox = { console, setTimeout, clearTimeout, Date, Math, JSON, Error, Object, Array, String, Number, Promise };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(read('src/js/features/now/run-contracts.js'), sandbox, { filename: 'run-contracts.js' });

const C = sandbox.OneToneRunContracts;
assert.ok(C);
assert.equal(C.SCHEMA_VERSION, 1);

const run = C.createRun({ mode: 'research', originalRequest: 'q', budget: { search: 2, fetch: 2, model: 2 } });
// undefined budget fields must not wipe defaults to undefined/0 via Object.assign.
const wiped = C.createRun({
  mode: 'research',
  budget: { search: undefined, fetch: undefined, model: undefined }
});
assert.equal(wiped.budget.search, 0);
assert.equal(wiped.budget.fetch, 0);
assert.equal(wiped.budget.model, null, 'missing model budget = uncapped');
const fromCaps = C.createRun({
  mode: 'research',
  budget: { search: 3, fetch: 4, modelCalls: 3 }
});
assert.equal(fromCaps.budget.model, 3);
C.assertRun(run);
assert.ok(run.runId);
assert.ok(run.createdAt && run.updatedAt);
assert.equal(run.schemaVersion, 1);

const action = C.createAction({ toolId: 'web_search', input: { query: 'x' }, status: 'running' });
C.assertAction(action);
assert.ok(action.actionId);

const obs = C.createObservation({ actionId: action.actionId, toolId: 'web_search', ok: true, summary: 'ok' });
C.assertObservation(obs);

const call = C.createProviderCall({ providerId: 'workbuddy', purpose: 'synthesis', ok: true });
C.assertProviderCall(call);

const dirty = C.createRun({ runId: 'r-scrub' });
dirty.apiKey = 'SECRET';
dirty.providerCalls = [{
  callId: 'c1',
  providerId: 'workbuddy',
  model: 'm',
  ok: true,
  messages: [{ role: 'user', content: 'leak' }],
  prompt: 'nope',
  durationMs: 3
}];
const payload = C.toArchivePayload(dirty);
assert.equal(payload.apiKey, undefined);
assert.equal(payload.providerCalls[0].messages, undefined);
assert.equal(payload.providerCalls[0].prompt, undefined);
assert.equal(payload.providerCalls[0].providerId, 'workbuddy');

const scrubbed = C.scrubRun(dirty);
assert.equal(scrubbed.apiKey, undefined);
assert.equal(scrubbed.providerCalls[0].providerId, 'workbuddy');

const productStatuses = [
  'waiting_approval', 'waiting_user', 'verifying', 'repair'
];
productStatuses.forEach((st) => {
  const r = C.createRun({ runId: 'r-' + st, status: st, mode: 'work' });
  C.assertRun(r);
  assert.equal(r.status, st);
});
assert.throws(
  () => C.assertRun(C.normalizeRun({ runId: 'bad', status: 'resumable', createdAt: 't', updatedAt: 't' })),
  /status=resumable|invalid_run/
);

assert.equal(C.mapAtrStatus('done'), 'completed');
assert.equal(C.mapAtrStatus('waiting'), 'waiting_approval');
assert.equal(C.mapAtrStatus('needs_input'), 'waiting_user');
assert.equal(C.mapAtrStatus('verifying'), 'verifying');
assert.equal(C.mapAtrStatus('repair'), 'repair');
assert.equal(C.mapAtrStatus('interrupted'), 'interrupted');

const live = C.createRun({ runId: 'r-live', status: 'running' });
live.actions = [C.createAction({ toolId: 'web_search', input: { query: 'a' }, status: 'running' })];
const coerced = C.coerceInterrupted(live);
assert.equal(coerced.status, 'interrupted');
assert.equal(coerced.stopReason, 'process_restart');
assert.equal(coerced.resumeAvailable, true);
assert.equal(coerced.actions[0].status, 'failed');

const migrated = C.migrateAtrTaskSlot({
  runId: 'r-mig',
  mode: 'work',
  status: 'interrupted',
  tasks: [{ taskId: 'atr', kind: 'atr', status: 'running', outputs: { taskId: 'uuid-atr' } }],
  actions: [{ actionId: 'a1', taskId: 'atr', toolId: 'atr_turn', input: {}, status: 'failed' }]
});
assert.equal(migrated.tasks[0].taskId, 'uuid-atr');
assert.equal(migrated.tasks[0].outputs.atrTaskId, 'uuid-atr');
assert.equal(migrated.actions[0].taskId, 'uuid-atr');

assert.throws(() => C.assertAction({ toolId: 'x', status: 'running' }), /actionId|invalid_action/);
assert.throws(() => C.assertRun({ schemaVersion: 1, status: 'running' }), /runId|invalid_run/);

console.log('test-run-contracts: ok');
