/**
 * Capability projection for Agent Task Runtime vs task_organize.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const capsSrc = fs.readFileSync(
  path.join(root, 'src/js/features/now/home-agent-capabilities.js'),
  'utf8'
);
const taskSrc = fs.readFileSync(
  path.join(root, 'src/js/features/now/home-agent-task.js'),
  'utf8'
);

const sandbox = { console, localStorage: { store: {}, getItem(k) { return this.store[k] || null; }, setItem(k, v) { this.store[k] = String(v); } } };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(capsSrc, sandbox);
vm.runInContext(taskSrc, sandbox);

const Caps = sandbox.OneToneHomeAgentCapabilities;
const Task = sandbox.OneToneHomeAgentTask;
assert.ok(Caps && Task);

const off = Caps.projectSession({ selectedKind: 'cursor' });
assert.equal(off.capabilities.write_project.status, 'not_wired');
assert.equal(off.capabilities.approval_execute.status, 'not_wired');
assert.match(off.capabilities.agent_task.reason, /外部 Agent|未投影/);

sandbox.localStorage.setItem(Task.FLAG_KEY, '1');
const on = Caps.projectSession(
  Object.assign({ selectedKind: 'cursor' }, Task.capabilityInput({ agentTaskGrant: true }))
);
assert.equal(on.capabilities.agent_task.status, 'partial');
assert.equal(on.capabilities.agent_task.ready, true);
assert.equal(on.capabilities.write_project.status, 'partial');
assert.equal(on.capabilities.write_project.ready, true);
assert.equal(on.capabilities.run_command.status, 'partial');
assert.equal(on.capabilities.approval_execute.status, 'partial');
assert.ok(on.capabilities.task_organize.implemented);
assert.notEqual(on.capabilities.task_organize.ipcHints.join(','), on.capabilities.agent_task.ipcHints.join(','));

console.log('test-home-agent-task: ok');
