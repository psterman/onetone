/**
 * ATR session projection — DTO → UI busy/pause + pure chat reducers.
 * Never invents ATR task phase; reducers own transcript/busy/binding facts.
 */
(function (global) {
  'use strict';

  function contracts() {
    return global.OneToneRunContracts;
  }

  function chatAtrBusyPhase(st) {
    st = String(st || '');
    return (
      st === 'running' ||
      st === 'verifying' ||
      st === 'repair' ||
      st === 'review' ||
      st === 'intake'
    );
  }

  function projectChatAtr(task) {
    var C = contracts();
    if (C && typeof C.projectAtrTask === 'function') {
      return C.projectAtrTask(task || {});
    }
    var st = String((task && task.status) || '');
    return {
      status: st === 'done' ? 'completed' : st,
      waitingReason:
        (task && (task.waitingReason || task.waiting_reason)) || null,
      busy: chatAtrBusyPhase(st),
      pauseKind: st === 'waiting' ? 'user_input' : null,
      atrStatus: st
    };
  }

  /**
   * @param {object|null} task
   * @param {{ driveAlive?: boolean, optimisticSend?: boolean, stopPendingId?: string, boundTaskId?: string, driveAliveFn?: function }} opts
   * @returns {{ busy: boolean, proj: object }}
   */
  function projectChatBusy(task, opts) {
    opts = opts || {};
    var proj = projectChatAtr(task);
    var tid = String((task && task.taskId) || opts.boundTaskId || '');
    if (opts.stopPendingId && tid && tid === String(opts.stopPendingId)) {
      return { busy: false, proj: proj };
    }
    if (opts.optimisticSend) {
      return { busy: true, proj: proj };
    }
    var alive =
      opts.driveAlive === true ||
      (typeof opts.driveAliveFn === 'function' && opts.driveAliveFn(tid));
    var busy = !!(proj.busy && alive);
    return { busy: busy, proj: proj };
  }

  /** Live SSE / DTO liveThinking → thinking | answer | status | empty. */
  function chatLiveProjection(task) {
    var raw = String(
      (task && (task.liveThinking || task.live_thinking)) || ''
    );
    if (raw.indexOf('answer|') === 0) {
      return { kind: 'answer', text: raw.slice(7) };
    }
    if (raw.indexOf('status|') === 0) {
      return { kind: 'status', text: raw.slice(7) };
    }
    if (raw.trim()) {
      return { kind: 'thinking', text: raw };
    }
    return { kind: 'empty', text: '' };
  }

  function emptyChatState(seed) {
    seed = seed || {};
    return {
      boundTaskId: String(seed.boundTaskId || ''),
      stopPendingId: String(seed.stopPendingId || ''),
      busy: !!seed.busy,
      driveAlive: !!seed.driveAlive,
      turns: Array.isArray(seed.turns) ? seed.turns.slice() : [],
      syncedEv: Object.assign({}, seed.syncedEv || {}),
      recoveryEmitted: Object.assign({}, seed.recoveryEmitted || {}),
      stallTried: Object.assign({}, seed.stallTried || {}),
      healTried: Object.assign({}, seed.healTried || {})
    };
  }

  function cloneState(state) {
    return emptyChatState(state || {});
  }

  /**
   * Ignore ATR events that belong to another task / abandoned cancel noise /
   * already-synced ids while a newer binding is active.
   */
  function shouldIgnoreAtrEvent(binding, event) {
    binding = binding || {};
    event = event || {};
    var bound = String(binding.boundTaskId || '');
    var stop = String(binding.stopPendingId || '');
    var tid = String(event.taskId || event.task_id || '');
    var kind = String(event.kind || '');
    var eid = String(event.eventId || event.event_id || event.id || '');
    var synced = binding.syncedEv || {};
    if (eid && synced[eid]) return true;
    if (stop && tid && tid === stop) {
      // Soft-stop: still allow terminal events for the stopped id to settle.
      if (
        kind !== 'done' &&
        kind !== 'cancelled' &&
        kind !== 'failed' &&
        kind !== 'interrupted'
      ) {
        return true;
      }
    }
    if (bound && tid && bound !== tid) {
      // Late terminal / wait events from a previous task must not mutate B.
      return true;
    }
    if (
      kind === 'cancelled' &&
      /abandoned/i.test(String((event.payload && event.payload.reason) || ''))
    ) {
      return true;
    }
    return false;
  }

  /**
   * Settle streaming answer bubble into one terminal assistant row.
   * Thinking chip (think_<tid>) stays separate.
   */
  function settleChatAnswer(state, answer) {
    state = cloneState(state);
    answer = answer || {};
    var tid = String(answer.taskId || state.boundTaskId || '');
    if (!tid) return state;
    var answerId = 'answer_' + tid;
    var finalId = String(answer.id || 'fin_' + tid);
    var text = String(answer.text || '');
    var kind = String(answer.kind || 'finish');
    var found = false;
    var i;
    for (i = 0; i < state.turns.length; i++) {
      var row = state.turns[i];
      if (!row) continue;
      if (String(row.id) === answerId || String(row.id) === finalId) {
        state.turns[i] = Object.assign({}, row, {
          id: finalId,
          role: 'assistant',
          kind: kind,
          toolName: String(answer.toolName || 'finish'),
          text: text,
          streaming: false,
          toolOk: answer.toolOk !== false
        });
        found = true;
        break;
      }
    }
    if (!found) {
      state.turns.push({
        id: finalId,
        role: 'assistant',
        kind: kind,
        toolName: String(answer.toolName || 'finish'),
        text: text,
        streaming: false,
        toolOk: answer.toolOk !== false
      });
    }
    // Collapse thinking chip label; never convert it into a second answer.
    for (i = 0; i < state.turns.length; i++) {
      if (
        state.turns[i] &&
        String(state.turns[i].id) === 'think_' + tid &&
        state.turns[i].toolName === 'thinking'
      ) {
        state.turns[i] = Object.assign({}, state.turns[i], {
          text: answer.thinkingDoneLabel || '已思考',
          streaming: false,
          collapsed: true
        });
        break;
      }
    }
    state.busy = false;
    if (!answer.keepBinding) {
      state.boundTaskId = '';
      state.stopPendingId = '';
    }
    return state;
  }

  /** Recovery turn for a task at most once. */
  function noteChatRecovery(state, taskId, text) {
    state = cloneState(state);
    taskId = String(taskId || '');
    if (!taskId) return state;
    if (state.recoveryEmitted[taskId]) return state;
    state.recoveryEmitted[taskId] = true;
    var id = 'recover_' + taskId;
    var i;
    for (i = 0; i < state.turns.length; i++) {
      if (state.turns[i] && String(state.turns[i].id) === id) {
        return state;
      }
    }
    state.turns.push({
      id: id,
      role: 'assistant',
      kind: 'chat_conflict',
      text: String(text || '工具循环已中断'),
      toolOk: false
    });
    state.busy = false;
    return state;
  }

  function upsertThinking(state, tid, text) {
    var id = 'think_' + tid;
    var i;
    for (i = 0; i < state.turns.length; i++) {
      if (state.turns[i] && String(state.turns[i].id) === id) {
        state.turns[i] = Object.assign({}, state.turns[i], {
          text: String(text || state.turns[i].text || '思考中…'),
          toolName: 'thinking',
          kind: 'tool_step',
          streaming: true
        });
        return;
      }
    }
    state.turns.push({
      id: id,
      role: 'assistant',
      kind: 'tool_step',
      toolName: 'thinking',
      text: String(text || '思考中…'),
      streaming: true
    });
  }

  function upsertAnswerStream(state, tid, text) {
    var id = 'answer_' + tid;
    var i;
    for (i = 0; i < state.turns.length; i++) {
      if (state.turns[i] && String(state.turns[i].id) === id) {
        state.turns[i] = Object.assign({}, state.turns[i], {
          text: String(text || ''),
          role: 'assistant',
          streaming: true
        });
        return;
      }
    }
    state.turns.push({
      id: id,
      role: 'assistant',
      text: String(text || ''),
      streaming: true
    });
  }

  /**
   * Apply one ATR event (or a dto_poll synthetic event) under current binding.
   * event shapes:
   *   { type:'dto_poll', task }
   *   { type:'cancel_soft', taskId }
   *   { type:'bind', taskId }
   *   { type:'stall', taskId, text }
   *   { type:'resume_from_waiting', task }
   *   ATR event: { eventId, taskId, kind, payload, liveThinking? }
   */
  function reduceChatAtrEvent(state, event) {
    state = cloneState(state);
    event = event || {};
    var typ = String(event.type || '');

    if (typ === 'bind') {
      state.boundTaskId = String(event.taskId || '');
      state.syncedEv = {};
      state.busy = true;
      state.driveAlive = true;
      state.stopPendingId = '';
      return state;
    }

    if (typ === 'cancel_soft') {
      var cid = String(event.taskId || state.boundTaskId || '');
      state.stopPendingId = cid;
      state.busy = false;
      state.driveAlive = false;
      return state;
    }

    if (typ === 'stall') {
      var sid = String(event.taskId || state.boundTaskId || '');
      if (!sid || state.stallTried[sid]) return state;
      state.stallTried[sid] = true;
      return noteChatRecovery(
        state,
        sid,
        event.text || '模型仍在处理，等待下一步或超时结果'
      );
    }

    if (typ === 'resume_from_waiting') {
      // Never invent status:running — busy follows projected DTO only.
      var taskR = event.task || {};
      var projR = projectChatAtr(taskR);
      state.boundTaskId = String(taskR.taskId || state.boundTaskId || '');
      var busyR = projectChatBusy(taskR, {
        boundTaskId: state.boundTaskId,
        stopPendingId: state.stopPendingId,
        driveAlive: !!event.driveAlive
      });
      state.busy = busyR.busy;
      state.driveAlive = !!event.driveAlive && projR.busy;
      if (projR.status === 'waiting' || projR.status === 'interrupted') {
        // Keep binding; do not force a fake running paint row.
        return state;
      }
      return state;
    }

    if (typ === 'dto_poll') {
      var task = event.task || {};
      var tid = String(task.taskId || '');
      if (
        tid &&
        state.boundTaskId &&
        tid !== state.boundTaskId &&
        String(task.status || '') !== 'cancelled' &&
        String(task.status || '') !== 'done' &&
        String(task.status || '') !== 'failed'
      ) {
        // Rebind only for non-terminal foreign tasks (matches HA2 sync).
        state.boundTaskId = tid;
        state.syncedEv = {};
      }
      var busyOut = projectChatBusy(task, {
        boundTaskId: state.boundTaskId,
        stopPendingId: state.stopPendingId,
        driveAlive: state.driveAlive || !!event.driveAlive
      });
      state.busy = busyOut.busy;
      var live = chatLiveProjection(task);
      var paintTid = String(state.boundTaskId || tid || '');
      if (paintTid && (live.kind === 'thinking' || live.kind === 'status')) {
        // status|正在调用 X matches HA2 progress chip (not a separate answer bubble).
        upsertThinking(
          state,
          paintTid,
          live.kind === 'status'
            ? live.text +
                (task.currentTurn
                  ? ' · 第 ' + Number(task.currentTurn) + ' 步'
                  : '')
            : live.text
        );
      } else if (paintTid && live.kind === 'answer') {
        upsertAnswerStream(state, paintTid, live.text);
      }
      var st = String(task.status || '');
      if (st === 'waiting' || st === 'done' || st === 'failed' || st === 'cancelled' || st === 'interrupted') {
        if (!(state.stopPendingId && tid === state.stopPendingId && st === 'running')) {
          // terminal/waiting clear busy; cancelled soft-stop already cleared
        }
        if (st === 'waiting' || st === 'interrupted') {
          state.busy = false;
          state.driveAlive = false;
        }
      }
      return state;
    }

    // Standard ATR event
    var atrEv = {
      eventId: event.eventId || event.event_id || event.id,
      taskId: event.taskId || event.task_id,
      kind: event.kind,
      payload: event.payload || {}
    };
    if (
      shouldIgnoreAtrEvent(
        {
          boundTaskId: state.boundTaskId,
          stopPendingId: state.stopPendingId,
          syncedEv: state.syncedEv
        },
        atrEv
      )
    ) {
      var ignoreEid = String(atrEv.eventId || '');
      if (ignoreEid) state.syncedEv[ignoreEid] = true;
      return state;
    }

    var eid = String(atrEv.eventId || '');
    var kind = String(atrEv.kind || '');
    var etid = String(atrEv.taskId || state.boundTaskId || '');
    if (eid) state.syncedEv[eid] = true;

    if (kind === 'done' || kind === 'task_done') {
      var summary =
        (atrEv.payload && atrEv.payload.summary) || '已完成';
      state = settleChatAnswer(state, {
        taskId: etid,
        id: 'fin_' + etid,
        text: summary,
        kind: 'finish',
        toolName: 'finish',
        toolOk: true
      });
      return state;
    }

    if (
      kind === 'cancelled' ||
      kind === 'failed' ||
      kind === 'model_error' ||
      kind === 'format_error'
    ) {
      state = settleChatAnswer(state, {
        taskId: etid,
        id: 'err_' + (eid || etid),
        text: String(
          (atrEv.payload && (atrEv.payload.message || atrEv.payload.reason)) ||
            kind
        ),
        kind: 'finish',
        toolOk: false
      });
      state.busy = false;
      state.driveAlive = false;
      if (state.stopPendingId === etid) state.stopPendingId = '';
      return state;
    }

    if (kind === 'waiting_user' || kind === 'waiting_user_input') {
      state.busy = false;
      state.driveAlive = false;
      // Collapse live thinking / "正在调用 request_user_input" paint.
      var thinkId = 'think_' + etid;
      for (var wi = 0; wi < state.turns.length; wi++) {
        if (state.turns[wi] && String(state.turns[wi].id) === thinkId) {
          state.turns[wi] = Object.assign({}, state.turns[wi], {
            text: '需要你补充',
            streaming: false,
            collapsed: true
          });
          break;
        }
      }
      state.turns.push({
        id: 'need_' + (eid || etid),
        role: 'assistant',
        kind: 'needs_input',
        text: String(
          (atrEv.payload && (atrEv.payload.question || atrEv.payload.prompt)) ||
            '需要补充'
        )
      });
      return state;
    }

    if (kind === 'interrupted' || kind === 'task_interrupted') {
      state.busy = false;
      state.driveAlive = false;
      return noteChatRecovery(state, etid, atrEv.payload && atrEv.payload.message);
    }

    return state;
  }

  /** Gate7 / acceptance essays — must not steal 「继续」 or prior_chat. */
  function looksLikeWorkspaceMetaReply(body) {
    return /Gate7|ATR Product|atr-live-provider|not_run|permission_mode\s*=\s*read_only|离线回归|验收记录|ONETONE_GATE7|整体.*NOT PASSED|Live WorkBuddy/i.test(
      String(body || '')
    );
  }

  /**
   * Pure continue-goal remap.
   * @param {{ raw?: string, conflictGoal?: string, taskGoal?: string, prior?: string }} parts
   */
  function resolveChatContinueGoal(parts) {
    parts = parts || {};
    var raw = String(parts.raw || '').trim();
    var conflictGoal = String(parts.conflictGoal || '').trim();
    var taskGoal = String(parts.taskGoal || '').trim();
    var prior = String(parts.prior || '').trim();
    if (prior && looksLikeWorkspaceMetaReply(taskGoal)) return prior;
    if (prior && looksLikeWorkspaceMetaReply(conflictGoal)) return prior;
    return String(conflictGoal || taskGoal || prior || raw).trim();
  }

  /** Lean prior_chat for 「继续」redrive — never re-inject a Gate7 essay. */
  function chatContinueMaterialsSummary(goal) {
    var g = String(goal || '').trim();
    return (
      (g ? 'user: ' + g + '\n' : '') +
      '(系统: 用户点了继续；只回答本 goal。忽略会话里跑偏的仓库/验收/Gate7 汇报。)'
    );
  }

  global.OneToneAtrSessionProjection = {
    chatAtrBusyPhase: chatAtrBusyPhase,
    projectChatAtr: projectChatAtr,
    projectChatBusy: projectChatBusy,
    chatLiveProjection: chatLiveProjection,
    emptyChatState: emptyChatState,
    shouldIgnoreAtrEvent: shouldIgnoreAtrEvent,
    settleChatAnswer: settleChatAnswer,
    noteChatRecovery: noteChatRecovery,
    reduceChatAtrEvent: reduceChatAtrEvent,
    looksLikeWorkspaceMetaReply: looksLikeWorkspaceMetaReply,
    resolveChatContinueGoal: resolveChatContinueGoal,
    chatContinueMaterialsSummary: chatContinueMaterialsSummary
  };
})(typeof window !== 'undefined' ? window : globalThis);
