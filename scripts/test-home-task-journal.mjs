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

const created = J.createTask({ title: '修复分层', lane: 'chat' });
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
// Handoff must not pollute the chat thread — 对话 stays chat-only.
const chatEvs = J.listEvents(created.id);
assert.equal(chatEvs.length, 1);
assert.equal(chatEvs[0].kind, 'chat_turn');
assert.ok(J.isChatLaneTaskId(created.id), 'chat task stays chat lane');
assert.ok(J.agentKindsForTask(created.id).includes('workbuddy'));
const workTasks = J.listTasks({ archived: false }).filter((t) => J.isWorkLaneTaskId(t.id));
assert.ok(workTasks.length >= 1, 'handoff created/used a work task');
const handoffEv = workTasks
  .flatMap((t) => J.listEvents(t.id))
  .find((e) => e && e.kind === 'handoff' && String(e.text || '').includes('handoff body'));
assert.ok(handoffEv, 'handoff event lives on work lane');

// Active work task must not swallow new 对话 turns.
J.setArchived(created.id, true);
const workOnly = J.createTask({ title: '新工作', lane: 'work', activate: true });
J.appendChatTurn({ role: 'user', text: '今天天气怎么样', agentKind: 'workbuddy' });
assert.ok(J.isChatLaneTaskId(J.getActiveTaskId()), 'chat send activates chat task');
assert.notEqual(J.getActiveTaskId(), workOnly.id, 'chat send leaves work task');
assert.equal(J.listEvents(workOnly.id).length, 0, 'work task stays empty of chat turns');
const weatherTask = J.getTask(J.getActiveTaskId());
assert.ok(
  weatherTask && (weatherTask.title === '本机对话' || /天气/.test(weatherTask.title)),
  'chat lands on a chat-lane task'
);

J.setPinned(created.id, true);
assert.equal(J.getTask(created.id).pinned, true);
J.renameTask(created.id, '修复对话分层');
assert.equal(J.getTask(created.id).title, '修复对话分层');
J.setArchived(created.id, true);
assert.equal(J.listTasks({ archived: false }).some((t) => t.id === created.id), false);
assert.equal(J.listTasks({ archived: true }).some((t) => t.id === created.id), true);

// Session-owns: tool events + list/clear chat turns
const toolChat = J.createTask({ title: '工具循环', lane: 'chat', activate: true });
J.appendChatTurn({ taskId: toolChat.id, role: 'user', text: '戴佳伟是谁' });
J.appendToolEvent({
  taskId: toolChat.id,
  kind: 'tool_step',
  toolName: 'web_search',
  text: '联网搜索',
  detail: '{"ok":true}',
  toolOk: true
});
J.appendToolEvent({
  taskId: toolChat.id,
  kind: 'finish',
  text: '戴佳伟是…',
  toolName: 'finish'
});
const listed = J.listChatTurns(toolChat.id);
assert.ok(listed.length >= 3, 'listChatTurns includes turns + tools');
assert.ok(listed.some((r) => r.kind === 'tool_step' && r.toolName === 'web_search'));
assert.ok(listed.some((r) => r.kind === 'finish'));
const cleared = J.clearChatTurns(toolChat.id);
assert.ok(cleared >= 3, 'clearChatTurns removes session transcript');
assert.equal(J.listChatTurns(toolChat.id).length, 0);

assert.match(fs.readFileSync('src/index.html', 'utf8'), /home-task-journal\.js/);
assert.match(fs.readFileSync('src/js/features/now/composer-history-panel.js', 'utf8'), /contextmenu/);
assert.match(fs.readFileSync('src/js/features/now/composer-history-panel.js', 'utf8'), /data-ctx-act/);

console.log('test-home-task-journal: ok');
