/**
 * Task-scoped conversation journal: tasks + mixed timeline events.
 * Migrates wbChatTurns + PromptPrep handoffs once into onetone.ha2.taskJournal.v1.
 */
(function (global) {
  'use strict';

  var KEY = 'onetone.ha2.taskJournal.v1';
  var WB_CHAT_KEY = 'onetone.ha2.wbChat.v1';
  var MAX_EVENTS = 400;
  var MAX_TASKS = 80;
  var MIGRATE_FLAG = 'onetone.ha2.taskJournal.migrated.v1';

  var AGENT_ICONS = {
    workbuddy: 'icons/app-target/workbuddy.png',
    codex: 'icons/app-target/codex.png',
    cursor: 'icons/app-target/cursor.png',
    claude: 'icons/app-target/claude.png',
    gemini: 'icons/app-target/gemini.png',
    qoder: 'icons/app-target/qoder.png',
    trae: 'icons/app-target/trae.png'
  };

  function now() {
    return Date.now();
  }

  function nid(prefix) {
    return (
      String(prefix || 'x') +
      '_' +
      now().toString(36) +
      '_' +
      Math.floor(Math.random() * 1e4)
    );
  }

  function emptyState() {
    return { tasks: [], activeTaskId: '', events: [] };
  }

  function loadRaw() {
    try {
      var raw = global.localStorage && global.localStorage.getItem(KEY);
      if (!raw) return emptyState();
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return emptyState();
      return {
        tasks: Array.isArray(parsed.tasks) ? parsed.tasks.filter(Boolean) : [],
        activeTaskId: String(parsed.activeTaskId || ''),
        events: Array.isArray(parsed.events) ? parsed.events.filter(Boolean) : []
      };
    } catch (_) {
      return emptyState();
    }
  }

  function save(state) {
    try {
      if (!global.localStorage) return;
      if (state.tasks.length > MAX_TASKS) {
        state.tasks = state.tasks.slice(-MAX_TASKS);
      }
      if (state.events.length > MAX_EVENTS) {
        state.events = state.events.slice(-MAX_EVENTS);
      }
      global.localStorage.setItem(KEY, JSON.stringify(state));
    } catch (_) {}
  }

  function touchTask(state, taskId, at) {
    for (var i = 0; i < state.tasks.length; i++) {
      if (String(state.tasks[i].id) === String(taskId)) {
        state.tasks[i].updatedAt = at || now();
        return state.tasks[i];
      }
    }
    return null;
  }

  function findTask(state, taskId) {
    for (var i = 0; i < state.tasks.length; i++) {
      if (String(state.tasks[i].id) === String(taskId)) return state.tasks[i];
    }
    return null;
  }

  /** Task carries a delivery marker → lives under 工作, not 对话. */
  function taskHasDelivery(state, taskId) {
    var id = String(taskId || '');
    if (!id) return false;
    for (var i = 0; i < state.events.length; i++) {
      var ev = state.events[i];
      if (!ev || String(ev.taskId) !== id) continue;
      var k = String(ev.kind || '');
      if (k === 'handoff' || k === 'receipt') return true;
    }
    return false;
  }

  function isChatLaneTask(state, taskId) {
    var t = findTask(state, taskId);
    if (!t || t.archived) return false;
    if (String(t.lane || '') === 'work') return false;
    return !taskHasDelivery(state, taskId);
  }

  function isWorkLaneTask(state, taskId) {
    var t = findTask(state, taskId);
    if (!t || t.archived) return false;
    if (String(t.lane || '') === 'work') return true;
    return taskHasDelivery(state, taskId);
  }

  function ensureActive(state) {
    if (state.activeTaskId) {
      for (var i = 0; i < state.tasks.length; i++) {
        if (String(state.tasks[i].id) === String(state.activeTaskId) && !state.tasks[i].archived) {
          return state.activeTaskId;
        }
      }
    }
    for (var j = state.tasks.length - 1; j >= 0; j--) {
      if (!state.tasks[j].archived) {
        state.activeTaskId = state.tasks[j].id;
        return state.activeTaskId;
      }
    }
    var t = createTaskInternal(state, { title: '本机对话', lane: 'chat' });
    return t.id;
  }

  /** Prefer a delivery-free chat task — never append 对话 turns onto 投递 threads. */
  function ensureChatTask(state) {
    if (state.activeTaskId && isChatLaneTask(state, state.activeTaskId)) {
      return state.activeTaskId;
    }
    for (var j = state.tasks.length - 1; j >= 0; j--) {
      if (isChatLaneTask(state, state.tasks[j].id)) {
        state.activeTaskId = state.tasks[j].id;
        return state.activeTaskId;
      }
    }
    var t = createTaskInternal(state, { title: '本机对话', lane: 'chat' });
    return t.id;
  }

  /** Handoffs/receipts land on a work task — never convert the active chat thread. */
  function ensureWorkTask(state) {
    if (state.activeTaskId && isWorkLaneTask(state, state.activeTaskId)) {
      return state.activeTaskId;
    }
    for (var j = state.tasks.length - 1; j >= 0; j--) {
      if (isWorkLaneTask(state, state.tasks[j].id)) {
        state.activeTaskId = state.tasks[j].id;
        return state.activeTaskId;
      }
    }
    var t = createTaskInternal(state, { title: '投递记录', lane: 'work' });
    return t.id;
  }

  function createTaskInternal(state, opts) {
    opts = opts || {};
    var at = now();
    var lane = opts.lane === 'work' ? 'work' : opts.lane === 'chat' ? 'chat' : '';
    var task = {
      id: nid('task'),
      title: String(opts.title || '新任务').trim() || '新任务',
      createdAt: at,
      updatedAt: at,
      projectPath: opts.projectPath ? String(opts.projectPath) : '',
      pinned: !!opts.pinned,
      archived: !!opts.archived,
      lane: lane
    };
    state.tasks.push(task);
    if (opts.activate !== false) state.activeTaskId = task.id;
    return task;
  }

  function migrateOnce() {
    try {
      if (global.localStorage && global.localStorage.getItem(MIGRATE_FLAG)) return;
    } catch (_) {}
    var state = loadRaw();
    if (state.tasks.length || state.events.length) {
      try {
        if (global.localStorage) global.localStorage.setItem(MIGRATE_FLAG, '1');
      } catch (_) {}
      return;
    }

    var wbTurns = [];
    try {
      var wbRaw = global.localStorage && global.localStorage.getItem(WB_CHAT_KEY);
      if (wbRaw) {
        var wb = JSON.parse(wbRaw);
        wbTurns = Array.isArray(wb && wb.turns) ? wb.turns.filter(Boolean) : [];
      }
    } catch (_) {}

    var handoffs = [];
    var Prep = global.OneToneHomePromptPrep;
    if (Prep && typeof Prep.listHandoffs === 'function') {
      try {
        handoffs = Prep.listHandoffs() || [];
      } catch (_) {}
    }

    if (!wbTurns.length && !handoffs.length) {
      createTaskInternal(state, { title: '本机对话', lane: 'chat' });
      save(state);
      try {
        if (global.localStorage) global.localStorage.setItem(MIGRATE_FLAG, '1');
      } catch (_) {}
      return;
    }

    if (wbTurns.length) {
      var chatTask = createTaskInternal(state, { title: '本机对话', lane: 'chat' });
      wbTurns.forEach(function (turn) {
        state.events.push({
          id: turn.id || nid('ev'),
          taskId: chatTask.id,
          at: turn.at || now(),
          kind: 'chat_turn',
          agentKind: 'workbuddy',
          role: turn.role === 'assistant' ? 'assistant' : 'user',
          text: String(turn.text || ''),
          meta: { model: turn.model || '', accountId: turn.accountId || '' }
        });
      });
      chatTask.updatedAt = wbTurns[wbTurns.length - 1].at || chatTask.updatedAt;
    }

    if (handoffs.length) {
      var sendTask = createTaskInternal(state, {
        title: '投递记录',
        lane: 'work',
        activate: !wbTurns.length
      });
      // listHandoffs is newest-first; store chronological
      handoffs
        .slice()
        .reverse()
        .forEach(function (h) {
          var at = Date.parse(String(h.handedOffAt || '')) || now();
          state.events.push({
            id: h.id || nid('ev'),
            taskId: sendTask.id,
            at: at,
            kind: 'handoff',
            agentKind: String(h.targetKind || 'agent'),
            role: 'user',
            text: String(h.body || h.preview || h.title || ''),
            meta: {
              title: h.title || '',
              outcome: h.outcome || '',
              chars: h.chars || 0,
              source: h.source || ''
            }
          });
        });
      if (handoffs[0] && handoffs[0].handedOffAt) {
        sendTask.updatedAt = Date.parse(String(handoffs[0].handedOffAt)) || sendTask.updatedAt;
      }
    }

    ensureActive(state);
    save(state);
    try {
      if (global.localStorage) global.localStorage.setItem(MIGRATE_FLAG, '1');
    } catch (_) {}
  }

  function withState(fn) {
    migrateOnce();
    var state = loadRaw();
    var result = fn(state);
    save(state);
    return result;
  }

  function listTasks(opts) {
    opts = opts || {};
    migrateOnce();
    var state = loadRaw();
    var archived = !!opts.archived;
    var q = String(opts.query || '')
      .trim()
      .toLowerCase();
    var rows = state.tasks.filter(function (t) {
      if (!!t.archived !== archived) return false;
      if (!q) return true;
      if (String(t.title || '').toLowerCase().indexOf(q) >= 0) return true;
      return state.events.some(function (ev) {
        return (
          String(ev.taskId) === String(t.id) &&
          String(ev.text || '')
            .toLowerCase()
            .indexOf(q) >= 0
        );
      });
    });
    rows.sort(function (a, b) {
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });
    return rows;
  }

  function getActiveTaskId() {
    return withState(function (state) {
      return ensureActive(state);
    });
  }

  function setActiveTask(id) {
    return withState(function (state) {
      for (var i = 0; i < state.tasks.length; i++) {
        if (String(state.tasks[i].id) === String(id) && !state.tasks[i].archived) {
          state.activeTaskId = state.tasks[i].id;
          return state.tasks[i];
        }
      }
      return null;
    });
  }

  function createTask(opts) {
    return withState(function (state) {
      return createTaskInternal(state, opts || {});
    });
  }

  function renameTask(id, title) {
    return withState(function (state) {
      title = String(title || '').trim();
      if (!title) return null;
      for (var i = 0; i < state.tasks.length; i++) {
        if (String(state.tasks[i].id) === String(id)) {
          state.tasks[i].title = title;
          state.tasks[i].updatedAt = now();
          return state.tasks[i];
        }
      }
      return null;
    });
  }

  function setPinned(ids, pinned) {
    ids = Array.isArray(ids) ? ids : [ids];
    return withState(function (state) {
      var n = 0;
      ids.forEach(function (id) {
        for (var i = 0; i < state.tasks.length; i++) {
          if (String(state.tasks[i].id) === String(id)) {
            state.tasks[i].pinned = !!pinned;
            state.tasks[i].updatedAt = now();
            n++;
            break;
          }
        }
      });
      return n;
    });
  }

  function setArchived(ids, archived) {
    ids = Array.isArray(ids) ? ids : [ids];
    return withState(function (state) {
      var n = 0;
      ids.forEach(function (id) {
        for (var i = 0; i < state.tasks.length; i++) {
          if (String(state.tasks[i].id) === String(id)) {
            state.tasks[i].archived = !!archived;
            if (archived && String(state.activeTaskId) === String(id)) {
              state.activeTaskId = '';
            }
            state.tasks[i].updatedAt = now();
            n++;
            break;
          }
        }
      });
      ensureActive(state);
      return n;
    });
  }

  function deleteTasks(ids) {
    ids = Array.isArray(ids) ? ids : [ids];
    var set = {};
    ids.forEach(function (id) {
      set[String(id)] = true;
    });
    return withState(function (state) {
      var before = state.tasks.length;
      state.tasks = state.tasks.filter(function (t) {
        return !set[String(t.id)];
      });
      state.events = state.events.filter(function (ev) {
        return !set[String(ev.taskId)];
      });
      if (set[String(state.activeTaskId)]) state.activeTaskId = '';
      ensureActive(state);
      return before - state.tasks.length;
    });
  }

  function listEvents(taskId, limit) {
    migrateOnce();
    var state = loadRaw();
    var rows = state.events.filter(function (ev) {
      return String(ev.taskId) === String(taskId);
    });
    rows.sort(function (a, b) {
      return (a.at || 0) - (b.at || 0);
    });
    if (typeof limit === 'number' && limit > 0) rows = rows.slice(-limit);
    return rows;
  }

  function eventCount(taskId) {
    migrateOnce();
    var state = loadRaw();
    var n = 0;
    for (var i = 0; i < state.events.length; i++) {
      if (String(state.events[i].taskId) === String(taskId)) n++;
    }
    return n;
  }

  function agentKindsForTask(taskId) {
    migrateOnce();
    var state = loadRaw();
    var seen = {};
    var out = [];
    state.events.forEach(function (ev) {
      if (String(ev.taskId) !== String(taskId)) return;
      var k = String(ev.agentKind || '');
      if (!k || seen[k]) return;
      seen[k] = true;
      out.push(k);
    });
    return out;
  }

  function appendEvent(ev) {
    return withState(function (state) {
      return appendEventInState(state, ev);
    });
  }

  function appendChatTurn(turn) {
    turn = turn || {};
    return withState(function (state) {
      var taskId = String(turn.taskId || '');
      if (!taskId || !isChatLaneTask(state, taskId)) {
        taskId = ensureChatTask(state);
      } else {
        state.activeTaskId = taskId;
      }
      // First user line becomes the list title when still the default.
      var text = String(turn.text || '').trim();
      if (turn.role !== 'assistant' && text) {
        var task = findTask(state, taskId);
        if (task && (!task.title || task.title === '本机对话' || task.title === '新任务')) {
          task.title = text.length > 28 ? text.slice(0, 27) + '…' : text;
        }
      }
      return appendEventInState(state, {
        id: turn.id,
        taskId: taskId,
        at: turn.at,
        kind: 'chat_turn',
        agentKind: turn.agentKind || 'workbuddy',
        role: turn.role,
        text: turn.text,
        meta: {
          model: turn.model || '',
          accountId: turn.accountId || '',
          providerId: turn.providerId || '',
          toolName: turn.toolName || '',
          toolOk: turn.toolOk,
          collapsed: turn.collapsed
        }
      });
    });
  }

  /** Persist a collapsible tool step (search / fetch / deliver / …) on the chat task. */
  function appendToolEvent(ev) {
    ev = ev || {};
    return withState(function (state) {
      var taskId = String(ev.taskId || '');
      if (!taskId || !isChatLaneTask(state, taskId)) {
        taskId = ensureChatTask(state);
      } else {
        state.activeTaskId = taskId;
      }
      return appendEventInState(state, {
        id: ev.id,
        taskId: taskId,
        at: ev.at,
        kind: ev.kind || 'tool_step',
        agentKind: ev.agentKind || 'atr',
        role: 'assistant',
        text: String(ev.text || ev.summary || ev.toolName || ''),
        meta: {
          toolName: ev.toolName || '',
          toolOk: ev.toolOk !== false,
          detail: ev.detail || '',
          atrTaskId: ev.atrTaskId || '',
          collapsed: ev.collapsed !== false,
          approvalToken: ev.approvalToken || ''
        }
      });
    });
  }

  function eventToChatTurn(ev) {
    if (!ev) return null;
    var kind = String(ev.kind || '');
    if (
      kind !== 'chat_turn' &&
      kind !== 'tool_step' &&
      kind !== 'needs_input' &&
      kind !== 'deliver_approval' &&
      kind !== 'finish'
    ) {
      return null;
    }
    var meta = ev.meta || {};
    return {
      id: ev.id,
      at: ev.at,
      role: ev.role === 'user' ? 'user' : 'assistant',
      text: String(ev.text || ''),
      model: meta.model || '',
      providerId: meta.providerId || '',
      accountId: meta.accountId || '',
      kind: kind === 'chat_turn' ? undefined : kind,
      toolName: meta.toolName || '',
      toolOk: meta.toolOk,
      detail: meta.detail || '',
      collapsed: meta.collapsed !== false,
      approvalToken: meta.approvalToken || ''
    };
  }

  function listChatTurns(taskId) {
    migrateOnce();
    var id = String(taskId || getActiveTaskId() || '');
    if (!id) return [];
    return listEvents(id)
      .map(eventToChatTurn)
      .filter(Boolean);
  }

  function clearChatTurns(taskId) {
    return withState(function (state) {
      var id = String(taskId || state.activeTaskId || '');
      if (!id) return 0;
      var before = state.events.length;
      state.events = state.events.filter(function (ev) {
        if (String(ev.taskId) !== id) return true;
        var k = String(ev.kind || '');
        return (
          k !== 'chat_turn' &&
          k !== 'tool_step' &&
          k !== 'needs_input' &&
          k !== 'deliver_approval' &&
          k !== 'finish'
        );
      });
      touchTask(state, id, now());
      return before - state.events.length;
    });
  }

  function appendHandoff(h) {
    h = h || {};
    return withState(function (state) {
      var taskId = String(h.taskId || '');
      // Explicit work task id ok; never pin a handoff onto a clean chat thread.
      if (!taskId || isChatLaneTask(state, taskId)) {
        taskId = ensureWorkTask(state);
      } else {
        state.activeTaskId = taskId;
        var wt = findTask(state, taskId);
        if (wt) wt.lane = 'work';
      }
      return appendEventInState(state, {
        id: h.id,
        taskId: taskId,
        at: h.at || (h.handedOffAt ? Date.parse(String(h.handedOffAt)) : now()),
        kind: 'handoff',
        agentKind: String(h.targetKind || h.agentKind || 'agent'),
        role: 'user',
        text: String(h.body || h.preview || h.title || ''),
        meta: {
          title: h.title || '',
          outcome: h.outcome || '',
          chars: h.chars || 0,
          source: h.source || ''
        }
      });
    });
  }

  function appendReceipt(r) {
    r = r || {};
    return withState(function (state) {
      var taskId = String(r.taskId || '');
      if (!taskId || isChatLaneTask(state, taskId)) {
        taskId = ensureWorkTask(state);
      } else {
        state.activeTaskId = taskId;
        var wt = findTask(state, taskId);
        if (wt) wt.lane = 'work';
      }
      return appendEventInState(state, {
        id: r.id,
        taskId: taskId,
        at: r.at,
        kind: 'receipt',
        agentKind: String(r.agentKind || r.targetKind || 'agent'),
        role: 'assistant',
        text: String(r.text || r.message || ''),
        meta: {
          outcome: r.outcome || '',
          verified: !!r.verified
        }
      });
    });
  }

  function appendEventInState(state, ev) {
    ev = ev || {};
    var taskId = String(ev.taskId || '') || ensureActive(state);
    var at = ev.at || now();
    var row = {
      id: ev.id || nid('ev'),
      taskId: taskId,
      at: at,
      kind: ev.kind || 'chat_turn',
      agentKind: String(ev.agentKind || 'workbuddy'),
      role: ev.role === 'assistant' ? 'assistant' : ev.role === 'system' ? 'system' : 'user',
      text: String(ev.text || ''),
      meta: ev.meta && typeof ev.meta === 'object' ? ev.meta : {}
    };
    if (!row.text && (row.kind === 'chat_turn' || row.kind === 'finish')) return null;
    for (var i = 0; i < state.events.length; i++) {
      if (String(state.events[i].id) === String(row.id)) {
        state.events[i] = row;
        touchTask(state, taskId, at);
        return row;
      }
    }
    state.events.push(row);
    touchTask(state, taskId, at);
    return row;
  }

  function latestUserText(taskId) {
    var rows = listEvents(taskId);
    for (var i = rows.length - 1; i >= 0; i--) {
      var ev = rows[i];
      if ((ev.role === 'user' || ev.kind === 'handoff') && String(ev.text || '').trim()) {
        return String(ev.text);
      }
    }
    return '';
  }

  function iconForAgent(kind) {
    kind = String(kind || '').toLowerCase();
    return AGENT_ICONS[kind] || '';
  }

  function getTask(id) {
    migrateOnce();
    var state = loadRaw();
    for (var i = 0; i < state.tasks.length; i++) {
      if (String(state.tasks[i].id) === String(id)) return state.tasks[i];
    }
    return null;
  }

  global.OneToneHomeTaskJournal = {
    KEY: KEY,
    migrateOnce: migrateOnce,
    listTasks: listTasks,
    getTask: getTask,
    getActiveTaskId: getActiveTaskId,
    setActiveTask: setActiveTask,
    createTask: createTask,
    renameTask: renameTask,
    setPinned: setPinned,
    setArchived: setArchived,
    deleteTasks: deleteTasks,
    listEvents: listEvents,
    eventCount: eventCount,
    agentKindsForTask: agentKindsForTask,
    appendChatTurn: appendChatTurn,
    appendToolEvent: appendToolEvent,
    listChatTurns: listChatTurns,
    clearChatTurns: clearChatTurns,
    appendHandoff: appendHandoff,
    appendReceipt: appendReceipt,
    latestUserText: latestUserText,
    iconForAgent: iconForAgent,
    // Test / directory helpers
    isChatLaneTaskId: function (taskId) {
      migrateOnce();
      return isChatLaneTask(loadRaw(), taskId);
    },
    isWorkLaneTaskId: function (taskId) {
      migrateOnce();
      return isWorkLaneTask(loadRaw(), taskId);
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
