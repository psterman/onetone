/**
 * Offline ATR chat lifecycle — DTO/event → reducer → snapshot.
 * Source-regex asserts are secondary ownership guards only.
 */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const read = (p) => fs.readFileSync(p, 'utf8');
const shell = read('src/js/features/now/home-agent-v2.js');
const contracts = read('src/js/features/now/run-contracts.js');
const projection = read('src/js/features/now/atr-session-projection.js');

// Secondary: HA2 still owns DOM/paint; reducers live in projection.
assert.match(shell, /OneToneAtrSessionProjection/);
assert.match(shell, /function chatLiveProjection\(task\)/);
assert.match(shell, /function settleStreamedChatAnswer\(tid, finalId, text, options\)/);
assert.match(shell, /var chatStopPendingId = ''/);
assert.match(shell, /CHAT_STALL_MS/);
assert.match(shell, /emitChatRecoveryTurn\(/);
assert.match(projection, /function reduceChatAtrEvent\(/);
assert.match(projection, /function settleChatAnswer\(/);
assert.match(projection, /function shouldIgnoreAtrEvent\(/);
assert.match(projection, /function noteChatRecovery\(/);

const sandbox = { console, JSON, Object, Array, String, Number, Date, Math, Error };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(contracts, sandbox, { filename: 'run-contracts.js' });
vm.runInContext(projection, sandbox, { filename: 'atr-session-projection.js' });
const C = sandbox.OneToneAtrSessionProjection;
assert.ok(C && typeof C.reduceChatAtrEvent === 'function');

function reduce(state, event) {
  return C.reduceChatAtrEvent(state, event);
}

function finCount(state) {
  return state.turns.filter((t) => t && /^fin_/.test(String(t.id))).length;
}

function answerLike(state) {
  return state.turns.filter(
    (t) =>
      t &&
      (String(t.id).indexOf('answer_') === 0 ||
        String(t.id).indexOf('fin_') === 0)
  );
}

// ── 1. running → done: thinking then answer|… then done → one answer turn ──
{
  let s = C.emptyChatState();
  s = reduce(s, { type: 'bind', taskId: 't1' });
  assert.equal(s.boundTaskId, 't1');
  assert.equal(s.busy, true);

  s = reduce(s, {
    type: 'dto_poll',
    driveAlive: true,
    task: {
      taskId: 't1',
      status: 'running',
      liveThinking: '正在检索…'
    }
  });
  assert.equal(s.busy, true);
  assert.ok(s.turns.some((t) => t.id === 'think_t1' && t.toolName === 'thinking'));

  s = reduce(s, {
    type: 'dto_poll',
    driveAlive: true,
    task: {
      taskId: 't1',
      status: 'running',
      liveThinking: 'answer|最终答案'
    }
  });
  assert.ok(s.turns.some((t) => t.id === 'answer_t1' && t.text === '最终答案'));
  assert.ok(s.turns.some((t) => t.id === 'think_t1'));

  s = reduce(s, {
    eventId: 'ev_done_t1',
    taskId: 't1',
    kind: 'done',
    payload: { summary: '最终答案' }
  });
  assert.equal(s.busy, false);
  assert.equal(finCount(s), 1);
  assert.equal(answerLike(s).length, 1);
  assert.equal(answerLike(s)[0].id, 'fin_t1');
  assert.equal(answerLike(s)[0].text, '最终答案');
  assert.ok(s.turns.some((t) => t.id === 'think_t1' && t.collapsed === true));
}

// ── 2. running → cancelled: late running poll must not restore busy ──
{
  let s = C.emptyChatState();
  s = reduce(s, { type: 'bind', taskId: 't_cancel' });
  s = reduce(s, {
    type: 'dto_poll',
    driveAlive: true,
    task: { taskId: 't_cancel', status: 'running', liveThinking: 'thinking…' }
  });
  assert.equal(s.busy, true);

  s = reduce(s, { type: 'cancel_soft', taskId: 't_cancel' });
  assert.equal(s.busy, false);
  assert.equal(s.stopPendingId, 't_cancel');
  assert.equal(s.driveAlive, false);

  s = reduce(s, {
    type: 'dto_poll',
    driveAlive: true,
    task: { taskId: 't_cancel', status: 'running', liveThinking: 'still going' }
  });
  assert.equal(s.busy, false, 'late running poll must not resurrect busy after cancel');

  s = reduce(s, {
    eventId: 'ev_cancel_t',
    taskId: 't_cancel',
    kind: 'cancelled',
    payload: { reason: 'user_stop' }
  });
  assert.equal(s.busy, false);
  assert.equal(s.stopPendingId, '');
}

// ── 3. task A → task B → late event A must not mutate B ──
{
  let s = C.emptyChatState();
  s = reduce(s, { type: 'bind', taskId: 'A' });
  s = reduce(s, {
    type: 'dto_poll',
    driveAlive: true,
    task: { taskId: 'A', status: 'running', liveThinking: 'A thinking' }
  });
  const turnsAfterA = s.turns.length;

  s = reduce(s, { type: 'bind', taskId: 'B' });
  s = reduce(s, {
    type: 'dto_poll',
    driveAlive: true,
    task: { taskId: 'B', status: 'running', liveThinking: 'B thinking' }
  });
  assert.equal(s.boundTaskId, 'B');
  const snapTurns = s.turns.map((t) => ({ id: t.id, text: t.text }));
  const snapBusy = s.busy;

  s = reduce(s, {
    eventId: 'late_A_done',
    taskId: 'A',
    kind: 'done',
    payload: { summary: 'stale A answer' }
  });
  assert.equal(s.boundTaskId, 'B');
  assert.equal(s.busy, snapBusy);
  assert.deepEqual(
    s.turns.map((t) => ({ id: t.id, text: t.text })),
    snapTurns
  );
  assert.ok(!s.turns.some((t) => t && String(t.text).indexOf('stale A') >= 0));
  assert.ok(turnsAfterA >= 1);
}

// ── 4. waiting + user_input → resume: never invent status:running ──
{
  let s = C.emptyChatState();
  s = reduce(s, { type: 'bind', taskId: 't_wait' });
  s = reduce(s, {
    eventId: 'ev_need',
    taskId: 't_wait',
    kind: 'waiting_user_input',
    payload: { question: '哪一天？' }
  });
  assert.equal(s.busy, false);
  assert.ok(s.turns.some((t) => t.kind === 'needs_input'));

  // Clarify reply resume: DTO still waiting → busy stays false (no local running).
  s = reduce(s, {
    type: 'resume_from_waiting',
    driveAlive: false,
    task: {
      taskId: 't_wait',
      status: 'waiting',
      waitingReason: 'user_input'
    }
  });
  assert.equal(s.busy, false);
  assert.equal(s.boundTaskId, 't_wait');
  const proj = C.projectChatAtr({
    taskId: 't_wait',
    status: 'waiting',
    waitingReason: 'user_input'
  });
  assert.equal(proj.status, 'waiting');
  assert.equal(proj.busy, false);

  // After backend resumes, busy follows projected DTO + driveAlive only.
  s = reduce(s, {
    type: 'resume_from_waiting',
    driveAlive: true,
    task: { taskId: 't_wait', status: 'running' }
  });
  assert.equal(s.busy, true);
  assert.doesNotMatch(
    projection,
    /type:\s*'resume_from_waiting'[\s\S]{0,200}status:\s*'running'/
  );
}

// ── 5. stall recovery: same taskId emits at most one recovery turn ──
{
  let s = C.emptyChatState();
  s = reduce(s, { type: 'bind', taskId: 't_stall' });
  s = reduce(s, {
    type: 'stall',
    taskId: 't_stall',
    text: '模型仍在处理'
  });
  assert.equal(
    s.turns.filter((t) => t && t.id === 'recover_t_stall').length,
    1
  );
  assert.equal(s.recoveryEmitted.t_stall, true);

  s = reduce(s, {
    type: 'stall',
    taskId: 't_stall',
    text: '第二次不应出现'
  });
  assert.equal(
    s.turns.filter((t) => t && t.id === 'recover_t_stall').length,
    1
  );
  assert.ok(!s.turns.some((t) => t && String(t.text).indexOf('第二次') >= 0));

  // Direct noteChatRecovery also once-guards.
  s = C.noteChatRecovery(s, 't_stall', 'again');
  assert.equal(
    s.turns.filter((t) => t && t.id === 'recover_t_stall').length,
    1
  );
}

// ── 6. request_user_input → waiting settles thinking chip + needs_input ──
{
  let s = C.emptyChatState();
  s = reduce(s, { type: 'bind', taskId: 't_ask' });
  s = reduce(s, {
    type: 'dto_poll',
    driveAlive: true,
    task: {
      taskId: 't_ask',
      status: 'running',
      liveThinking: 'status|正在调用 request_user_input',
      currentTurn: 3
    }
  });
  assert.ok(s.turns.some((t) => t.id === 'think_t_ask' && t.streaming));

  s = reduce(s, {
    eventId: 'ev_need_ask',
    taskId: 't_ask',
    kind: 'waiting_user',
    payload: { question: '你更关心人数还是名单？' }
  });
  assert.equal(s.busy, false);
  const think = s.turns.find((t) => t && t.id === 'think_t_ask');
  assert.ok(think);
  assert.equal(think.streaming, false);
  assert.equal(think.collapsed, true);
  assert.equal(think.text, '需要你补充');
  assert.ok(
    s.turns.some(
      (t) =>
        t &&
        t.kind === 'needs_input' &&
        String(t.text).indexOf('人数') >= 0
    )
  );
}

assert.match(shell, /ensureChatNeedsInputFromAtr/);
assert.match(shell, /finalizeChatLoopProgressTurn\(\s*tid/);
assert.match(shell, /function resolveChatContinueGoal\(/);
assert.match(shell, /Interrupted chat \+ 「继续」/);
assert.match(shell, /请直接继续回答原问题/);
assert.match(shell, /maybeRecoverUnboundChatStart/);
assert.match(shell, /startAndDrive returned null/);
assert.match(projection, /function looksLikeWorkspaceMetaReply\(/);
assert.match(projection, /function chatContinueMaterialsSummary\(/);
assert.equal(typeof C.looksLikeWorkspaceMetaReply, 'function');
assert.equal(typeof C.resolveChatContinueGoal, 'function');
assert.equal(typeof C.chatContinueMaterialsSummary, 'function');

// ── 7. continue remap: Gate7 task goal yields to last real user ask ──
{
  assert.equal(
    C.looksLikeWorkspaceMetaReply(
      'Gate7 live checklist not_run — ATR Product Regression NOT PASSED'
    ),
    true
  );
  assert.equal(C.looksLikeWorkspaceMetaReply('长沙有多少网红?'), false);
  assert.equal(
    C.resolveChatContinueGoal({
      raw: '继续',
      conflictGoal: '',
      taskGoal: '记录 Gate7 atr-live-provider 验收 not_run',
      prior: '长沙有多少网红?'
    }),
    '长沙有多少网红?'
  );
  assert.equal(
    C.resolveChatContinueGoal({
      raw: '继续',
      conflictGoal: '',
      taskGoal: '长沙有多少网红?',
      prior: '长沙有多少网红?'
    }),
    '长沙有多少网红?'
  );
  const lean = C.chatContinueMaterialsSummary('长沙有多少网红?');
  assert.match(lean, /^user: 长沙有多少网红\?/);
  assert.match(lean, /只回答本 goal/);
  assert.doesNotMatch(lean, /not_run|ATR Product|atr-live-provider/);
}

const chatPrompt = read('src-tauri/src/agent_task_runtime/prompts.rs');
assert.match(chatPrompt, /公开事实\/闲聊禁止用 inspect_workspace/);
assert.match(chatPrompt, /用户说「继续」时继续完成 goal/);

// Continue tokens must not be treated as a new goal string.
assert.match(shell, /继续\\\?\|继续？/);

console.log('test-atr-chat-lifecycle: ok');
