/**
 * Assist IPC contract: run/cancel/ready DTOs must sit under `args`.
 * status has no args. Rejects unconditional mock-success invoke.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

const calls = [];
const ctx = {
  console,
  localStorage: {
    _m: {},
    getItem(k) {
      return this._m[k] || null;
    },
    setItem(k, v) {
      this._m[k] = String(v);
    },
    removeItem(k) {
      delete this._m[k];
    }
  },
  Date,
  Math,
  JSON,
  setTimeout,
  clearTimeout,
  Promise,
  OneToneIpc: {
    invoke(cmd, args) {
      calls.push({ cmd, args: JSON.parse(JSON.stringify(args || {})) });
      if (cmd === 'cmd_assist_ready') {
        assert.ok(args && args.args, 'ready must wrap under args');
        assert.equal(typeof args.args.allowMetered, 'boolean');
        return Promise.resolve({
          skillId: 'task_organize',
          implemented: true,
          ready: false,
          reason: 'no_free_model'
        });
      }
      if (cmd === 'cmd_assist_status') {
        assert.deepEqual(args || {}, {}, 'status must have empty invoke object (no args key)');
        return Promise.resolve({ taskOrganize: { implemented: true } });
      }
      if (cmd === 'cmd_assist_run') {
        assert.ok(args && args.args, 'run must wrap under args');
        assert.ok(args.args.requestId);
        assert.equal(args.args.skillId, 'task_organize');
        assert.ok(args.args.input);
        assert.ok(args.args.policy);
        assert.equal(args.allowMetered, undefined);
        assert.equal(args.requestId, undefined);
        return Promise.resolve({
          ok: false,
          reason: 'no_key',
          retryable: false
        });
      }
      if (cmd === 'cmd_assist_cancel') {
        assert.ok(args && args.args, 'cancel must wrap under args');
        assert.ok(args.args.requestId);
        assert.equal(args.requestId, undefined);
        return Promise.resolve({ ok: true, state: 'cancelled' });
      }
      return Promise.reject(new Error('unexpected cmd ' + cmd));
    }
  }
};
ctx.window = ctx;
ctx.globalThis = ctx;

vm.runInNewContext(read('src/js/features/now/home-assist-ownership.js'), ctx);
vm.runInNewContext(read('src/js/features/now/home-prompt-prep.js'), ctx);
vm.runInNewContext(read('src/js/features/now/home-assist-client.js'), ctx);

const Client = ctx.OneToneHomeAssistClient;
const Prep = ctx.OneToneHomePromptPrep;
assert.ok(Client && Prep);

// --- ready ---
calls.length = 0;
const ready = await Client.fetchReady();
assert.equal(ready.reason, 'no_free_model');
assert.equal(calls.length, 1);
assert.equal(calls[0].cmd, 'cmd_assist_ready');
assert.deepEqual(Object.keys(calls[0].args).sort(), ['args']);
assert.equal(typeof calls[0].args.args.allowMetered, 'boolean');

// --- status shape helper (direct invoke via same wrap convention) ---
calls.length = 0;
await ctx.OneToneIpc.invoke('cmd_assist_status', {});
assert.equal(calls[0].cmd, 'cmd_assist_status');
assert.deepEqual(calls[0].args, {});

// --- run ---
Prep._setModel({
  phase: 'COLLECTING',
  collectionId: 'c_ipc',
  taskScopeId: 'ts_ipc',
  materials: [{ id: 'm1', name: 'a', included: true, citeMode: 'full', content: 'hello' }],
  rawDraft: { title: 't', body: 'body' },
  draft: { title: 't', body: 'body' },
  organizedDraft: { body: '', structured: null, editGeneration: 0 },
  activeDraft: 'raw',
  assist: { state: 'idle', requestId: null },
  contentRevision: 1,
  sendScope: 'included_materials'
});
calls.length = 0;
const runRes = await Client.runOrganize({ deadlineMs: 5000 });
assert.equal(runRes.ok, false);
assert.equal(runRes.reason, 'no_key');
assert.equal(calls.length, 1);
assert.equal(calls[0].cmd, 'cmd_assist_run');
assert.ok(calls[0].args.args.requestId);
assert.equal(calls[0].args.args.skillId, 'task_organize');
assert.ok(Array.isArray(calls[0].args.args.input.materials));

// --- cancel (beginAssistOrganize sets running; migrate would strip a raw running seed) ---
Prep._setModel({
  phase: 'COLLECTING',
  collectionId: 'c_ipc2',
  taskScopeId: 'ts_ipc2',
  materials: [{ id: 'm2', name: 'b', included: true, citeMode: 'full', content: 'x' }],
  rawDraft: { title: 't', body: 'b' },
  draft: { title: 't', body: 'b' },
  organizedDraft: { body: '', structured: null, editGeneration: 0 },
  activeDraft: 'raw',
  assist: { state: 'idle', requestId: null },
  contentRevision: 1,
  sendScope: 'included_materials'
});
const begun = Prep.beginAssistOrganize({ allowMetered: false, deadlineMs: 5000 });
assert.equal(begun.ok, true);
assert.ok(begun.requestId);
calls.length = 0;
const cancelRes = await Client.cancelOrganize();
assert.equal(cancelRes.ok, true);
assert.equal(calls.length, 1);
assert.equal(calls[0].cmd, 'cmd_assist_cancel');
assert.equal(calls[0].args.args.requestId, begun.requestId);

// Flat (unwrapped) run payload must fail contract checks in the mock
let flatOk = false;
try {
  await ctx.OneToneIpc.invoke('cmd_assist_run', {
    requestId: 'x',
    skillId: 'task_organize',
    input: { draft: '', materials: [] },
    policy: {}
  });
  flatOk = true;
} catch (_) {
  flatOk = false;
}
assert.equal(flatOk, false, 'unwrapped run payload must be rejected by contract');

console.log('test-home-assist-ipc-contract: ok');
