/**
 * Gate 0 — Controller ownership static + runtime traps.
 * Run: node scripts/test-controller-ownership.mjs
 */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import path from 'node:path';

const read = (p) => fs.readFileSync(p, 'utf8');
const researchSrc = read('src/js/features/now/home-research.js');
const atrSrc = read('src/js/features/now/home-agent-task.js');
const shellSrc = read('src/js/features/now/home-agent-v2.js');
const storeSrc = read('src/js/features/now/home-agent-v2-store.js');
const ctrlSrc = read('src/js/features/now/work-controller.js');
const html = read('src/index.html');

assert.match(html, /run-contracts\.js[\s\S]*run-archive\.js[\s\S]*work-controller\.js/);

// Research must not call research tool IPC directly — Controller owns executors.
assert.doesNotMatch(researchSrc, /cmd_research_web_search/);
assert.doesNotMatch(researchSrc, /cmd_research_fetch_url/);
assert.doesNotMatch(researchSrc, /beginResearchAction|finishResearchAction/);
assert.match(researchSrc, /runControllerAction|executeAction/);
assert.match(researchSrc, /retryAction/);

// ATR must not write RunArchive itself; product drive goes through Controller loop.
assert.doesNotMatch(atrSrc, /OneToneRunArchive/);
assert.match(atrSrc, /driveAtrUntilIdle/);
assert.match(atrSrc, /controller_required|work_controller_required/);
assert.match(atrSrc, /allowRawDrive/);

// UI must not call research tool IPCs (model settings probe may still exist).
assert.doesNotMatch(shellSrc, /cmd_research_web_search/);
assert.doesNotMatch(shellSrc, /cmd_research_fetch_url/);
assert.match(shellSrc, /planConfirmed:\s*true/);

