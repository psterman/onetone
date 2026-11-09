/**
 * Runtime gates 1–6 (archive, replay, retry, provider, cancel, terminal).
 * Run: node scripts/test-runtime-gates.mjs
 */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import path from 'node:path';

const read = (p) => fs.readFileSync(p, 'utf8');

function loadRuntime() {
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
    sessionStorage: { _d: {}, getItem(k) { return this._d[k] || null; }, setItem(k, v) { this._d[k] = String(v); } }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  const store = {};
  sandbox.OneToneIpc = {
    invoke(cmd, payload) {
      const args = (payload && payload.args) || payload || {};
      if (cmd === 'cmd_run_archive_save') {
        store[args.runId] = JSON.parse(JSON.stringify(args.snapshot));
        return Promise.resolve({ ok: true });
      }
      if (cmd === 'cmd_run_archive_load') {
        return Promise.resolve(store[args.runId || payload.runId] || null);
      }
      if (cmd === 'cmd_run_archive_list') {
        return Promise.resolve(Object.keys(store).map((runId) => ({
          runId,
          status: store[runId].status
        })));
      }
      if (cmd === 'cmd_research_web_search') {
        if (args.query === 'FAIL') {
          return Promise.resolve({ ok: false, code: 'search_unavailable', message: 'fail' });
        }
        return Promise.resolve({
          ok: true,
          results: [{ title: 'T', url: 'https://example.com/a', snippet: 's' }],
          provider: 'mock'
        });
      }
      if (cmd === 'cmd_research_fetch_url') {
        return Promise.resolve({
          ok: true,
          url: args.url,
          text: 'fetched body',
          title: 'Page',
          fetchedAt: new Date().toISOString()
        });
      }
      if (cmd === 'cmd_assist_model_chat' || cmd === 'cmd_workbuddy_local_chat') {
        return Promise.resolve({
          content: '{"title":"ok","executiveAnswer":{"text":"ans","sourceIds":["S1"]},"blocks":[]}',
          model: 'mock-model',
          providerId: cmd.indexOf('workbuddy') >= 0 ? 'workbuddy' : 'softpad_our_freemodel'
        });
      }
      if (cmd === 'cmd_network_diagnostics') {
        return Promise.resolve({ ok: true, internetReachable: true });
      }
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
  return { sandbox, store };
}

async function main() {
  const { sandbox, store } = loadRuntime();
  const Controller = sandbox.OneToneWorkController;
  const Archive = sandbox.OneToneRunArchive;
  const Gateway = sandbox.OneToneModelGateway;

  // Gate 1: archive recoverable → interrupted → resume
  const c1 = Controller.create({
    runId: 'gate1',
    mode: 'research',
    budget: { search: 3, fetch: 3, model: 3 },
    skipArchiveLoad: true,
    invoke: (cmd, args) => sandbox.OneToneIpc.invoke(cmd, { args })
  });
  await c1.executeAction({ toolId: 'web_search', input: { query: 'q1' } });
  await Archive.save(c1.snapshot());
  assert.ok(store.gate1);
  store.gate1.status = 'running'; // simulate crash mid-run
  const restored = await Archive.restore('gate1');
  assert.equal(restored.status, 'interrupted');
  assert.equal(restored.resumeAvailable, true);
  const c1b = Controller.create({ runId: 'gate1', skipArchiveLoad: true, restore: restored, budget: restored.budget });
  assert.equal(c1b.snapshot().status, 'interrupted');
  const resumed = c1b.resume();
  assert.equal(resumed.ok, true);
  assert.equal(c1b.snapshot().status, 'running');

  // Gate 2: actions replayable
  assert.ok(Array.isArray(restored.actions) && restored.actions.length >= 1);
  assert.ok(restored.actions[0].actionId && restored.actions[0].toolId);

  // Gate 3: failed action retryable alone
  let searchAttempts = 0;
  const c3 = Controller.create({
    runId: 'gate3',
    mode: 'research',
    budget: { search: 3 },
    skipArchiveLoad: true,
    invoke: (cmd, args) => {
      if (cmd === 'cmd_research_web_search') {
        searchAttempts += 1;
        if (searchAttempts === 1) {
          return Promise.resolve({ ok: false, code: 'search_unavailable', message: 'fail' });
        }
        return Promise.resolve({
          ok: true,
          results: [{ title: 'T', url: 'https://example.com/a', snippet: 's' }],
          provider: 'mock'
        });
      }
      return sandbox.OneToneIpc.invoke(cmd, { args });
    }
  });
  const fail = await c3.executeAction({ toolId: 'web_search', input: { query: 'flaky' } });
  assert.equal(fail.ok, false);
  const failedId = fail.actionId;
  const retry = await c3.retryAction(failedId);
  assert.equal(retry.ok, true);
  assert.ok(searchAttempts >= 2);

  // Gate 4: provider call recorded with fallback metadata path
  Gateway.configure({
    invoke: (cmd, args) => sandbox.OneToneIpc.invoke(cmd, { args }),
    softpadChat: () => Promise.reject(Object.assign(new Error('down'), { code: 'network_error' })),
    resolveWorkbuddy: () => Promise.resolve({ accountId: 'a', model: 'm' })
  });
  const c4 = Controller.create({
    runId: 'gate4',
    mode: 'research',
    budget: { model: 2 },
    skipArchiveLoad: true,
    invoke: (cmd, args) => sandbox.OneToneIpc.invoke(cmd, { args })
  });
  const modelRes = await c4.executeAction({
    toolId: 'model_chat',
    input: {
      purpose: 'synthesis',
      providerId: 'softpad_our_freemodel',
      messages: [{ role: 'user', content: 'hi' }]
    }
  });
  assert.equal(modelRes.ok, true);
  const calls = c4.snapshot().providerCalls;
  assert.ok(calls.length >= 1);
  assert.ok(calls[0].providerId);
  assert.ok(calls.some((x) => x.fallbackFrom === 'softpad_our_freemodel' || x.providerId === 'workbuddy' || x.ok));

  // Gate 5: cancel → cancelled, late ignore
  const c5 = Controller.create({
    runId: 'gate5',
    mode: 'research',
    budget: { model: 2 },
    skipArchiveLoad: true,
    invoke: () => new Promise(() => {})
  });
  const hang = c5.executeAction({ toolId: 'network_diagnostics', input: {} });
  const snapRunning = c5.snapshot();
  assert.equal(snapRunning.actions[0].status, 'running');
  c5.cancel('user');
  assert.equal(c5.snapshot().status, 'cancelled');
  assert.equal(c5.snapshot().actions[0].status, 'cancelled');
  assert.equal(c5.snapshot().actions[0].error.code, 'cancelled');
  c5.actionResult({ actionId: snapRunning.actions[0].actionId, ok: true, result: { x: 1 } });
  assert.ok(!c5.snapshot().actions[0].result || !c5.snapshot().actions[0].result.x);
  await hang.then(() => {}, () => {});

  // Gate 6: terminal has no running
  const c6 = Controller.create({
    runId: 'gate6',
    mode: 'research',
    budget: { search: 1 },
    skipArchiveLoad: true,
    invoke: (cmd, args) => sandbox.OneToneIpc.invoke(cmd, { args })
  });
  await c6.executeAction({ toolId: 'web_search', input: { query: 'ok' } });
  c6.finish('completed', 'done');
  const term = c6.snapshot();
  assert.equal(term.status, 'completed');
  assert.ok(term.actions.every((a) => a.status !== 'running'));

  // Work-mode Gates 1–6 (ATR projection via atr_turn mock — not live providers)
  const workStore = {};
  let workDriveN = 0;
  sandbox.OneToneIpc.invoke = (cmd, payload) => {
    const args = (payload && payload.args) || payload || {};
    if (cmd === 'cmd_run_archive_save') {
      workStore[args.runId] = JSON.parse(JSON.stringify(args.snapshot));
      return Promise.resolve({ ok: true });
    }
    if (cmd === 'cmd_run_archive_load') {
      return Promise.resolve(workStore[args.runId || payload.runId] || null);
    }
    if (cmd === 'cmd_agent_task_drive') {
      workDriveN += 1;
      assert.equal(Number(args.maxSteps), 1);
      // Round 1 verifying → Controller must keep stepping; round 2 waiting.
      return Promise.resolve({
        taskId: args.taskId,
        status: workDriveN === 1 ? 'verifying' : 'waiting',
        checkpointId: 'ck-work',
        providerId: 'workbuddy',
        model: 'wb-mock',
        providerDurationMs: 42,
        events: [
          {
            kind: 'tool_result',
            id: 'e' + workDriveN,
            payload: { tool: 'inspect_workspace', ok: true, summary: 'ok' }
          }
        ]
      });
    }
    return Promise.resolve({});
  };

  const cw = Controller.create({
    runId: 'gate-work-1',
    mode: 'work',
    budget: { model: 6 },
    skipArchiveLoad: true,
    planConfirmed: true,
    permissions: ['*'],
    invoke: (cmd, args) => sandbox.OneToneIpc.invoke(cmd, { args })
  });
  cw.bindAtrTask({ taskId: 't-work', status: 'running', checkpointId: 'ck0' });
  const loop = await cw.driveAtrUntilIdle({ taskId: 't-work', provider: 'workbuddy' });
  assert.equal(loop.ok, true);
  assert.ok(workDriveN >= 2, 'Controller must step through verifying');
  assert.ok(cw.snapshot().actions.length >= 1);
  assert.ok(cw.snapshot().providerCalls.length >= 1);
  assert.equal(cw.snapshot().providerCalls[0].providerId, 'workbuddy');
  assert.ok(cw.snapshot().observations.length >= 1);
  assert.equal(cw.boundAtrTaskId(), 't-work');
  assert.equal(
    cw.snapshot().tasks.find((t) => t.kind === 'atr').outputs.checkpointId,
    'ck-work'
  );
  await Archive.save(cw.snapshot());
  workStore['gate-work-1'].status = 'running';
  const workRestored = await Archive.restore('gate-work-1');
  assert.equal(workRestored.status, 'interrupted');
  assert.equal(workRestored.resumeAvailable, true);
  const cw2 = Controller.create({
    restore: workRestored,
    skipArchiveLoad: true,
    permissions: ['*']
  });
  assert.equal(cw2.boundAtrTaskId(), 't-work');
  assert.equal(cw2.isPlanConfirmed(), true);
  assert.equal(cw2.resume().ok, true);

  // atr_internal cannot execute from FE
  if (cw.continueFromPause) cw.continueFromPause('gate');
  const blocked = await cw.executeAction({
    toolId: 'inspect_workspace',
    input: {},
    taskId: 't-work'
  });
  assert.equal(blocked.ok, false);

  // waiting + reason pause then continue (legacy waiting_approval normalizes)
  cw.finish('waiting', 'approval');
  assert.equal(cw.snapshot().status, 'waiting');
  assert.equal(cw.snapshot().stopReason, 'approval');
  const cont = cw.continueFromPause('approve');
  assert.equal(cont.ok, true);
  assert.equal(cw.snapshot().status, 'running');

  // Plan gate: unconfirmed work controller cannot atr_turn
  const cwPlan = Controller.create({
    runId: 'gate-work-plan',
    mode: 'work',
    budget: { model: 2 },
    skipArchiveLoad: true,
    permissions: ['*'],
    invoke: () => Promise.resolve({ taskId: 'x', status: 'running' })
  });
  assert.equal(cwPlan.isPlanConfirmed(), false);
  const planDeny = await cwPlan.stepAtr({ taskId: 'x' });
  assert.equal(planDeny.ok, false);
  assert.equal(planDeny.code, 'plan_not_confirmed');

  console.log('test-runtime-gates: ok');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
