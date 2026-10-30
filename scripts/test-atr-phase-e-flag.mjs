/**
 * Phase E flag/script check: ATR client surface + capability projection.
 * Does not require a running Tauri shell.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

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
assert.equal(Task.featureEnabled(), true, 'ATR defaults on');
sandbox.localStorage.setItem(Task.FLAG_KEY, '0');
assert.equal(Task.featureEnabled(), false, 'opt-out with 0');
sandbox.localStorage.setItem(Task.FLAG_KEY, '1');
assert.equal(Task.featureEnabled(), true);
assert.ok(typeof Task.rejectPatch === 'function');
assert.ok(typeof Task.submitUserInput === 'function');
assert.ok(typeof Task.driveFake === 'function');
assert.ok(typeof Task.runGoal === 'function');
assert.ok(typeof Task.editModeSelectable === 'function');

const on = Caps.projectSession(
  Object.assign(
    { selectedKind: 'cursor', workMode: 'edit' },
    Task.capabilityInput({ agentTaskGrant: true })
  )
);
assert.equal(on.capabilities.agent_task.ready, true);
assert.ok(on.capabilities.approval_execute.status === 'partial' || on.capabilities.approval_execute.available);
assert.equal(on.modeEffective, true);
assert.equal(Task.editModeSelectable(on.capabilities), true);

// Store ATR fields exist in source (compile-free smoke).
const storeSrc = load('home-agent-v2-store.js');
assert.match(storeSrc, /activeAgentTaskId/);
assert.match(storeSrc, /approveAgentPatch/);
assert.match(storeSrc, /rejectAgentPatch/);
assert.match(storeSrc, /startAndDriveAgentTask/);
assert.match(storeSrc, /atrDriveInFlightByTask/);
const uiSrc = load('home-agent-v2.js');
assert.match(uiSrc, /data-ha2-atr-approve/);
assert.match(uiSrc, /data-ha2-atr-approve-all/);
assert.match(uiSrc, /ha2-atr-timeline/);
assert.match(uiSrc, /atrEditPathOn/);
assert.match(uiSrc, /startAndDriveAgentTask/);

console.log('test-atr-phase-e-flag: ok');
