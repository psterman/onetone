/**
 * Task journal — migrate + CRUD + mixed events.
 * Run: node scripts/test-home-task-journal.mjs
 */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// Minimal localStorage for migration tests
const store = new Map();
const localStorage = {
  getItem(k) {
    return store.has(k) ? store.get(k) : null;
  },
  setItem(k, v) {
    store.set(String(k), String(v));
  },
  removeItem(k) {
    store.delete(String(k));
  }
};

const src = fs.readFileSync('src/js/features/now/home-task-journal.js', 'utf8');
const sandbox = { window: {}, localStorage, console };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.runInNewContext(src, sandbox);
const J = sandbox.OneToneHomeTaskJournal;
assert.ok(J);

// seed old wb turns + handoffs via Prep stub before migrate
localStorage.setItem(
  'onetone.ha2.wbChat.v1',
  JSON.stringify({
    turns: [
      { id: 'u1', role: 'user', text: 'hello', at: 1000 },
      { id: 'a1', role: 'assistant', text: 'hi', model: 'm', at: 2000 }
    ]
  })
);
sandbox.OneToneHomePromptPrep = {
  listHandoffs() {
    return [
      {
        id: 'h1',
        title: '投递给 Codex',
        body: 'please fix',
        targetKind: 'codex',
        handedOffAt: new Date(3000).toISOString(),
        outcome: 'sent',
        chars: 10
      }
    ];
  }
};

J.migrateOnce();
const tasks = J.listTasks({ archived: false });
assert.ok(tasks.length >= 2, 'migrated chat + handoff tasks');
const chat = tasks.find((t) => t.title === '本机对话');
const send = tasks.find((t) => t.title === '投递记录');
assert.ok(chat);
assert.ok(send);
assert.equal(J.eventCount(chat.id), 2);
assert.equal(J.listEvents(send.id).length, 1);

const created = J.createTask({ title: '修复分层' });
assert.equal(created.title, '修复分层');
J.appendChatTurn({
  taskId: created.id,
  role: 'user',
  text: '分层一下',
  agentKind: 'workbuddy'
});
J.appendHandoff({
  taskId: created.id,
  targetKind: 'codex',
  body: 'handoff body',
  handedOffAt: new Date().toISOString()
});
const evs = J.listEvents(created.id);
assert.equal(evs.length, 2);
assert.equal(evs[0].kind, 'chat_turn');
assert.equal(evs[1].kind, 'handoff');
assert.ok(J.agentKindsForTask(created.id).includes('workbuddy'));
assert.ok(J.agentKindsForTask(created.id).includes('codex'));

J.setPinned(created.id, true);
assert.equal(J.getTask(created.id).pinned, true);
J.renameTask(created.id, '修复对话分层');
assert.equal(J.getTask(created.id).title, '修复对话分层');
J.setArchived(created.id, true);
assert.equal(J.listTasks({ archived: false }).some((t) => t.id === created.id), false);
assert.equal(J.listTasks({ archived: true }).some((t) => t.id === created.id), true);

assert.match(fs.readFileSync('src/index.html', 'utf8'), /home-task-journal\.js/);
assert.match(fs.readFileSync('src/js/features/now/composer-history-panel.js', 'utf8'), /contextmenu/);
assert.match(fs.readFileSync('src/js/features/now/composer-history-panel.js', 'utf8'), /data-ctx-act/);

console.log('test-home-task-journal: ok');
