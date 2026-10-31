/**
 * P0-A: send while ATR task blocking must not silent-abandon;
 * abandon-and-send preflights first; keep-draft clears conflict only.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const storeSrc = fs.readFileSync(
  path.join(root, 'src/js/features/now/home-agent-v2-store.js'),
  'utf8'
);
const taskSrc = fs.readFileSync(
  path.join(root, 'src/js/features/now/home-agent-task.js'),
  'utf8'
);
const uiSrc = fs.readFileSync(
  path.join(root, 'src/js/features/now/home-agent-v2.js'),
  'utf8'
);

assert.match(storeSrc, /atrSendConflict/);
assert.match(storeSrc, /skipBlockingCheck/);
assert.match(storeSrc, /preflightAtrStart/);
assert.match(storeSrc, /keepDraftDeferAtrSend/);
assert.match(storeSrc, /abandon_start_failed/);
assert.doesNotMatch(
  storeSrc,
  /Explicit new goal while prior task still live → replace/
);
assert.match(uiSrc, /data-ha2-atr-send-conflict/);
assert.match(uiSrc, /data-ha2-atr-keep-draft/);
assert.match(uiSrc, /ha2AtrApprovePatch/);

const sandbox = {
  console,
  localStorage: {
    store: { 'onetone.agentTaskRuntime': '1' },
    getItem(k) {
      return Object.prototype.hasOwnProperty.call(this.store, k) ? this.store[k] : null;
    },
    setItem(k, v) {
      this.store[k] = String(v);
    },
    removeItem(k) {
      delete this.store[k];
    }
  },
  setInterval() {
    return 0;
  },
  clearInterval() {},
  setTimeout() {
    return 0;
  },
  clearTimeout() {}
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(taskSrc, sandbox);
vm.runInContext(storeSrc, sandbox);

const Store = sandbox.OneToneHomeAgentV2Store;
assert.ok(Store);
assert.ok(Store.__testOnly && Store.__testOnly.getState);

let abandonCalls = 0;
let startCalls = 0;
sandbox.OneToneHomeAgentTask = {
  featureEnabled() {
    return true;
  },
  readProvider() {
    return 'deepseek';
  },
  writeProvider() {},
  readPermissionMode() {
    return 'write_with_approval';
  },
  writeActiveId() {},
  readActiveId() {
    return null;
  },
  ready() {
    return Promise.resolve({
      implemented: true,
      deepseekReady: true,
      selectedDefault: 'deepseek',
      providers: [{ id: 'deepseek', ready: true, editCapable: true, label: 'DeepSeek' }]
    });
  },
  abandon() {
    abandonCalls += 1;
    return Promise.resolve({ taskId: 'old', status: 'cancelled' });
  },
  runGoal(opts) {
    startCalls += 1;
    return Promise.resolve({
      taskId: 'new1',
      status: 'running',
      goal: opts && opts.goal
    });
  },
  status() {
    return Promise.resolve(null);
  },
  events() {
    return Promise.resolve([]);
  }
};

Store.mount();
const state = Store.__testOnly.getState();

// --- no silent abandon: busy + new goal → conflict ---
abandonCalls = 0;
startCalls = 0;
state.agentTask = {
  taskId: 'old',
  status: 'running',
  goal: 'prior'
};
state.activeAgentTaskId = 'old';
state.agentTaskGrant = true;
state.draft = '';

const blocked = await Store.startAndDriveAgentTask({
  goal: 'change hello.txt to hi',
  materialsSummary: 'mat'
});
assert.equal(blocked, null);
assert.equal(abandonCalls, 0, 'must not abandon on send conflict');
assert.equal(startCalls, 0, 'must not start on send conflict');
const snap1 = Store.getSnapshot();
assert.ok(snap1.atrSendConflict);
assert.equal(snap1.atrSendConflict.goal, 'change hello.txt to hi');
assert.equal(snap1.atrSendConflict.status, 'running');
assert.equal(snap1.validationNotice.code, 'busy');
assert.ok(snap1.validationNotice.sendConflict);
assert.ok(snap1.validationNotice.actions.indexOf('keep_draft') >= 0);
assert.ok(snap1.validationNotice.actions.indexOf('abandon_and_send') >= 0);

// keep draft clears conflict, leaves task
await Store.keepDraftDeferAtrSend();
assert.equal(Store.getSnapshot().atrSendConflict, null);
assert.equal(state.agentTask && state.agentTask.taskId, 'old');
assert.equal(abandonCalls, 0);

// --- preflight fail does not abandon ---
state.agentTask = { taskId: 'old2', status: 'waiting', goal: 'w' };
state.activeAgentTaskId = 'old2';
state.atrSendConflict = {
  goal: 'new goal text',
  materialsSummary: '',
  status: 'waiting',
  taskId: 'old2'
};
abandonCalls = 0;
const pfFail = await Store.abandonAndStartAgentTask({
  goal: 'new goal text',
  useFakeDriver: true
});
assert.equal(pfFail, null);
assert.equal(abandonCalls, 0, 'preflight need_project must not abandon');
const nFail = Store.getSnapshot().validationNotice;
assert.equal(nFail.abandoned, false);
assert.equal(nFail.code, 'need_project');

// --- preflight ok → abandon then start ---
state.userLocked = true;
state.lockedProjectPath = 'E:/tmp-atr-conflict';
state.agentTask = { taskId: 'old3', status: 'interrupted', goal: 'w' };
state.activeAgentTaskId = 'old3';
state.atrSendConflict = {
  goal: 'write readme note',
  materialsSummary: '',
  status: 'interrupted',
  taskId: 'old3'
};
abandonCalls = 0;
startCalls = 0;
const ok = await Store.abandonAndStartAgentTask({
  goal: 'write readme note',
  useFakeDriver: true
});
assert.equal(abandonCalls, 1);
assert.equal(startCalls, 1);
assert.ok(ok);
assert.equal(ok.taskId, 'new1');
assert.equal(Store.getSnapshot().atrSendConflict, null);

console.log('test-atr-send-conflict: ok');
