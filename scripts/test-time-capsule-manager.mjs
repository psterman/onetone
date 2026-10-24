import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('src/js/features/agent/soft-pad-time-machine-ui.js', 'utf8');

function fakeHost() {
  const attrs = new Set();
  return {
    dataset: {},
    hidden: false,
    innerHTML: '',
    isConnected: true,
    addEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    removeAttribute(name) { attrs.delete(name); },
    setAttribute(name) { attrs.add(name); },
    hasAttribute(name) { return attrs.has(name); }
  };
}

async function renderManager({ ops = [], changedCount = 43 } = {}) {
  const desk = fakeHost();
  const detail = fakeHost();
  const status = {
    level: 'L2',
    workspace: 'E:/voice-pilot',
    recentWorkspaces: ['E:/voice-pilot'],
    isGit: true,
    changedCount,
    agentBusy: false,
    autoSaveEnabled: true,
    autoSaveIntervalMin: 15,
    lastAutoSaveAt: '2026-10-22T01:00:00Z'
  };
  const sandbox = {
    console,
    Date,
    Promise,
    navigator: {},
    document: { getElementById() { return null; } },
    setInterval() { return 1; },
    setTimeout() { return 1; },
    clearInterval() {},
    clearTimeout() {},
    OneToneIpc: {
      invoke(command) {
        if (command === 'cmd_tm_set_workspace' || command === 'cmd_tm_status') return Promise.resolve(status);
        if (command === 'cmd_tm_list') return Promise.resolve(ops);
        if (command === 'cmd_app_log') return Promise.resolve(null);
        return Promise.reject(new Error('Unexpected command: ' + command));
      }
    }
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'soft-pad-time-machine-ui.js' });
  await sandbox.OneToneSoftPadTimeMachine.openDesk({
    mount: 'agent',
    deskEl: desk,
    detailEl: detail,
    workspace: status.workspace,
    force: true
  });
  return { desk: desk.innerHTML, detail: detail.innerHTML };
}

const ops = [
  {
    id: 'cp-now',
    createdAt: '2026-10-22T01:15:00Z',
    triggerSource: 'manual',
    stats: { changed: 4, added: 1, deleted: 0 },
    agentContext: { provider: 'cursor', foregroundApp: 'Cursor' }
  },
  {
    id: 'cp-old',
    createdAt: '2026-10-21T08:10:00Z',
    triggerSource: 'scheduled',
    stats: { changed: 2, added: 0, deleted: 0 },
    agentContext: { provider: 'codex', foregroundApp: 'Codex' }
  }
];

const populated = await renderManager({ ops });
const populatedAll = populated.desk + populated.detail;
assert.match(populated.desk, /soft-pad-tm-manager-head/, 'manager opens on project controls, not a read-only hero');
assert.match(populated.desk, /soft-pad-tm-timeline/, 'recovery points use a vertical management list');
assert.match(populated.desk, /今天[\s\S]*昨天/, 'recovery points are grouped by day');
assert.doesNotMatch(populated.desk, /soft-pad-tm-spine/, 'horizontal showcase timeline is removed');
assert.doesNotMatch(populated.desk, /data-tm-agent-filter/, 'agent filter is not part of the core management path');
assert.equal((populatedAll.match(/data-tm-autosave-toggle/g) || []).length, 1, 'automatic protection has one control');
assert.equal((populatedAll.match(/data-tm-act="snapshot"/g) || []).length, 1, 'save current state has one entry point');
assert.match(populated.detail, /当前状态/, 'the inspector starts on current workspace state');
assert.match(populated.detail, /43 项改动/, 'the inspector carries the current change count');
assert.doesNotMatch(populated.detail, /可以放心继续工作/, 'the manager does not repeat homepage reassurance copy');

const empty = await renderManager({ ops: [], changedCount: 7 });
assert.match(empty.desk, /还没有恢复点/, 'empty state explains the missing recovery points');
assert.equal(((empty.desk + empty.detail).match(/data-tm-act="snapshot"/g) || []).length, 1, 'empty state keeps one save action');

console.log('time-capsule-manager: ok');