// Store work path requires Controller driveAtrUntilIdle / planConfirmed.
assert.match(storeSrc, /driveAtrUntilIdle/);
assert.match(storeSrc, /planConfirmed/);
assert.match(storeSrc, /bindAtrTask/);
assert.match(ctrlSrc, /driveAtrUntilIdle/);
assert.match(ctrlSrc, /confirmPlan/);
assert.match(ctrlSrc, /plan_not_confirmed/);
assert.match(ctrlSrc, /atr_max_steps_required/);
// verifying/repair must NOT be pause statuses
assert.doesNotMatch(
  ctrlSrc,
  /var PAUSE = \{[\s\S]*verifying:\s*true/
);

// Workspace tools must not claim a fake IPC executor.
const regSrc = read('src/js/features/now/tool-registry.js');
assert.match(regSrc, /atr_internal/);
assert.doesNotMatch(regSrc, /cmd_agent_task_runtime/);
assert.match(regSrc, /inspect_diff/);
assert.match(regSrc, /request_user_input/);

// JS workspace tool ids ⊆ Rust ATR TOOL_NAMES (static parity).
const parseSrc = read('src-tauri/src/agent_task_runtime/parse.rs');
const rustTools = [
  'inspect_workspace',
  'search_code',
  'read_file',
  'propose_changes',
  'apply_patch',
  'export_to_desktop',
  'run_check',
  'inspect_diff',
  'request_user_input',
  'finish'
];
for (const id of rustTools) {
  assert.match(parseSrc, new RegExp('"' + id + '"'));
}
const jsWorkspace = [
  'inspect_workspace',
  'read_file',
  'search_code',
  'inspect_diff',
  'propose_changes',
  'apply_patch',
  'run_check',
  'export_to_desktop',
  'request_user_input',
  'finish'
];
for (const id of jsWorkspace) {
  assert.ok(rustTools.includes(id), 'parity missing rust tool for ' + id);
  assert.match(regSrc, new RegExp(id + '\\s*:'));
}

async function main() {
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    Date,
    Math,
    JSON,
    Error,
    Object,
    Array,
    String,
    Number,
    Promise,
    localStorage: {
      _d: {},
      getItem(k) { return this._d[k] || null; },
      setItem(k, v) { this._d[k] = String(v); },
      removeItem(k) { delete this._d[k]; }
    },
    sessionStorage: { getItem() { return null; }, setItem() {} }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.OneToneIpc = {
    invoke(cmd, payload) {
      const args = (payload && payload.args) || payload || {};
      if (cmd === 'cmd_research_web_search') {
        return Promise.resolve({
          ok: true,
          results: [{ title: 't', url: 'https://example.com', snippet: 's' }],
          provider: 'test'
        });
      }
      if (cmd === 'cmd_research_fetch_url') {
        return Promise.resolve({
          ok: true,
          url: args.url,
          text: 'body',
          title: 'page',
          fetchedAt: new Date().toISOString()
        });
      }
      if (cmd === 'cmd_run_archive_save') return Promise.resolve({ ok: true });
      if (cmd === 'cmd_run_archive_load') return Promise.resolve(null);
      if (cmd === 'cmd_run_archive_list') return Promise.resolve([]);
      return Promise.resolve({});
    }
  };
  vm.createContext(sandbox);
  for (const f of [
    'model-gateway.js',
    'tool-registry.js',
    'run-contracts.js',
    'run-archive.js',
    'work-controller.js'
  ]) {
    vm.runInContext(read(path.join('src/js/features/now', f)), sandbox, { filename: f });
  }

  const Controller = sandbox.OneToneWorkController;
  const Contracts = sandbox.OneToneRunContracts;
  const c = Controller.create({
    runId: 'own-1',
    mode: 'research',
    budget: { search: 2, fetch: 2, model: 2 },
    skipArchiveLoad: true,
    invoke(cmd, args) {
      return sandbox.OneToneIpc.invoke(cmd, { args: args || {} });
    }
  });

  assert.equal(c.snapshot().actions.length, 0);
  const res = await c.executeAction({
    toolId: 'web_search',
    input: { query: 'hello', limit: 3 },
    taskId: 'search'
  });
  assert.equal(res.ok, true);
  const snap = c.snapshot();
  assert.equal(snap.actions.length, 1);
  assert.ok(snap.actions[0].actionId);
  assert.equal(snap.actions[0].status, 'completed');
  assert.equal(snap.observations.length, 1);
  assert.ok(snap.budget.search <= 1);

  const c2 = Controller.create({
    runId: 'own-2',
    mode: 'research',
    budget: { model: 2 },
    skipArchiveLoad: true,
    invoke() {
      return new Promise(function () {});
    }
  });
  const p = c2.executeAction({ toolId: 'network_diagnostics', input: {} });
  c2.cancel('test');
  const aid = c2.snapshot().actions[0].actionId;
  c2.actionResult({ actionId: aid, ok: true, result: { hacked: true } });
  assert.equal(c2.snapshot().status, 'cancelled');
  assert.ok(!c2.snapshot().actions.some((a) => a.result && a.result.hacked));
  await p.then(() => {}, () => {});

  // Plan hard gate: work mode without confirm rejects atr_turn.
  const gated = Controller.create({
    runId: 'own-gate',
    mode: 'work',
    budget: { model: 4 },
    skipArchiveLoad: true,
    permissions: ['*'],
    invoke() {
      return Promise.resolve({ taskId: 't1', status: 'running' });
    }
  });
  assert.equal(gated.isPlanConfirmed(), false);
  assert.equal(gated.snapshot().status, 'waiting');
  assert.equal(gated.snapshot().stopReason, 'awaiting_plan');
  const denied = await gated.stepAtr({ taskId: 't1' });
  assert.equal(denied.ok, false);
  assert.equal(denied.code, 'plan_not_confirmed');
  gated.confirmPlan({ goal: 'g' });
  assert.equal(gated.isPlanConfirmed(), true);
  assert.equal(gated.snapshot().status, 'running');

  // maxSteps !== 1 rejected
  const badSteps = gated.validateAction({
    toolId: 'atr_turn',
    input: { taskId: 't1', maxSteps: 3 },
    taskId: 't1'
  });
  assert.equal(badSteps.ok, false);
  assert.equal(badSteps.code, 'atr_max_steps_required');

  // atr_internal must not execute from FE; Task.taskId binds to ATR uuid.
  let driveCalls = 0;
  const cw = Controller.create({
    runId: 'own-work',
    mode: 'work',
    budget: { model: 4 },
    skipArchiveLoad: true,
    planConfirmed: true,
    permissions: ['*'],
    invoke(cmd, args) {
      if (cmd === 'cmd_agent_task_drive') {
        driveCalls += 1;
        assert.equal(Number(args.maxSteps), 1);
        return Promise.resolve({
          taskId: args.taskId,
          status: driveCalls === 1 ? 'verifying' : 'waiting',
          checkpointId: 'ck-1',
          providerId: 'workbuddy',
          modelId: 'm1',
          providerDurationMs: 12,
          events: [{ kind: 'tool_result', payload: { tool: 'inspect_workspace', ok: true } }]
        });
      }
      return Promise.resolve({});
    }
  });
  cw.bindAtrTask({ taskId: 't-real', status: 'running', checkpointId: 'ck-0' });
  assert.equal(cw.boundAtrTaskId(), 't-real');
  assert.ok(!cw.snapshot().tasks.some((t) => t.taskId === 'atr'));

  const loop = await cw.driveAtrUntilIdle({ taskId: 't-real', provider: 'workbuddy' });
  assert.equal(loop.ok, true);
  assert.ok(driveCalls >= 2, 'verifying must continue stepping');
  assert.ok(cw.snapshot().providerCalls.length >= 1);
  assert.equal(cw.snapshot().providerCalls[0].providerId, 'workbuddy');
  assert.ok(cw.snapshot().observations.length >= 1);
  const atrTask = cw.snapshot().tasks.find((t) => t.kind === 'atr');
  assert.equal(atrTask.taskId, 't-real');
  assert.equal(atrTask.outputs.atrTaskId, 't-real');
  assert.ok(cw.snapshot().actions.every((a) => a.toolId !== 'atr_turn' || a.taskId === 't-real'));

  // Poll historically setStatus('verifying') mid-drive; Controller must coerce back to running.
  let recoverCalls = 0;
  const recover = Controller.create({
    runId: 'own-recover',
    mode: 'work',
    budget: { model: 4 },
    skipArchiveLoad: true,
    planConfirmed: true,
    permissions: ['*'],
    invoke(cmd, args) {
      if (cmd === 'cmd_agent_task_drive') {
        recoverCalls += 1;
        return Promise.resolve({
          taskId: args.taskId,
          status: recoverCalls === 1 ? 'repair' : 'waiting',
          providerId: 'workbuddy',
          modelId: 'm1'
        });
      }
      return Promise.resolve({});
    }
  });
  recover.bindAtrTask({ taskId: 't-rec', status: 'running' });
  recover.setStatus('verifying');
  assert.equal(recover.snapshot().status, 'verifying');
  const recovered = await recover.driveAtrUntilIdle({
    taskId: 't-rec',
    provider: 'workbuddy'
  });
  assert.equal(recovered.ok, true);
  assert.ok(recoverCalls >= 2, 'must continue after verifying→running coerce');

  if (cw.continueFromPause) cw.continueFromPause('test');
  const blocked2 = await cw.executeAction({
    toolId: 'inspect_workspace',
    input: {},
    taskId: 't-real'
  });
  assert.equal(blocked2.ok, false);
  assert.equal(blocked2.code, 'atr_internal_not_executable');

  // migrate legacy atr slot
  const migrated = Contracts.migrateAtrTaskSlot({
    runId: 'm1',
    mode: 'work',
    status: 'interrupted',
    tasks: [{ taskId: 'atr', kind: 'atr', status: 'running', outputs: { taskId: 'uuid-9' } }],
    actions: [{ actionId: 'a1', taskId: 'atr', toolId: 'atr_turn', input: {}, status: 'failed' }]
  });
  assert.equal(migrated.tasks[0].taskId, 'uuid-9');
  assert.equal(migrated.actions[0].taskId, 'uuid-9');

  // PAUSE must not include verifying; canonical pause is waiting.
  assert.equal(!!Controller.PAUSE.verifying, false);
  assert.equal(!!Controller.PAUSE.repair, false);
  assert.equal(!!Controller.PAUSE.waiting, true);

  // Poll-style finish must keep waiting + reason (not invent waiting_approval status).
  const polled = Controller.create({
    runId: 'own-poll',
    mode: 'work',
    budget: { model: 4 },
    skipArchiveLoad: true,
    planConfirmed: true,
    permissions: ['*'],
    invoke() {
      return Promise.resolve({});
    }
  });
  polled.bindAtrTask({ taskId: 't-poll', status: 'running' });
  polled.finish('waiting', 'user_input');
  assert.equal(polled.snapshot().status, 'waiting');
  assert.equal(polled.snapshot().stopReason, 'user_input');

  console.log('test-controller-ownership: ok');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
