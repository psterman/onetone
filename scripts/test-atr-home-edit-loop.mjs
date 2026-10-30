/**
 * Home edit → ATR seam checks + fake-loop source contract.
 * Full Rust repair loop: cargo test --lib agent_task_runtime::tests::repair_after_check_fail_reaches_done
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function load(name) {
  return fs.readFileSync(path.join(root, 'src/js/features/now', name), 'utf8');
}

const sandbox = {
  console,
  localStorage: {
    store: {},
    getItem(k) {
      return Object.prototype.hasOwnProperty.call(this.store, k) ? this.store[k] : null;
    },
    setItem(k, v) {
      this.store[k] = String(v);
    },
    removeItem(k) {
      delete this.store[k];
    }
  }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(load('home-agent-capabilities.js'), sandbox);
vm.runInContext(load('home-agent-task.js'), sandbox);

const Caps = sandbox.OneToneHomeAgentCapabilities;
const Task = sandbox.OneToneHomeAgentTask;
assert.ok(Caps && Task);
assert.equal(typeof Task.runGoal, 'function');
assert.equal(typeof Task.editModeSelectable, 'function');

assert.equal(Task.editModeSelectable({}), false);

sandbox.localStorage.setItem(Task.FLAG_KEY, '1');
const onCaps = Caps.projectSession(
  Object.assign({ selectedKind: 'cursor', workMode: 'edit' }, Task.capabilityInput({}))
);
assert.equal(Task.editModeSelectable(onCaps.capabilities), true);
assert.equal(onCaps.modeEffective, true);

sandbox.localStorage.setItem(Task.FLAG_KEY, '0');
const offCaps = Caps.projectSession({ selectedKind: 'cursor', workMode: 'edit' });
assert.equal(Task.editModeSelectable(offCaps.capabilities), false);

sandbox.localStorage.setItem(Task.FLAG_KEY, '1');

// Mock IPC for runGoal error codes
const calls = [];
sandbox.OneToneIpc = {
  invoke(cmd, payload) {
    calls.push({ cmd, payload });
    if (cmd === 'cmd_agent_task_ready') {
      return Promise.resolve({
        implemented: true,
        deepseekReady: false,
        workbuddyReady: false,
        providers: []
      });
    }
    return Promise.reject(new Error('unexpected:' + cmd));
  }
};
await Task.runGoal({ goal: 'x', workspaceRoot: 'E:/tmp' }).then(
  () => {
    throw new Error('expected reject');
  },
  (err) => {
    assert.equal(err.code, 'provider_unconfigured');
  }
);

calls.length = 0;
sandbox.localStorage.setItem(Task.FLAG_KEY, '0');
await Task.runGoal({ goal: 'x', workspaceRoot: 'E:/tmp' }).then(
  () => {
    throw new Error('expected reject');
  },
  (err) => {
    assert.equal(err.code, 'not_ready');
  }
);

sandbox.localStorage.setItem(Task.FLAG_KEY, '1');
let driveCount = 0;
sandbox.OneToneIpc = {
  invoke(cmd) {
    calls.push(cmd);
    if (cmd === 'cmd_agent_task_ready') {
      return Promise.resolve({
        implemented: true,
        deepseekReady: true,
        selectedDefault: 'deepseek',
        providers: [{ id: 'deepseek', ready: true, label: 'DeepSeek' }]
      });
    }
    if (cmd === 'cmd_agent_task_start') {
      return Promise.resolve({
        taskId: 't_edit_1',
        status: 'running',
        checkpointId: 'ckpt_1'
      });
    }
    if (cmd === 'cmd_agent_task_drive') {
      driveCount += 1;
      return Promise.resolve({
        taskId: 't_edit_1',
        status: 'waiting',
        checkpointId: 'ckpt_1',
        waitingReason: 'approval',
        pendingApprovalToken: 'tok'
      });
    }
    return Promise.reject(new Error('unexpected:' + cmd));
  }
};
const dto = await Task.runGoal({ goal: 'fix greeting', workspaceRoot: 'E:/proj' });
assert.equal(dto.taskId, 't_edit_1');
assert.equal(dto.checkpointId, 'ckpt_1');
assert.equal(dto.status, 'waiting');
assert.equal(driveCount, 1);
assert.ok(calls.includes('cmd_agent_task_start'));
assert.ok(calls.includes('cmd_agent_task_drive'));

const storeSrc = load('home-agent-v2-store.js');
assert.match(storeSrc, /startAndDriveAgentTask/);
assert.match(storeSrc, /atrDriveInFlightByTask/);
assert.match(storeSrc, /atrSendInFlight/);
assert.match(storeSrc, /driveActiveIfRunning/);
assert.match(storeSrc, /confirmedProjectPath/);
assert.match(storeSrc, /budget_exhausted/);
assert.match(storeSrc, /\^\[\\d\\s\.\]\+/);

const uiSrc = load('home-agent-v2.js');
assert.match(uiSrc, /atrEditPathOn/);
assert.match(uiSrc, /startAndDriveAgentTask/);
assert.match(uiSrc, /data-ha2-atr-resume/);
assert.match(uiSrc, /data-ha2-atr-abandon/);
assert.match(uiSrc, /data-ha2-atr-approve-all/);
assert.match(uiSrc, /editModeSelectable/);
assert.match(uiSrc, /ha2PillEditTask/);
assert.match(uiSrc, /budget_exhausted/);
// Edit send must not require desktop Agent chip before ATR.
assert.match(
  uiSrc,
  /Edit mode → ATR only[\s\S]*?if \(!c\.id\)/
);
assert.ok(
  uiSrc.indexOf("if (String((snap && snap.workMode) || '') === 'edit') return '';") >= 0 ||
    /workMode\) \|\| ''\) === 'edit'\) return '';/.test(uiSrc),
  'sendBlockReason skips agent pick in edit'
);

const engineSrc = fs.readFileSync(
  path.join(root, 'src-tauri/src/agent_task_runtime/engine.rs'),
  'utf8'
);
assert.match(engineSrc, /classify_drive_failure/);
assert.match(engineSrc, /after_approve_repair_then_ok_steps/);
assert.match(engineSrc, /"rate_limited"/);
assert.match(engineSrc, /"format_error"/);
assert.match(engineSrc, /"model_error"/);
assert.match(engineSrc, /"budget_exhausted"/);
assert.match(engineSrc, /stuck_loop/);
assert.match(engineSrc, /MAX_IDENTICAL_TOOL/);
assert.match(engineSrc, /tool_trace_from_events|create_file_fake_steps/);
const promptsSrc = fs.readFileSync(
  path.join(root, 'src-tauri/src/agent_task_runtime/prompts.rs'),
  'utf8'
);
assert.match(promptsSrc, /tool_trace_from_events/);
assert.match(promptsSrc, /新建文件/);

console.log('test-atr-home-edit-loop: ok');
